from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import requests
from requests.exceptions import RequestException

from fastapi import Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.router_decorated import APIRouter
from app.core.config import settings
from app.core.user_context import get_current_user_chain_id
from app.db.chain_resolve import get_slug_for_chain_id
from app.db.session import get_db, get_tables
import app.schemas.prices as schemas

router = APIRouter()
group_tags = ["Tokens"]
tables = get_tables(settings.SCHEMA_1)

COINS_DATA_PATH = Path(__file__).resolve().parents[2] / "coins_data.json"


def _load_coin_images(path: Path) -> dict[str, str]:
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

def _build_key_filter(key: Optional[str]) -> str:
    if not key:
        return ""
    try:
        normalized = re.sub(r"([^A-Za-z0-9\\\/]|_)+", " ", key).strip().upper()
        normalized = "^" + "|^".join(part for part in normalized.split() if part)
    except Exception:
        return ""
    if not normalized:
        return ""
    return (
        f"AND (symbol ~ '{normalized}' "
        f"OR left(symbol, char_length(symbol) - 4) ~ '{normalized}') "
    )


def _binance_float(value: Optional[str]) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _fetch_binance_tickers(symbols: Sequence[str]) -> dict[str, dict[str, float]]:
    if not symbols:
        return {}
    url = "https://api.binance.com/api/v3/ticker/24hr"
    payload = {"symbols": json.dumps(symbols, separators=(",", ":"))}
    try:
        response = requests.get(url, params=payload, timeout=5)
        response.raise_for_status()
    except RequestException as exc:
        print(f"Binance request failed for {symbols}: {exc}")
        return {}

    try:
        data = response.json()
    except ValueError:
        return {}

    result: dict[str, dict[str, float]] = {}
    if isinstance(data, dict):
        entries = [data]
    else:
        entries = data
    for entry in entries:
        symbol = (entry.get("symbol") or "").upper()
        if not symbol:
            continue
        result[symbol] = {
            "priceChange": _binance_float(entry.get("priceChange")),
            "priceChangePercent": _binance_float(entry.get("priceChangePercent")),
            "volume": _binance_float(entry.get("volume")),
            "quoteVolume": _binance_float(entry.get("quoteVolume")),
        }
    return result


def _sql_escape(s: str) -> str:
    return (s or "").replace("'", "''")


def _fetch_24h_from_coin_prices_30m_batch(
    db: Session, pairs: Sequence[Tuple[int, str]]
) -> Dict[Tuple[int, str], dict[str, float]]:
    """Latest row per (chain_id, symbol) from coin_prices_30m (by open_time desc)."""
    unique: list[Tuple[int, str]] = []
    seen: set[Tuple[int, str]] = set()
    for cid, sym in pairs:
        if not sym:
            continue
        k = (int(cid), sym)
        if k not in seen:
            seen.add(k)
            unique.append(k)
    if not unique:
        return {}
    table_30m = tables["p30m"]
    in_rows = ", ".join(
        f"({int(cid)}, '{_sql_escape(sym)}')" for cid, sym in unique
    )
    query = f"""
        SELECT chain_id, symbol, volume_24h, quote_volume_24h,
               price_change_24h, price_change_percentage_24h
        FROM (
            SELECT
                chain_id, symbol, volume_24h, quote_volume_24h,
                price_change_24h, price_change_percentage_24h,
                row_number() OVER (
                    PARTITION BY chain_id, symbol ORDER BY open_time DESC
                ) AS rn
            FROM {table_30m}
            WHERE (chain_id, symbol) IN ({in_rows})
        ) t
        WHERE rn = 1
    """
    try:
        rows = db.execute(text(query)).fetchall()
    except Exception as e:
        print(f"Error querying coin_prices_30m batch: {e}")
        return {}
    out: Dict[Tuple[int, str], dict[str, float]] = {}
    for r in rows:
        key = (int(r.chain_id), r.symbol)
        out[key] = {
            "priceChange": float(r.price_change_24h or 0),
            "priceChangePercent": float(r.price_change_percentage_24h or 0),
            "volume": float(r.volume_24h or 0),
            "quoteVolume": float(r.quote_volume_24h or 0),
        }
    return out


