from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Sequence

import requests
from requests.exceptions import RequestException

from fastapi import Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.router_decorated import APIRouter
from app.core.config import settings
from app.db.chain_resolve import get_chain_id_for_slug, get_slug_for_chain_id
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
        "**Input:** Query: `key` (optional), `chain` (optional chain string, treated as slug), `offset` (≥0, default 0), `limit` (1–500, default 100).\n\n"
        "**Output:** List of `Token`, each with:\n"
        "- **symbol**: Trading pair (e.g. BTCUSDT).\n"
        "- **coin**: Base coin (e.g. BTC).\n"
        "- **chain**: Slug value from chains table.\n"
        "- **price**: Latest cached price.\n"
        "- **time**: Unix timestamp of the price.\n"
        "- **time_readable**: Human-readable time (e.g. YYYY-MM-DD HH:MM:SS UTC).\n"
        "- **image**: Coin image URL.\n"
        "- **priceChange**: 24h price change (from Binance when available).\n"
        "- **priceChangePercent**: 24h price change percentage.\n"
        "- **volume**: 24h volume in base asset.\n"
        "- **quoteVolume**: 24h volume in quote asset (e.g. USDT).\n"
        "Latest price from DB; 24h metrics from Binance when available."
    ),
)
def list_all_tokens(
    key: Optional[str] = None,
    chain: Optional[str] = None,
    offset: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> List[schemas.Token]:
    chain_id = get_chain_id_for_slug(db, chain) if (chain and chain.strip()) else None
    if chain and chain.strip() and chain_id == 0:
        raise HTTPException(status_code=400, detail="Chain not found")
    offset = max(0, offset)
    limit = max(1, min(500, limit))
    table_5m = tables['p5m']
    key_filter = _build_key_filter(key)
    chain_filter = f"AND chain_id = {int(chain_id)}" if chain_id is not None else ""
    
    # Query distinct symbols with their latest prices (per chain when chain_id filtered)
    # Using f-string as per project requirements (no parameterized queries)
    query = f"""
        SELECT 
            symbol,
            chain_id,
            left(symbol, char_length(symbol) - 4) as coin,
            close as price,
            open_time as time
        FROM (
            SELECT 
                symbol,
                chain_id,
                close,
                open_time,
                row_number() over (PARTITION by symbol, chain_id order by open_time desc) AS r
            FROM {table_5m}
            WHERE open_time > extract(epoch from now())::bigint - 1800
            {key_filter}
            {chain_filter}
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
    
    requested_symbols = [row.symbol for row in result if row.symbol]
    binance_metrics = _fetch_binance_tickers(requested_symbols)

    tokens = []
    for row in result:
        coin_key = (row.coin or "").strip().lower()
        cid = getattr(row, "chain_id", 1) or 1
        chain_val = get_slug_for_chain_id(db, int(cid))
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
                priceChange=binance_metrics.get(row.symbol, {}).get("priceChange", 0),
                priceChangePercent=binance_metrics.get(row.symbol, {}).get("priceChangePercent", 0),
                volume=binance_metrics.get(row.symbol, {}).get("volume", 0),
                quoteVolume=binance_metrics.get(row.symbol, {}).get("quoteVolume", 0),
            )
        )
    return tokens


@router.get(
    "/{symbol}",
    tags=group_tags,
    response_model=schemas.Token,
    summary="Get token by symbol",
    description=(
        "**Input:** Path `symbol` (required). Query: `chain` (optional chain string, treated as slug).\n\n"
        "**Output:** Single `Token` with:\n"
        "- **symbol**: Trading pair (e.g. BTCUSDT).\n"
        "- **coin**: Base coin (e.g. BTC).\n"
        "- **chain**: Slug value from chains table.\n"
        "- **price**: Latest cached price.\n"
        "- **time**: Unix timestamp of the price.\n"
        "- **time_readable**: Human-readable time (e.g. YYYY-MM-DD HH:MM:SS UTC).\n"
        "- **image**: Coin image URL.\n"
        "- **priceChange**: 24h price change (from Binance when available).\n"
        "- **priceChangePercent**: 24h price change percentage.\n"
        "- **volume**: 24h volume in base asset.\n"
        "- **quoteVolume**: 24h volume in quote asset (e.g. USDT).\n"
        "404 if symbol not found."
    ),
)
def get_token(
    symbol: str,
    chain: Optional[str] = None,
    db: Session = Depends(get_db),
) -> schemas.Token:
    chain_id = get_chain_id_for_slug(db, chain) if (chain and chain.strip()) else None
    if chain and chain.strip() and chain_id == 0:
        raise HTTPException(status_code=400, detail="Chain not found")
    symbol_clean = _sanitize_symbol(symbol)
    table_5m = tables["p5m"]
    chain_filter = f"AND chain_id = {int(chain_id)}" if chain_id is not None else ""
    query = f"""
        SELECT
            symbol,
            chain_id,
            left(symbol, char_length(symbol) - 4) as coin,
            close as price,
            open_time as time
        FROM (
            SELECT
                symbol,
                chain_id,
                close,
                open_time,
                row_number() over (PARTITION by symbol, chain_id order by open_time desc) AS r
            FROM {table_5m}
            WHERE symbol = '{symbol_clean}'
            {chain_filter}
        ) latest_prices
        WHERE r = 1
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
    binance_metrics = _fetch_binance_tickers([symbol_clean]).get(symbol_clean, {})
    cid = getattr(row, "chain_id", 1) or 1
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
        priceChange=binance_metrics.get("priceChange", 0),
        priceChangePercent=binance_metrics.get("priceChangePercent", 0),
        volume=binance_metrics.get("volume", 0),
        quoteVolume=binance_metrics.get("quoteVolume", 0),
    )
