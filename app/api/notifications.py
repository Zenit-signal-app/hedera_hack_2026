"""API for the FE to get saved signal notifications from the signals table."""

from __future__ import annotations

import json
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
        "Return saved signals (notifications) from the database, newest first. "
        "Optional filter by symbol; supports limit and offset for pagination."
    ),
)
def list_notifications(
    symbol: Optional[str] = Query(None, description="Filter by symbol (e.g. BTCUSDT)."),
    limit: int = Query(50, ge=1, le=200, description="Max number of records."),
    offset: int = Query(0, ge=0, description="Number of records to skip."),
    db: Session = Depends(get_db),
) -> List[SignalNotification]:
    try:
        tables = get_tables(settings.SCHEMA_1)
        table = tables["signals"]
    except Exception as e:
        LOGGER.exception("Notifications API: failed to get signals table config: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Configuration error",
        ) from e
    if symbol is not None and symbol.strip():
        sym_esc = _sql_esc(symbol.strip().upper())
        where = f"WHERE symbol = '{sym_esc}'"
    else:
        where = ""
    query = f"""
        SELECT id, symbol, timeframe, signal, open_time, created_at
        FROM {table}
        {where}
        ORDER BY created_at DESC
        LIMIT {int(limit)} OFFSET {int(offset)}
    """
    try:
        rows = db.execute(text(query)).fetchall()
    except Exception as e:
        LOGGER.exception("Notifications API: failed to query signals (symbol=%s, limit=%s, offset=%s): %s", symbol, limit, offset, e)
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
                signal=sig,
                open_time=int(row.open_time) if row.open_time is not None else 0,
                created_at=created_at_str,
            )
        )
    return out
