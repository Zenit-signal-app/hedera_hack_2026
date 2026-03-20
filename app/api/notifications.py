"""API for the FE to get saved signal notifications from the signals table."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.router_decorated import APIRouter
from app.db.chain_resolve import get_chain_id_for_slug, get_slug_for_chain_id
from app.db.session import get_db, get_tables
from app.schemas.notifications import SignalNotification

LOGGER = logging.getLogger(__name__)

router = APIRouter()
group_tags = ["Notifications"]

COINS_DATA_PATH = Path(__file__).resolve().parents[2] / "coins_data.json"


def _load_coin_images(path: Path) -> dict[str, str]:
    """Load coin symbol -> image URL from coins_data.json (same as GET /tokens). Key is coin lowercase (e.g. btc)."""
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    images: dict[str, str] = {}
    for item in data:
        symbol = (item.get("symbol") or "").strip().lower()
        image = item.get("image") or ""
        if symbol:
            images[symbol] = image
    return images


COIN_IMAGE_MAP = _load_coin_images(COINS_DATA_PATH)


def _sql_esc(value: str) -> str:
    return str(value).replace("'", "''")


@router.get(
    "/",
    response_model=List[SignalNotification],
    summary="List signal notifications",
    description=(
        "Returns all saved signals, newest first. Each row has id, symbol, timeframe, message, image, chain (slug from chains table), created_at.\n\n"
        "**Query params (optional):**\n"
        "- **symbol**: Filter by symbol (e.g. BTCUSDT).\n"
        "- **timeframe**: Filter by timeframe (e.g. 30m, 1h).\n"
        "- **chain**: Filter by chain string (treated as slug).\n"
        "- **limit**: Max notifications to return (1–500, default 100).\n\n"
        "**Response:** List of `SignalNotification`."
    ),
)
def list_notifications(
    symbol: Optional[str] = Query(None, description="Filter by symbol (e.g. BTCUSDT)."),
    timeframe: Optional[str] = Query(None, description="Filter by timeframe (e.g. 30m, 1h)."),
    chain: Optional[str] = Query(None, description="Filter by chain string (treated as slug from chains table)."),
    limit: int = Query(100, ge=1, le=500, description="Max number of notifications to return (default 100)."),
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
    if chain is not None and chain.strip():
        cid = get_chain_id_for_slug(db, chain)
        if cid == 0:
            raise HTTPException(status_code=400, detail="Chain not found")
        conditions.append(f"chain_id = {cid}")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    query = f"""
        SELECT id, symbol, timeframe, message, image, chain_id, created_at
        FROM {tbl_signals}
        {where}
        ORDER BY created_at DESC
        LIMIT {limit}
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
        created = getattr(row, "created_at", None)
        if created is not None and hasattr(created, "isoformat"):
            created_at_str = created.isoformat()
        else:
            created_at_str = str(created) if created is not None else ""
        db_image = getattr(row, "image", None)
        if db_image and str(db_image).strip():
            image_url = str(db_image).strip()
        else:
            coin_key = (row.symbol or "").strip()
            if len(coin_key) > 4:
                coin_key = coin_key[:-4].strip().lower()
            else:
                coin_key = coin_key.lower()
            image_url = COIN_IMAGE_MAP.get(coin_key, "")
        cid = getattr(row, "chain_id", 1) or 1
        chain_val = get_slug_for_chain_id(db, int(cid))
        out.append(
            SignalNotification(
                id=str(row.id),
                symbol=str(row.symbol or ""),
                timeframe=str(row.timeframe or ""),
                message=str(row.message or ""),
                chain=chain_val,
                image=image_url,
                created_at=created_at_str,
            )
        )
    return out
