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
from typing import Final

import websockets
from fastapi import WebSocket
from sqlalchemy import text

from app.core.config import settings
from app.db.session import SessionLocal, get_tables

LOGGER = logging.getLogger(__name__)

BINANCE_ENDPOINT: Final[str] = "wss://ws-api.binance.com:443/ws-api/v3"
KLINES_LIMIT: Final[int] = 1
RECONNECT_DELAY_SECONDS: Final[int] = 5

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

    def register_client(self, websocket: WebSocket) -> None:
        """Register a frontend client. Caller should send snapshot after."""
        self._clients.add(websocket)

    def unregister_client(self, websocket: WebSocket) -> None:
        """Remove a frontend client on disconnect."""
        self._clients.discard(websocket)

    def get_snapshot(self) -> dict:
        """Return full cache as snapshot payload for new clients."""
        return {"type": "snapshot", "data": dict(self._cache)}

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
                            else:
                                LOGGER.debug("Binance klines skip %s: %s", symbol, msg.get("error", msg))

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
        self._clients.clear()
        LOGGER.info("BinanceWebSocketManager shutdown complete")


def get_binance_manager() -> BinanceWebSocketManager:
    """Return the singleton BinanceWebSocketManager instance."""
    return BinanceWebSocketManager()
