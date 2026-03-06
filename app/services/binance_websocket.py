"""
Binance WebSocket Manager: maintains a 24/7 connection to Binance's WebSocket API,
fetches 1 kline per token for all tokens, caches prices in memory, and streams updates
to connected frontend clients.

Uses the klines request from:
https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/market-data-requests#klines
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections import deque
from typing import Final

import websockets
from fastapi import WebSocket
from redis import Connection, ConnectionPool, Redis, SSLConnection
from sqlalchemy import text

from app.core.config import settings
from app.db.session import SessionLocal, get_tables
from app.services import candle_engine, firebase_fcm, signal_detection

LOGGER = logging.getLogger(__name__)

BINANCE_ENDPOINT: Final[str] = "wss://ws-api.binance.com:443/ws-api/v3"
# Request a couple of klines so we can reliably pick the latest *closed* 1m candle
# (otherwise we may re-process the still-forming candle and drift indicators).
KLINES_LIMIT: Final[int] = 2
RECONNECT_DELAY_SECONDS: Final[int] = 5

# Candle buffer sizes per plan
MAX_1M_CANDLES: Final[int] = 1440
MAX_HIGHER_TF_CANDLES: Final[int] = 250
HIGHER_TIMEFRAMES: Final[tuple[str, ...]] = ("5m", "30m", "1h", "4h", "1d")
ALL_TIMEFRAMES: Final[tuple[str, ...]] = ("1m",) + HIGHER_TIMEFRAMES

# Binance kline array indices per https://developers.binance.com/docs/binance-spot-api-docs/websocket-api/market-data-requests#klines
KLINE_OPEN_TIME = 0
KLINE_OPEN = 1
KLINE_HIGH = 2
KLINE_LOW = 3
KLINE_CLOSE = 4
KLINE_VOLUME = 5
KLINE_CLOSE_TIME = 6
KLINE_QUOTE_ASSET_VOLUME = 7
KLINE_NUMBER_OF_TRADES = 8
KLINE_TAKER_BUY_BASE_ASSET_VOLUME = 9
KLINE_TAKER_BUY_QUOTE_ASSET_VOLUME = 10


def _kline_array_to_dict(arr: list) -> dict:
    """Convert Binance kline array to a dictionary with named fields."""
    if not isinstance(arr, (list, tuple)) or len(arr) < 11:
        return {}
    return {
        "openTime": arr[KLINE_OPEN_TIME],
        "open": arr[KLINE_OPEN],
        "high": arr[KLINE_HIGH],
        "low": arr[KLINE_LOW],
        "close": arr[KLINE_CLOSE],
        "volume": arr[KLINE_VOLUME],
        "closeTime": arr[KLINE_CLOSE_TIME],
        "quoteAssetVolume": arr[KLINE_QUOTE_ASSET_VOLUME],
        "numberOfTrades": arr[KLINE_NUMBER_OF_TRADES],
        "takerBuyBaseAssetVolume": arr[KLINE_TAKER_BUY_BASE_ASSET_VOLUME],
        "takerBuyQuoteAssetVolume": arr[KLINE_TAKER_BUY_QUOTE_ASSET_VOLUME],
    }


def _klines_result_to_dicts(result: list) -> list[dict]:
    """Convert Binance klines result (list of arrays) to list of dicts."""
    return [_kline_array_to_dict(item) for item in result if item]


def _pick_latest_closed_kline(klines: list[dict]) -> dict | None:
    """
    Pick the most recent kline whose closeTime is not in the future.
    This avoids repeatedly ingesting the still-forming candle.
    """
    if not klines:
        return None
    now_ms = int(time.time() * 1000)
    closed = []
    for k in klines:
        try:
            close_ms = int(k.get("closeTime", 0))
        except Exception:
            continue
        if close_ms and close_ms <= now_ms:
            closed.append(k)
    if not closed:
        return None
    return max(closed, key=lambda x: int(x.get("openTime", 0) or 0))


def _timeframe_seconds(tf: str) -> int:
    tf = (tf or "").strip().lower()
    if tf.endswith("m"):
        return int(tf[:-1]) * 60
    if tf.endswith("h"):
        return int(tf[:-1]) * 3600
    if tf.endswith("d"):
        return int(tf[:-1]) * 86400
    return 60


def _dedupe_ttl_seconds(tf: str) -> int:
    # Keep entries long enough to span the candle boundary even with jitter/retries.
    return max(600, _timeframe_seconds(tf) * 2)


def _load_symbols_from_db() -> list[str]:
    """
    Load distinct symbols from p5m table with recent data (open_time > now - 1800).
    Uses SCHEMA_1 from settings.
    """
    tables = get_tables(settings.SCHEMA_1)
    table_5m = tables["p5m"]
    query = f"""
        SELECT DISTINCT symbol
        FROM {table_5m}
        WHERE open_time > extract(epoch from now())::bigint - 1800
        ORDER BY symbol
    """
    db = SessionLocal()
    try:
        result = db.execute(text(query)).fetchall()
        symbols = [row.symbol for row in result if row.symbol]
        return [str(s).strip().upper() for s in symbols if str(s).strip()]
    except Exception as e:
        LOGGER.warning("Failed to load symbols from DB: %s", e)
        return []
    finally:
        db.close()


class BinanceWebSocketManager:
    """Singleton service: 24/7 Binance connection, fetches all tokens, broadcasts to clients."""

    _instance: BinanceWebSocketManager | None = None

    def __new__(cls) -> BinanceWebSocketManager:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if hasattr(self, "_initialized") and self._initialized:
            return
        self._initialized = True
        self._cache: dict[str, dict] = {}
        self._clients: set[WebSocket] = set()
        self._task: asyncio.Task[None] | None = None
        self._shutdown = asyncio.Event()
        self._interval = getattr(settings, "BINANCE_WS_INTERVAL", "1m") or "1m"
        self._poll_interval = getattr(settings, "BINANCE_WS_POLL_INTERVAL_SECONDS", 60) or 60
        self._symbol_refresh_minutes = getattr(settings, "BINANCE_WS_SYMBOL_REFRESH_MINUTES", 60) or 60
        # Per-symbol, per-timeframe candle buffers and indicators (candle_engine types)
        self._candles: dict[str, dict[str, deque]] = {}
        self._indicators: dict[str, dict[str, dict[int, dict]]] = {}
        self._indicator_state: dict[str, dict[str, candle_engine.IndicatorState]] = {}
        # Per (symbol, tf, open_time, signal_id) notification dedupe.
        # Prefer Redis if configured; otherwise fall back to in-memory TTL map.
        self._notify_pool: ConnectionPool | None = None
        self._notify_mem: dict[str, float] = {}
        if settings.REDIS_HOST is not None and str(settings.REDIS_HOST).strip():
            try:
                self._notify_pool = ConnectionPool(
                    host=settings.REDIS_HOST,
                    port=settings.REDIS_PORT,
                    socket_connect_timeout=0.05,
                    socket_timeout=1,
                    retry_on_timeout=False,
                    max_connections=settings.REDIS_MAX_CONNECTIONS,
                    connection_class=SSLConnection if settings.REDIS_SSL else Connection,
                )
            except Exception:
                self._notify_pool = None

    def register_client(self, websocket: WebSocket) -> None:
        """Register a frontend client. Caller should send snapshot after."""
        self._clients.add(websocket)

    def unregister_client(self, websocket: WebSocket) -> None:
        """Remove a frontend client on disconnect."""
        self._clients.discard(websocket)

    def _ensure_symbol_buffers(self, symbol: str) -> None:
        """Initialize candle deques and indicator structures for a symbol if missing."""
        if symbol in self._candles:
            return
        self._candles[symbol] = {
            "1m": deque(maxlen=MAX_1M_CANDLES),
            **{tf: deque(maxlen=MAX_HIGHER_TF_CANDLES) for tf in HIGHER_TIMEFRAMES},
        }
        self._indicators[symbol] = {tf: {} for tf in ALL_TIMEFRAMES}
        self._indicator_state[symbol] = {
            tf: candle_engine.IndicatorState() for tf in ALL_TIMEFRAMES
        }

    def _step_and_store_indicators(
        self,
        symbol: str,
        tf: str,
        candle: candle_engine.Candle,
        prev_candle: candle_engine.Candle | None,
        candle_count: int,
    ) -> None:
        """Run one indicator step for a candle and store result; trim indicator dict size."""
        state = self._indicator_state[symbol][tf]
        new_state, ind = candle_engine.step_indicators(state, candle, prev_candle, candle_count)
        self._indicator_state[symbol][tf] = new_state
        self._indicators[symbol][tf][candle.open_time] = ind
        max_len = MAX_1M_CANDLES if tf == "1m" else MAX_HIGHER_TF_CANDLES
        while len(self._indicators[symbol][tf]) > max_len:
            oldest = min(self._indicators[symbol][tf].keys())
            del self._indicators[symbol][tf][oldest]

    def _should_send_signal(self, *, symbol: str, tf: str, open_time: int, signal_id: str) -> bool:
        """
        Return True if we have NOT notified this (symbol, tf, candle, signal_id) yet.
        Uses Redis SET NX+EX when available; otherwise uses an in-memory TTL map.
        """
        key = f"fcm_dedupe:signals:{symbol}:{signal_id}:{int(open_time)}"
        ttl = _dedupe_ttl_seconds(tf)
        now = time.time()

        # In-memory fallback (or when Redis errors)
        def mem_check() -> bool:
            # opportunistic cleanup
            if self._notify_mem:
                # keep this cheap; only clean when map grows a bit
                if len(self._notify_mem) > 10_000:
                    expired = [k for k, exp in self._notify_mem.items() if exp <= now]
                    for k in expired:
                        self._notify_mem.pop(k, None)
            exp = self._notify_mem.get(key)
            if exp is not None and exp > now:
                return False
            self._notify_mem[key] = now + ttl
            return True

        if self._notify_pool is None:
            return mem_check()

        try:
            rc = Redis(connection_pool=self._notify_pool)
            # Redis-py returns True/False for nx set in newer versions; may return b'OK' as well.
            ok = rc.set(key, "1", nx=True, ex=ttl)
            rc.close()
            return bool(ok)
        except Exception:
            return mem_check()

    def _ingest_1m_and_update(self, symbol: str, kline_dict: dict) -> None:
        """Ingest one 1m kline, update 1m buffer, aggregate higher TFs, and step indicators."""
        self._ensure_symbol_buffers(symbol)
        candle_1m = candle_engine.candle_from_binance_kline(kline_dict)
        dq_1m = self._candles[symbol]["1m"]
        # If we already ingested this closed candle, don't step indicators again.
        if dq_1m and dq_1m[-1].open_time == candle_1m.open_time:
            return
        dq_1m.append(candle_1m)

        # 1m indicators are no longer calculated; keep the candle buffer for aggregations only.

        for tf in HIGHER_TIMEFRAMES:
            bucket = candle_engine.bucket_open_time(candle_1m.open_time, tf)
            in_bucket = [
                c for c in dq_1m
                if candle_engine.bucket_open_time(c.open_time, tf) == bucket
            ]
            agg = candle_engine.aggregate_candles(in_bucket, bucket)
            if agg is None:
                continue
            dq_tf = self._candles[symbol][tf]
            found = False
            for i in range(len(dq_tf)):
                if dq_tf[i].open_time == bucket:
                    dq_tf[i] = agg
                    found = True
                    break
            if not found:
                dq_tf.append(agg)

            # Only "finalize" (step) the higher-timeframe indicators once the bucket candle is complete.
            # This prevents repeatedly stepping the same 5m/30m/1h candle each minute (indicator drift + duplicate alerts).
            candle_close_1m = candle_1m.open_time + 60
            bucket_close = bucket + _timeframe_seconds(tf)
            if tf == "5m":
                # We no longer compute indicators for 5m candles; higher TFs still need the
                # aggregated candles, so keep buffering but skip stepping.
                continue
            if candle_close_1m >= bucket_close:
                if bucket not in self._indicators[symbol][tf]:
                    prev_bucket = bucket - _timeframe_seconds(tf)
                    prev_tf = next((c for c in dq_tf if c.open_time == prev_bucket), None)
                    self._step_and_store_indicators(symbol, tf, agg, prev_tf, len(dq_tf))

    def _check_signals_and_notify(self) -> None:
        """
        After all symbols updated: for each symbol with any RSI/ADX/PSAR signal,
        send one FCM notification to the signals topic (notification + data for all app states).
        """
        topic = getattr(settings, "FCM_TOPIC_SIGNALS", None) or "signals"
        for symbol in list(self._candles.keys()):
            if symbol not in self._indicators:
                continue
            notify_lines: list[str] = []
            for tf in HIGHER_TIMEFRAMES:
                ind_dict = self._indicators[symbol].get(tf, {})
                if not ind_dict:
                    continue
                # Use the latest finalized indicator candle for this timeframe
                latest_open_time = max(ind_dict.keys())
                ind = ind_dict[latest_open_time]
                for signal_id, msg in signal_detection.get_signals(ind, tf):
                    if self._should_send_signal(
                        symbol=symbol,
                        tf=tf,
                        open_time=latest_open_time,
                        signal_id=signal_id,
                    ):
                        notify_lines.append(msg)

            if not notify_lines:
                continue
            title = f"{symbol}: {len(notify_lines)} signal(s)"
            body = "\n".join(notify_lines)
            data = {"symbol": symbol, "signals": body}
            try:
                firebase_fcm.send_to_topic(topic, title=title, body=body, data=data)
            except Exception as e:
                LOGGER.exception("FCM signal notification failed for %s: %s", symbol, e)

    def get_snapshot(self) -> dict:
        """Return full cache as snapshot payload (all-in-one: timestamp + candles + indicators per symbol; symbol is the key)."""
        payload_data: dict = {}
        for symbol, entry in self._cache.items():
            out: dict = {"timestamp": entry["timestamp"]}
            payload_data[symbol] = out
            if symbol not in self._candles:
                continue
            candles_for_symbol: dict[str, dict] = {}
            indicators_for_symbol: dict[str, dict] = {}
            for tf in ALL_TIMEFRAMES:
                dq = self._candles[symbol].get(tf)
                if dq:
                    candles_for_symbol[tf] = dq[-1].to_dict()
                ind_dict = self._indicators[symbol].get(tf, {})
                if dq and ind_dict:
                    latest_open_time = dq[-1].open_time
                    if latest_open_time in ind_dict:
                        indicators_for_symbol[tf] = dict(ind_dict[latest_open_time])
            if candles_for_symbol:
                out["candles"] = candles_for_symbol
            if indicators_for_symbol:
                out["indicators"] = indicators_for_symbol
        return {"type": "snapshot", "data": payload_data}

    async def start(self) -> None:
        """Start the 24/7 all-tokens loop. Call from lifespan startup."""
        if self._task and not self._task.done():
            return
        self._shutdown.clear()
        self._task = asyncio.create_task(self._run_all_tokens_loop())
        LOGGER.info("BinanceWebSocketManager started (24/7 mode)")

    async def _run_all_tokens_loop(self) -> None:
        """Maintain Binance connection, cycle through all tokens, cache and broadcast."""
        symbols: list[str] = []
        last_symbol_refresh = 0.0
        backoff = 1.0

        while not self._shutdown.is_set():
            now = time.time()
            if not symbols or (now - last_symbol_refresh) >= self._symbol_refresh_minutes * 60:
                fresh = _load_symbols_from_db()
                if fresh:
                    symbols = fresh
                    last_symbol_refresh = now
                    LOGGER.info("Loaded %d symbols from DB", len(symbols))
                elif not symbols:
                    LOGGER.warning("No symbols loaded, retrying in 60s")
                    await asyncio.sleep(60)
                    continue

            try:
                async with websockets.connect(
                    BINANCE_ENDPOINT,
                    ping_interval=20,
                    ping_timeout=10,
                    close_timeout=5,
                ) as ws:
                    backoff = 1.0
                    while not self._shutdown.is_set():
                        for symbol in symbols:
                            if self._shutdown.is_set():
                                break
                            request = {
                                "id": str(uuid.uuid4()),
                                "method": "klines",
                                "params": {
                                    "symbol": symbol,
                                    "interval": self._interval,
                                    "limit": KLINES_LIMIT,
                                },
                            }
                            await ws.send(json.dumps(request))
                            raw = await ws.recv()
                            msg = json.loads(raw)
                            status = msg.get("status")
                            result = msg.get("result")
                            if status == 200 and isinstance(result, list):
                                data = _klines_result_to_dicts(result)
                                self._cache[symbol] = {
                                    "symbol": symbol,
                                    "interval": self._interval,
                                    "data": data,
                                    "timestamp": time.time(),
                                }
                                if data and self._interval == "1m":
                                    k = _pick_latest_closed_kline(data)
                                    if k is not None:
                                        self._ingest_1m_and_update(symbol, k)
                            else:
                                LOGGER.debug("Binance klines skip %s: %s", symbol, msg.get("error", msg))

                        # Temporarily disabled: push signal notifications to FCM
                        # self._check_signals_and_notify()
                        # After full cycle: send one big message (full snapshot) to all clients
                        payload = self.get_snapshot()
                        await self._broadcast(payload)
                        await asyncio.sleep(self._poll_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                LOGGER.warning(
                    "Binance connection error: %s. Reconnecting in %ss.",
                    e,
                    RECONNECT_DELAY_SECONDS,
                )
                await asyncio.sleep(RECONNECT_DELAY_SECONDS)
                backoff = min(backoff * 2, 60)

    async def _broadcast(self, payload: dict) -> None:
        """Send payload to all connected clients, removing dead connections."""
        dead: list[WebSocket] = []
        for client in self._clients:
            try:
                await client.send_json(payload)
            except Exception:
                dead.append(client)
        for c in dead:
            self._clients.discard(c)

    async def shutdown(self) -> None:
        """Stop the loop and cleanup. Call from lifespan shutdown."""
        self._shutdown.set()
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        self._cache.clear()
        self._candles.clear()
        self._indicators.clear()
        self._indicator_state.clear()
        self._clients.clear()
        LOGGER.info("BinanceWebSocketManager shutdown complete")


def get_binance_manager() -> BinanceWebSocketManager:
    """Return the singleton BinanceWebSocketManager instance."""
    return BinanceWebSocketManager()
