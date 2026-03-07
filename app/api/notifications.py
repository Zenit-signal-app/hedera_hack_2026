"""API for the FE to get saved signal notifications from the signals table."""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.router_decorated import APIRouter
from app.db.session import get_db, get_tables
from app.schemas.notifications import SignalNotification

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
        "Returns all saved signals, newest first. Each row has id, symbol, timeframe, message (summary string), image (optional URL), created_at.\n\n"
        "**Query params (optional):**\n"
        "- **symbol**: Filter by symbol (e.g. BTCUSDT).\n"
        "- **timeframe**: Filter by timeframe (e.g. 30m, 1h).\n\n"
        "**Response:** List of `SignalNotification`."
    ),
)
def list_notifications(
    symbol: Optional[str] = Query(None, description="Filter by symbol (e.g. BTCUSDT)."),
    timeframe: Optional[str] = Query(None, description="Filter by timeframe (e.g. 30m, 1h)."),
    db: Session = Depends(get_db),
) -> List[SignalNotification]:
    try:
        tables = get_tables(settings.SCHEMA_1)
        tbl_signals = tables["signals"]
    except Exception as e:
        LOGGER.exception("Notifications API: failed to get table config: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Configuration error",
        ) from e
    conditions: List[str] = []
    if symbol is not None and symbol.strip():
        sym_esc = _sql_esc(symbol.strip().upper())
        conditions.append(f"symbol = '{sym_esc}'")
    if timeframe is not None and timeframe.strip():
        tf_esc = _sql_esc(timeframe.strip().lower())
        conditions.append(f"timeframe = '{tf_esc}'")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    query = f"""
        SELECT id, symbol, timeframe, message, image, created_at
        FROM {tbl_signals}
        {where}
        ORDER BY created_at DESC
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
        created = row.created_at
        created_at_str = created.isoformat() if hasattr(created, "isoformat") else str(created)
        image_val = getattr(row, "image", None)
        out.append(
            SignalNotification(
                id=str(row.id),
                symbol=str(row.symbol or ""),
                timeframe=str(row.timeframe or ""),
                message=str(row.message or ""),
                image=str(image_val) if image_val else None,
                created_at=created_at_str,
            )
        )
    return out
