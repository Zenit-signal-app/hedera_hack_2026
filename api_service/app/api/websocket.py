"""
WebSocket endpoint for real-time OHLCV price stream from Binance.
Connect to receive a snapshot of cached prices and streaming updates.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.binance_websocket import get_binance_manager

LOGGER = logging.getLogger(__name__)

router = APIRouter()
group_tags: list[str] = ["WebSocket"]

WEBSOCKET_INSTRUCTIONS: dict[str, Any] = {
    "endpoint": "WebSocket /ohlcv",
    "connection": {
        "url": "ws://{host}/ohlcv",
        "url_secure": "wss://{host}/ohlcv",
        "description": (
            "Use WebSocket protocol (not HTTP). Replace {host} with your server, e.g. localhost:8000 or api.example.com. "
            "Use ws:// for plain HTTP, wss:// when the server is behind HTTPS."
        ),
        "example_urls": [
            "ws://localhost:8000/ohlcv",
            "wss://api.example.com/ohlcv",
        ],
    },
    "behavior": (
        "On connect you receive one full snapshot. The server then pushes a new full snapshot after each update cycle (e.g. every 60s). "
        "No client messages are required; sending any text is ignored. All tokens are included in every message. "
        "Run GET /ws to get the documentation and example message."
    ),
    "message_format": {
        "type": "snapshot",
        "data": {
            "description": "Object keyed by symbol (e.g. BTCUSDT, ETHUSDT). The key is the symbol; symbol, interval, and raw kline array are omitted (price/OHLCV and timeframe come from candles).",
            "per_symbol": {
                "timestamp": "number, server time when this symbol was last updated",
                "candles": "optional. Present only when 1m data has been ingested. Object keyed by timeframe (1m, 5m, 30m, 1h, 4h, 1d). Each value is the latest candle only: { open_time, open, high, low, close, volume, quote_asset, num_trades, buy_base, buy_quote }.",
                "indicators": "optional. Present only when indicators exist. Object keyed by timeframe (1m, 5m, 30m, 1h, 4h, 1d). Each value is the latest candle's indicators only: a single object with tr, rsi7, rsi14, atr14, atr28, dm14_p, dm14_n, di14_p, di14_n, dx14, adx, di14_line_cross, psar, psar_type, ep, af, psar_turn (and open_time). Any field may be null if the required number of candles for that indicator is not yet met (see indicator_warmup).",
            "indicator_warmup": "Minimum candles needed before each indicator is non-null: tr 2; rsi7 8; rsi14 15; dm14_p/dm14_n/atr14/di14_p/di14_n/dx14/psar 15; atr28/adx 29; di14_line_cross 16.",
            },
        },
        "signals": "Array of signals last saved to the DB (when a batch was saved and FCM sent). Each item: { id (UUID), symbol, timeframe, message (summary string), image (optional URL), created_at }. Empty array when no batch was saved this cycle. Use GET /notifications with query params symbol and timeframe to filter saved signals.",
    },
    "example_message": {
        "type": "snapshot",
        "data": {
            "BTCUSDT": {
                "timestamp": 1709568060.123,
                "candles": {"1m": {"open_time": 1709568000, "open": 50000, "high": 50100, "low": 49900, "close": 50050, "volume": 100, "quote_asset": 5005000, "num_trades": 1000, "buy_base": 50, "buy_quote": 2502500}, "5m": {"open_time": 1709568000, "open": 50000, "high": 50120, "low": 49880, "close": 50100, "volume": 500, "quote_asset": 25050000, "num_trades": 5000, "buy_base": 250, "buy_quote": 12525000}},
                "indicators": {"1m": {"open_time": 1709568000, "rsi7": 55.2, "rsi14": 52.1, "atr14": 150, "adx": 25, "psar": 49800, "psar_type": "UP"}, "5m": {"open_time": 1709568000, "rsi7": 54.1, "rsi14": 51.0, "atr14": 180, "adx": 22, "psar": 49900, "psar_type": "UP"}},
            },
        },
        "signals": [
            {"id": "uuid-1", "symbol": "BTCUSDT", "timeframe": "30m", "message": "30m: RSI14 28.50 (oversold)", "image": "", "created_at": "2025-03-07T12:00:00+00:00"},
        ],
    },
}


@router.get(
    "/ws",
    tags=group_tags,
    summary="WebSocket OHLCV stream (instructions)",
    description=(
        "**Input:** None. Documentation-only HTTP endpoint.\n\n"
        "**Output:** JSON with:\n"
        "- **endpoint**: WebSocket path name.\n"
        "- **connection**: url, url_secure, description, example_urls for connecting.\n"
        "- **behavior**: On connect: full snapshot; server pushes new snapshot each cycle; no client messages required.\n"
        "- **message_format**: type (snapshot), data keyed by symbol with timestamp, candles (OHLCV per timeframe), indicators (RSI, ADX, PSAR, etc.); signals array (id, symbol, timeframe, message, image, created_at) for last saved batch. Use GET /notifications?symbol=...&timeframe=... to query all saved signals.\n"
        "- **example_message**: Sample snapshot payload.\n\n"
        "To stream data, connect via WebSocket to the same path (e.g. ws://host/ws or wss://host/ws)."
    ),
    response_model=None,
)
def websocket_ohlcv_docs() -> dict[str, Any]:
    return WEBSOCKET_INSTRUCTIONS


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for OHLCV price stream.

    - On connect: receive snapshot of cached prices
    - Server pushes updates continuously (no client messages)
    """
    await websocket.accept()
    manager = get_binance_manager()
    manager.register_client(websocket)
    try:
        snapshot = manager.get_snapshot()
        await websocket.send_json(snapshot)
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        LOGGER.info("WebSocket client disconnected")
    except Exception as e:
        LOGGER.exception("WebSocket error: %s", e)
    finally:
        manager.unregister_client(websocket)