def _fetch_24h_from_coin_prices_30m_one(
    db: Session, chain_id: int, symbol: str
) -> dict[str, float]:
    if not symbol:
        return {}
    table_30m = tables["p30m"]
    sym = _sql_escape(symbol)
    cid = int(chain_id)
    query = f"""
        SELECT volume_24h, quote_volume_24h, price_change_24h, price_change_percentage_24h
        FROM {table_30m}
        WHERE chain_id = {cid} AND symbol = '{sym}'
        ORDER BY open_time DESC
        LIMIT 1
    """
    try:
        r = db.execute(text(query)).fetchone()
    except Exception as e:
        print(f"Error querying coin_prices_30m: {e}")
        return {}
    if not r:
        return {}
    return {
        "priceChange": float(r.price_change_24h or 0),
        "priceChangePercent": float(r.price_change_percentage_24h or 0),
        "volume": float(r.volume_24h or 0),
        "quoteVolume": float(r.quote_volume_24h or 0),
    }


def _sanitize_symbol(symbol: str) -> str:
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    cleaned = re.sub(r"[^A-Za-z0-9]+", "", symbol).strip().upper()
    if not cleaned:
        raise HTTPException(status_code=400, detail="invalid symbol")
    return cleaned


@router.get(
    "/",
    tags=group_tags,
    response_model=List[schemas.Token],
    summary="List tokens",
    description=(
        "**Input:** Query: `key` (optional), `offset` (≥0, default 0), `limit` (1–500, default 100). "
        "Results are scoped to the authenticated user's chain.\n\n"
        "**Output:** List of `Token`, each with:\n"
        "- **symbol**: Trading pair (e.g. BTCUSDT).\n"
        "- **coin**: Base coin (e.g. BTC).\n"
        "- **chain**: Slug value from chains table.\n"
        "- **price**: Latest cached price.\n"
        "- **time**: Unix timestamp of the price.\n"
        "- **time_readable**: Human-readable time (e.g. YYYY-MM-DD HH:MM:SS UTC).\n"
        "- **image**: Coin image URL.\n"
        "- **priceChange**: 24h price change (Binance for chain_id=1; else coin_prices_30m).\n"
        "- **priceChangePercent**: 24h change % (same sources).\n"
        "- **volume**: 24h base volume (same sources).\n"
        "- **quoteVolume**: 24h quote volume (same sources).\n"
        "Latest price from DB; chain_id=1: 24h from Binance; other chains: coin_prices_30m (latest open_time)."
    ),
)
def list_all_tokens(
    key: Optional[str] = None,
    chain_id: int = Depends(get_current_user_chain_id),
    offset: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> List[schemas.Token]:
    offset = max(0, offset)
    limit = max(1, min(500, limit))
    table_1h = tables["f1h"]
    key_filter = _build_key_filter(key)
    chain_filter = f"AND chain_id = {int(chain_id)}"
    # key_filter and chain_filter both start with AND; need a base WHERE when key is empty
    inner_where = f"WHERE 1=1\n            {key_filter}\n            {chain_filter}"

    # Query distinct symbols with their latest prices (per chain when chain_id filtered)
    query = f"""
        SELECT 
            symbol,
            chain_id,
            CASE
                WHEN position('/' in symbol) > 0 THEN split_part(symbol, '/', 1)
                ELSE left(symbol, char_length(symbol) - 4)
            END as coin,
            close as price,
            open_time as time
        FROM (
            SELECT 
                symbol,
                chain_id,
                close,
                open_time,
                row_number() over (PARTITION by symbol, chain_id order by open_time desc) AS r
            FROM {table_1h}
            {inner_where}
        ) latest_prices
        WHERE r = 1
        ORDER BY symbol
        LIMIT {limit} OFFSET {offset}
    """
    
    try:
        result = db.execute(text(query)).fetchall()
    except Exception as e:
        print(f"Error querying tokens: {e}")
        raise HTTPException(status_code=500, detail="Query data error")
    
    if not result:
        return []
    
    requested_symbols = [
        row.symbol
        for row in result
        if row.symbol and (getattr(row, "chain_id", 1) or 1) == 1
    ]
    binance_metrics = _fetch_binance_tickers(requested_symbols)
    alt_pairs = [
        (int(getattr(r, "chain_id", 1) or 1), r.symbol)
        for r in result
        if r.symbol and int(getattr(r, "chain_id", 1) or 1) != 1
    ]
    alt_24h = _fetch_24h_from_coin_prices_30m_batch(db, alt_pairs)

    tokens = []
    for row in result:
        coin_key = (row.coin or "").strip().lower()
        cid = getattr(row, "chain_id", 1) or 1
        chain_val = get_slug_for_chain_id(db, int(cid))
        if int(cid) == 1:
            metrics = binance_metrics.get(row.symbol, {})
        else:
            metrics = alt_24h.get((int(cid), row.symbol), {})
        tokens.append(
            schemas.Token(
                symbol=row.symbol,
                coin=row.coin,
                chain=chain_val,
                price=row.price if row.price else 0,
                time=row.time if row.time else 0,
                time_readable=datetime.fromtimestamp(row.time).strftime('%Y-%m-%d %H:%M:%S UTC')
                if row.time
                else "",
                image=COIN_IMAGE_MAP.get(coin_key, ""),
                priceChange=metrics.get("priceChange", 0),
                priceChangePercent=metrics.get("priceChangePercent", 0),
                volume=metrics.get("volume", 0),
                quoteVolume=metrics.get("quoteVolume", 0),
            )
        )
    return tokens


@router.get(
    "/{symbol}",
    tags=group_tags,
    response_model=schemas.Token,
    summary="Get token by symbol",
    description=(
        "**Input:** Path `symbol` (required). Results are scoped to the authenticated user's chain.\n\n"
        "**Output:** Single `Token` with:\n"
        "- **symbol**: Trading pair (e.g. BTCUSDT).\n"
        "- **coin**: Base coin (e.g. BTC).\n"
        "- **chain**: Slug value from chains table.\n"
        "- **price** / **time**: Latest row from f_coin_signal_1h (same as GET /tokens list).\n"
        "- **time_readable**: Human-readable time (e.g. YYYY-MM-DD HH:MM:SS UTC).\n"
        "- **image**: Coin image URL.\n"
        "- **24h fields**: chain_id=1 → Binance ticker; else → production.coin_prices_30m (latest open_time), same as list.\n"
        "If the token exists on multiple chains, it is resolved within the authenticated user's chain.\n"
        "404 if symbol not found."
    ),
)
def get_token(
    symbol: str,
    chain_id: int = Depends(get_current_user_chain_id),
    db: Session = Depends(get_db),
) -> schemas.Token:
    symbol_clean = _sanitize_symbol(symbol)
    raw_upper = (symbol or "").strip().upper()
    raw_esc = _sql_escape(raw_upper)
    # Match list endpoint: latest price from f1h; allow path like DOT/USDT or DOTUSDT
    table_1h = tables["f1h"]
    chain_filter = f"AND chain_id = {int(chain_id)}"
    symbol_predicate = (
        f"(symbol = '{symbol_clean}' OR symbol = '{raw_esc}' "
        f"OR upper(replace(symbol, '/', '')) = '{symbol_clean}')"
    )
    inner_where = f"WHERE 1=1 AND {symbol_predicate}\n            {chain_filter}"
    query = f"""
        SELECT
            symbol,
            chain_id,
            CASE
                WHEN position('/' in symbol) > 0 THEN split_part(symbol, '/', 1)
                ELSE left(symbol, char_length(symbol) - 4)
            END as coin,
            close as price,
            open_time as time
        FROM (
            SELECT
                symbol,
                chain_id,
                close,
                open_time,
                row_number() over (PARTITION by symbol, chain_id order by open_time desc) AS r
            FROM {table_1h}
            {inner_where}
        ) latest_prices
        WHERE r = 1
        ORDER BY CASE WHEN chain_id = 1 THEN 0 ELSE 1 END, open_time DESC
        LIMIT 1
    """
    try:
        row = db.execute(text(query)).fetchone()
    except Exception as e:
        print(f"Error querying token: {e}")
        raise HTTPException(status_code=500, detail="Query data error")

    if not row:
        raise HTTPException(status_code=404, detail="Token not found")

    coin_key = (row.coin or "").strip().lower()
    cid = getattr(row, "chain_id", 1) or 1
    if int(cid) == 1:
        metrics = _fetch_binance_tickers([row.symbol or symbol_clean]).get(
            row.symbol or symbol_clean, {}
        )
    else:
        metrics = _fetch_24h_from_coin_prices_30m_one(db, int(cid), row.symbol or "")
    chain_val = get_slug_for_chain_id(db, int(cid))
    return schemas.Token(
        symbol=row.symbol,
        coin=row.coin,
        chain=chain_val,
        price=row.price if row.price else 0,
        time=row.time if row.time else 0,
        time_readable=datetime.fromtimestamp(row.time).strftime("%Y-%m-%d %H:%M:%S UTC")
        if row.time
        else "",
        image=COIN_IMAGE_MAP.get(coin_key, ""),
        priceChange=metrics.get("priceChange", 0),
        priceChangePercent=metrics.get("priceChangePercent", 0),
        volume=metrics.get("volume", 0),
        quoteVolume=metrics.get("quoteVolume", 0),
    )
