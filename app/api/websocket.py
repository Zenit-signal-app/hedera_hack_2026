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
    "url": "ws://{host}/ohlcv (or wss:// for HTTPS)",
    "description": (
        "Connect to this WebSocket to receive real-time OHLCV price stream for all tokens. "
        "The server always sends one big message: a full snapshot of all cached token data. "
        "You receive it on connect, then again after each full update cycle (every 60s). "
        "No client messages required; all tokens are included in every message."
    ),
    "message_format": (
        "Every message is the same: {\"type\": \"snapshot\", \"data\": {\"BTCUSDT\": {\"symbol\", \"interval\", \"data\": [...]}, \"ETHUSDT\": ..., ...}}. "
        "Each key in data is a symbol; each value has symbol, interval, data (array of kline dicts), and timestamp."
    ),
    "messages": {
        "every_message": '{"type": "snapshot", "data": {"BTCUSDT": {"symbol": "BTCUSDT", "interval": "1m", "data": [...], "timestamp": ...}, "ETHUSDT": {...}, ...}}',
    },
}


@router.get(
    "/ohlcv",
    tags=group_tags,
    summary="WebSocket OHLCV stream (instructions)",
    description=WEBSOCKET_INSTRUCTIONS["description"],
    response_model=None,
)
def websocket_ohlcv_docs() -> dict[str, Any]:
    """Documentation-only endpoint: describes how to connect to the WebSocket at GET /ohlcv (use WebSocket protocol)."""
    return WEBSOCKET_INSTRUCTIONS


@router.websocket("/ohlcv")
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
