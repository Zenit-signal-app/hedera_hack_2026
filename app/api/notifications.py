"""API for the FE to get saved signal notifications from the signals table."""

from __future__ import annotations

import json
import logging
from typing import List

from fastapi import Body, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.router_decorated import APIRouter
from app.db.session import get_db, get_tables
from app.schemas.notifications import ListNotificationsBody, SignalNotification

LOGGER = logging.getLogger(__name__)

router = APIRouter()
group_tags = ["Notifications"]


def _sql_esc(value: str) -> str:
    return str(value).replace("'", "''")


@router.get(
    "/",
    response_model=List[SignalNotification],
    summary="List signal notifications",
    description=(
        "Returns all saved signals (joined with their notification message), newest first.\n\n"
        "**Body (optional):** `message` (string) – when provided, the API looks up the notification id for that exact message text, then returns only signals linked to that notification_id.\n\n"
        "**Response:** List of `SignalNotification`, each with:\n"
        "- **id**: UUID of the signal.\n"
        "- **symbol**: Trading pair (e.g. BTCUSDT).\n"
        "- **timeframe**: Candle interval (e.g. 30m, 1h).\n"
        "- **notification_id**: Foreign key to notifications.id.\n"
        "- **message**: Notification message text (from notifications.message).\n"
        "- **signal**: Indicators and values as JSONB.\n"
        "- **open_time**: Candle open time (Unix epoch seconds).\n"
        "- **created_at**: When the signal was stored (ISO timestamp)."
    ),
)
def list_notifications(
    body: ListNotificationsBody | None = Body(None, description="Optional body with `message` to filter by notification message text."),
    db: Session = Depends(get_db),
) -> List[SignalNotification]:
    try:
        tables = get_tables(settings.SCHEMA_1)
        tbl_signals = tables["signals"]
        tbl_notifications = tables["notifications"]
    except Exception as e:
        LOGGER.exception("Notifications API: failed to get table config: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Configuration error",
        ) from e
    conditions: List[str] = []
    if body is not None and body.message is not None and body.message.strip():
        msg_esc = _sql_esc(body.message.strip())
        try:
            notif_row = db.execute(
                text(f"SELECT id FROM {tbl_notifications} WHERE message = '{msg_esc}'")
            ).fetchone()
            if notif_row:
                conditions.append(f"s.notification_id = {int(notif_row.id)}")
            else:
                return []
        except Exception as e:
            LOGGER.exception("Notifications API: failed to look up notification by message: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to look up notification by message",
            ) from e
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    query = f"""
        SELECT s.id, s.symbol, s.timeframe, s.notification_id, n.message, s.signal, s.open_time, s.created_at
        FROM {tbl_signals} s
        JOIN {tbl_notifications} n ON n.id = s.notification_id
        {where}
        ORDER BY s.created_at DESC
    """
    try:
        rows = db.execute(text(query)).fetchall()
    except Exception as e:
        LOGGER.exception("Notifications API: failed to query signals: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load notifications",
        ) from e
    out: List[SignalNotification] = []
    for row in rows:
        # signal from DB may be JSONB (returned as dict or str depending on driver)
        sig = row.signal
        if isinstance(sig, str):
            try:
                sig = json.loads(sig)
            except Exception as e:
                LOGGER.warning("Notifications API: failed to parse signal JSON for id=%s: %s", getattr(row, "id", None), e)
                sig = {}
        if not isinstance(sig, dict):
            sig = {}
        created = row.created_at
        created_at_str = created.isoformat() if hasattr(created, "isoformat") else str(created)
        out.append(
            SignalNotification(
                id=str(row.id),
                symbol=str(row.symbol or ""),
                timeframe=str(row.timeframe or ""),
                notification_id=int(row.notification_id) if row.notification_id is not None else 0,
                message=str(row.message or ""),
                signal=sig,
                open_time=int(row.open_time) if row.open_time is not None else 0,
                created_at=created_at_str,
            )
        )
    return out
