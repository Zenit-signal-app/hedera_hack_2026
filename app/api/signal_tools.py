from app.core.router_decorated import APIRouter
from app.core.config import settings
from app.db.chain_resolve import get_chain_id_for_slug, get_slug_for_chain_id
from app.db.session import get_db, get_tables
from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pathlib import Path
from typing import List, Dict, Any, Optional
import json
import app.schemas.signal_tools as schemas
from app.services.candle_engine import (
    Candle,
    IndicatorState,
    step_indicators,
    candle_from_ohlcv,
)

router = APIRouter()
group_tags = ["Signal Tools"]

# Coin image URLs from coins_data.json (same as GET /tokens)
COINS_DATA_PATH = Path(__file__).resolve().parents[2] / "coins_data.json"


def _load_coin_images(path: Path) -> Dict[str, str]:
    """Load symbol -> image URL from coins_data.json. Key is coin (e.g. btc) lowercase."""
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    images: Dict[str, str] = {}
    for item in data:
        symbol = (item.get("symbol") or "").strip().lower()
        image = item.get("image") or ""
        if symbol:
            images[symbol] = image
    return images


COIN_IMAGE_MAP = _load_coin_images(COINS_DATA_PATH)

# Minimum candles needed for each indicator (from candle_engine warmup)
MIN_CANDLES_RSI = 15
MIN_CANDLES_ADX = 29
MIN_CANDLES_PSAR = 15


def _table_for_timeframe(timeframe: str) -> str:
    """
    Map timeframe from the request to the DB table name.
    Uses SCHEMA_1 and f_coin_signal_* tables (indicator/signal data).
    """
    tables = get_tables(settings.SCHEMA_1)
    tf = timeframe.strip().lower()
    if tf == "5m":
        return tables["f5m"]
    if tf == "30m":
        return tables["f30m"]
    if tf == "1h":
        return tables["f1h"]
    if tf == "4h":
        return tables["f4h"]
    if tf == "1d":
        return tables["f1d"]
    return tables["f5m"]


def _fetch_candles(
    db: Session,
    symbol: str,
    timeframe: str = "5m",
    limit: int = 100,
    chain_id: Optional[int] = None,
) -> List[Candle]:
    """
    Fetch OHLCV from the database: SCHEMA_1 and the f_coin_signal_* table
    corresponding to the requested timeframe. Returns Candles in ascending open_time order.
    """
    table_name = _table_for_timeframe(timeframe)
    symbol_safe = symbol.strip().upper()
    limit = max(MIN_CANDLES_ADX, min(1000, limit))
    chain_filter = f"AND chain_id = {int(chain_id)}" if chain_id is not None else ""
    # Fetch latest N candles (DESC), then reverse so we have chronological order for the engine
    query = f"""
        SELECT open_time as time, open, high, low, close, volume
        FROM {table_name}
        WHERE symbol = '{symbol_safe}' {chain_filter}
        ORDER BY open_time DESC
        LIMIT {limit}
    """
    try:
        rows = db.execute(text(query)).fetchall()
    except Exception as e:
        print(f"Error fetching candles for indicators: {e}")
        raise HTTPException(status_code=500, detail="Query data error")
    candles_desc = [
        candle_from_ohlcv(
            open_time=row.time,
            open_=row.open,
            high=row.high,
            low=row.low,
            close=row.close,
            volume=row.volume,
        )
        for row in rows
    ]
    # Reverse to ascending open_time so step_indicators sees chronological order
    return list(reversed(candles_desc))


def _compute_all_indicators(candles: List[Candle]) -> List[Dict[str, Any]]:
    """
    Run candle_engine.step_indicators over all candles and return one indicator dict per candle
    in chronological order. Returns newest-first so data[0] is the latest candle.
    """
    if not candles:
        return []
    state = IndicatorState()
    prev: Optional[Candle] = None
    results: List[Dict[str, Any]] = []
    for i, c in enumerate(candles):
        state, out = step_indicators(state, c, prev, candle_count=i + 1)
        results.append(out)
        prev = c
    # Newest first (last candle in chronological order = first in response)
    return list(reversed(results))

@router.get("/",
            tags=group_tags,
            response_model=List[schemas.SignalTool],
            summary="List signal tools",
            description=(
                "**Input:** None (no query or body).\n\n"
                "**Output:** List of `SignalTool`, each with:\n"
                "- **id**: Tool ID.\n"
                "- **code**: Tool code identifier.\n"
                "- **name**: Display name.\n"
                "- **type**: Type (e.g. indicator, confluence).\n"
                "- **description**: Tool description text.\n"
                "- **icon_path**: Path to icon asset.\n"
                "- **display_order**: Order for UI display.\n"
                "- **metadata**: Optional JSON metadata.\n"
                "- **created_at**: When created (ISO timestamp).\n"
                "- **updated_at**: When last updated (ISO timestamp).\n"
                "Ordered by type then display_order; includes both indicators and confluences from production.signal_tools."
            ))
def get_signal_tools(
    db: Session = Depends(get_db)
) -> List[schemas.SignalTool]:
    query = f"""
        SELECT 
            id,
            code,
            name,
            type,
            description,
            icon_path,
            display_order,
            metadata,
            created_at,
            updated_at
        FROM production.signal_tools
        ORDER BY type ASC, display_order ASC, id ASC
    """
    
    try:
        result = db.execute(text(query)).fetchall()
    except Exception as e:
        print(f"Error querying signal tools: {e}")
        raise HTTPException(status_code=500, detail="Query data error")
    
    if not result:
        return []
    
    def parse_metadata(metadata_value: Any) -> Dict[str, Any]:
        """Parse metadata from database (handles JSONB, dict, string, or None)"""
        if metadata_value is None:
            return {}
        if isinstance(metadata_value, dict):
            return metadata_value
        if isinstance(metadata_value, str):
            try:
                return json.loads(metadata_value)
            except (json.JSONDecodeError, TypeError):
                return {}
        return {}
    
    return [
        schemas.SignalTool(
            id=row.id,
            code=row.code,
            name=row.name,
            type=row.type,
            description=row.description,
            icon_path=row.icon_path,
            display_order=row.display_order,
            metadata=parse_metadata(row.metadata),
            created_at=row.created_at.isoformat() if row.created_at else None,
            updated_at=row.updated_at.isoformat() if row.updated_at else None
        )
        for row in result
    ]


@router.get(
    "/rsi_heatmap",
    tags=group_tags,
    response_model=schemas.RSIResponse,
    summary="Get RSI indicator",
    description=(
        "Returns the Relative Strength Index (RSI) for the given symbol and timeframe. "
        "Data is read from the database (SCHEMA_1, f_coin_signal_* table for the requested timeframe). "
        "RSI is computed with Wilder smoothing; both 7-period and 14-period values are returned.\n\n"
        "**Request (query parameters):**\n"
        "- **symbol** (required): Trading pair symbol, e.g. BTCUSDT, ETHUSDT.\n"
        "- **timeframe** (optional): Candle interval; one of 5m, 30m, 1h, 4h, 1d. Default: 5m.\n"
        "- **limit** (optional): Number of candles to fetch for computation (min 29, max 1000). Default: 100.\n\n"
        "**Response:**\n"
        "- **symbol**: Trading pair symbol echoed from the request.\n"
        "- **timeframe**: Candle interval used (5m, 30m, 1h, 4h, 1d).\n"
        "- **data**: List of RSI records, one per candle; newest first. Length equals limit (e.g. 100).\n\n"
        "**Fields of each data record:**\n"
        "- **open_time**: Unix timestamp (seconds) of the candle this record refers to.\n"
        "- **rsi7**: RSI 7-period with Wilder smoothing; value between 0 and 100; null until 8 candles of warmup.\n"
        "- **rsi14**: RSI 14-period with Wilder smoothing; value between 0 and 100; null until 15 candles of warmup."
    ),
)
def get_rsi(
    symbol: str = Query(..., description="Trading pair symbol (e.g. BTCUSDT, ETHUSDT). Required."),
    timeframe: str = Query("5m", description="Candle interval: 5m, 30m, 1h, 4h, or 1d. Default 5m."),
    chain: Optional[str] = Query(None, description="Optional chain string (treated as slug)."),
    limit: int = Query(100, ge=29, le=1000, description="Number of candles to load (29–1000). Default 100. Response data length equals this."),
    db: Session = Depends(get_db),
) -> schemas.RSIResponse:
    symbol = symbol.strip().upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    if any(c in symbol for c in ["'", '"', ";", "--", "/*", "*/", "\\"]):
        raise HTTPException(status_code=400, detail="Invalid symbol format")
    chain_id = get_chain_id_for_slug(db, chain) if (chain and chain.strip()) else None
    if chain and chain.strip() and chain_id == 0:
        raise HTTPException(status_code=400, detail="Chain not found")
    timeframe = timeframe.strip().lower() or "5m"
    candles = _fetch_candles(db, symbol, timeframe, limit, chain_id=chain_id)
    if len(candles) < MIN_CANDLES_RSI:
        raise HTTPException(
            status_code=422,
            detail=f"Not enough candles for RSI (need at least {MIN_CANDLES_RSI})",
        )
    all_ind = _compute_all_indicators(candles)
    chain_val = get_slug_for_chain_id(db, chain_id) if chain_id else (get_slug_for_chain_id(db, 1) or "")
    return schemas.RSIResponse(
        symbol=symbol,
        chain=chain_val,
        timeframe=timeframe,
        data=[
            schemas.RSIDataPoint(open_time=o.get("open_time"), rsi7=o.get("rsi7"), rsi14=o.get("rsi14"))
            for o in all_ind
        ],
    )


@router.get(
    "/adx",
    tags=group_tags,
    response_model=schemas.ADXResponse,
    summary="Get ADX indicator",
    description=(
        "Returns the Average Directional Index (ADX) and +DI / -DI for the given symbol and timeframe. "
        "Data is read from the database (SCHEMA_1, f_coin_signal_* table for the requested timeframe). "
        "Uses 14-period smoothing.\n\n"
        "**Request (query parameters):**\n"
        "- **symbol** (required): Trading pair symbol, e.g. BTCUSDT, ETHUSDT.\n"
        "- **timeframe** (optional): Candle interval; one of 5m, 30m, 1h, 4h, 1d. Default: 5m.\n"
        "- **limit** (optional): Number of candles to fetch for computation (min 29, max 1000). Default: 100.\n\n"
        "**Response:**\n"
        "- **symbol**: Trading pair symbol echoed from the request.\n"
        "- **timeframe**: Candle interval used (5m, 30m, 1h, 4h, 1d).\n"
        "- **data**: List of ADX records, one per candle; newest first. Length equals limit (e.g. 100).\n\n"
        "**Fields of each data record:**\n"
        "- **open_time**: Unix timestamp (seconds) of the candle this record refers to.\n"
        "- **adx**: Average Directional Index (14-period smoothed); higher values indicate a stronger trend; null until 29 candles of warmup.\n"
        "- **di_plus**: Plus Directional Indicator (+DI14); null until warmup.\n"
        "- **di_minus**: Minus Directional Indicator (-DI14); null until warmup.\n"
        "- **trend**: Either \"uptrend\", \"downtrend\", or empty string; computed from the latest 5 candles when adx >= 50; only set on the newest record."
    ),
)
def get_adx(
    symbol: str = Query(..., description="Trading pair symbol (e.g. BTCUSDT, ETHUSDT). Required."),
    timeframe: str = Query("5m", description="Candle interval: 5m, 30m, 1h, 4h, or 1d. Default 5m."),
    chain: Optional[str] = Query(None, description="Optional chain string (treated as slug)."),
    limit: int = Query(100, ge=29, le=1000, description="Number of candles to load (29–1000). Default 100. Response data length equals this."),
    db: Session = Depends(get_db),
) -> schemas.ADXResponse:
    symbol = symbol.strip().upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    if any(c in symbol for c in ["'", '"', ";", "--", "/*", "*/", "\\"]):
        raise HTTPException(status_code=400, detail="Invalid symbol format")
    chain_id = get_chain_id_for_slug(db, chain) if (chain and chain.strip()) else None
    if chain and chain.strip() and chain_id == 0:
        raise HTTPException(status_code=400, detail="Chain not found")
    timeframe = timeframe.strip().lower() or "5m"
    candles = _fetch_candles(db, symbol, timeframe, limit, chain_id=chain_id)
    if len(candles) < MIN_CANDLES_ADX:
        raise HTTPException(
            status_code=422,
            detail=f"Not enough candles for ADX (need at least {MIN_CANDLES_ADX})",
        )
    all_ind = _compute_all_indicators(candles)
    trend = ""
    if all_ind:
        latest_adx = all_ind[0].get("adx")
        if latest_adx is not None and latest_adx >= 50 and len(candles) >= 5:
            last_closes = [c.close for c in candles[-5:]]
            if len(last_closes) == 5 and all(close is not None for close in last_closes):
                latest_close = last_closes[-1]
                fifth_close = last_closes[0]
                avg_close = sum(last_closes) / 5
                if latest_close > avg_close and latest_close > fifth_close:
                    trend = "uptrend"
                elif latest_close < avg_close and latest_close < fifth_close:
                    trend = "downtrend"
    data = []
    for idx, o in enumerate(all_ind):
        data.append(
            schemas.ADXDataPoint(
                open_time=o.get("open_time"),
                adx=o.get("adx"),
                di_plus=o.get("di14_p"),
                di_minus=o.get("di14_n"),
                trend=trend if idx == 0 else "",
            )
        )
    chain_val = get_slug_for_chain_id(db, chain_id) if chain_id else (get_slug_for_chain_id(db, 1) or "")
    return schemas.ADXResponse(
        symbol=symbol,
        chain=chain_val,
        timeframe=timeframe,
        data=data,
    )


@router.get(
    "/psar",
    tags=group_tags,
    response_model=schemas.PSARResponse,
    summary="Get PSAR indicator",
    description=(
        "Returns the Parabolic SAR (Stop and Reverse) for the given symbol and timeframe. "
        "Data is read from the database (SCHEMA_1, f_coin_signal_* table for the requested timeframe).\n\n"
        "**Request (query parameters):**\n"
        "- **symbol** (required): Trading pair symbol, e.g. BTCUSDT, ETHUSDT.\n"
        "- **timeframe** (optional): Candle interval; one of 5m, 30m, 1h, 4h, 1d. Default: 5m.\n"
        "- **limit** (optional): Number of candles to fetch for computation (min 29, max 1000). Default: 100.\n\n"
        "**Response:**\n"
        "- **symbol**: Trading pair symbol echoed from the request.\n"
        "- **timeframe**: Candle interval used (5m, 30m, 1h, 4h, 1d).\n"
        "- **data**: List of PSAR records, one per candle; newest first. Length equals limit (e.g. 100).\n\n"
        "**Fields of each data record:**\n"
        "- **open_time**: Unix timestamp (seconds) of the candle this record refers to.\n"
        "- **psar**: Parabolic SAR value (stop level for the current trend); null until 15 candles of warmup.\n"
        "- **psar_type**: Trend direction: UP or DOWN; null until warmup.\n"
        "- **ep**: Extreme point (highest high in uptrend, lowest low in downtrend); null until warmup.\n"
        "- **af**: Acceleration factor, typically between 0.02 and 0.2; null until warmup.\n"
        "- **psar_turn**: 1 if a reversal occurred on this candle, 0 otherwise; null until warmup.\n"
        "- **trend**: Either \"uptrend\", \"downtrend\", or empty string; computed by comparing the latest two psar_type values; only set on the newest record."
    ),
)
def get_psar(
    symbol: str = Query(..., description="Trading pair symbol (e.g. BTCUSDT, ETHUSDT). Required."),
    timeframe: str = Query("5m", description="Candle interval: 5m, 30m, 1h, 4h, or 1d. Default 5m."),
    chain: Optional[str] = Query(None, description="Optional chain string (treated as slug)."),
    limit: int = Query(100, ge=29, le=1000, description="Number of candles to load (29–1000). Default 100. Response data length equals this."),
    db: Session = Depends(get_db),
) -> schemas.PSARResponse:
    symbol = symbol.strip().upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    if any(c in symbol for c in ["'", '"', ";", "--", "/*", "*/", "\\"]):
        raise HTTPException(status_code=400, detail="Invalid symbol format")
    chain_id = get_chain_id_for_slug(db, chain) if (chain and chain.strip()) else None
    if chain and chain.strip() and chain_id == 0:
        raise HTTPException(status_code=400, detail="Chain not found")
    timeframe = timeframe.strip().lower() or "5m"
    candles = _fetch_candles(db, symbol, timeframe, limit, chain_id=chain_id)
    if len(candles) < MIN_CANDLES_PSAR:
        raise HTTPException(
            status_code=422,
            detail=f"Not enough candles for PSAR (need at least {MIN_CANDLES_PSAR})",
        )
    all_ind = _compute_all_indicators(candles)
    trend = ""
    if len(all_ind) >= 2:
        latest_type = all_ind[0].get("psar_type")
        prev_type = all_ind[1].get("psar_type")
        if latest_type and prev_type and latest_type != prev_type:
            if latest_type == "UP":
                trend = "uptrend"
            elif latest_type == "DOWN":
                trend = "downtrend"
    data = []
    for idx, o in enumerate(all_ind):
        data.append(
            schemas.PSARDataPoint(
                open_time=o.get("open_time"),
                psar=o.get("psar"),
                psar_type=o.get("psar_type"),
                ep=o.get("ep"),
                af=o.get("af"),
                psar_turn=o.get("psar_turn"),
                trend=trend if idx == 0 else "",
            )
        )
    chain_val = get_slug_for_chain_id(db, chain_id) if chain_id else (get_slug_for_chain_id(db, 1) or "")
    return schemas.PSARResponse(
        symbol=symbol,
        chain=chain_val,
        timeframe=timeframe,
        data=data,
    )


@router.get(
    "/rsi_heatmap/latest",
    tags=group_tags,
    response_model=List[schemas.RSILatestRecord],
    summary="Get latest RSI for all tokens",
    description=(
        "Returns the latest RSI values (RSI7 and RSI14) for all tokens in a given timeframe. "
        "Data is read from the database (SCHEMA_1, f_coin_signal_* table for the requested timeframe). "
        "For each symbol, the record with the maximum open_time is returned.\n\n"
        "**Request (query parameters):**\n"
        "- **timeframe** (optional): Candle interval; one of 5m, 30m, 1h, 4h, 1d. Default: 5m.\n\n"
        "**Response:**\n"
        "- Array of objects, one per symbol, each containing:\n"
        "  - **symbol**: Trading pair symbol (e.g. BTCUSDT).\n"
        "  - **timeframe**: Candle interval used (5m, 30m, 1h, 4h, 1d).\n"
        "  - **open_time**: Unix timestamp (seconds) of the latest candle for this symbol.\n"
        "  - **rsi7**: RSI 7-period at the latest candle; may be null if warmup is not met.\n"
        "  - **rsi14**: RSI 14-period at the latest candle; may be null if warmup is not met.\n"
        "  - **image**: Coin image URL from coins_data.json (same source as GET /tokens)."
    ),
)
def get_rsi_latest_all_tokens(
    timeframe: str = Query("5m", description="Candle interval: 5m, 30m, 1h, 4h, or 1d. Default 5m."),
    chain: Optional[str] = Query(None, description="Optional chain string (treated as slug)."),
    db: Session = Depends(get_db),
) -> List[schemas.RSILatestRecord]:
    """
    Get the latest RSI record (RSI7 and RSI14) for all tokens in the given timeframe.
    Uses a single SQL query against the appropriate f_coin_signal_* table.
    """
    chain_id = get_chain_id_for_slug(db, chain) if (chain and chain.strip()) else None
    if chain and chain.strip() and chain_id == 0:
        raise HTTPException(status_code=400, detail="Chain not found")
    tf = timeframe.strip().lower() or "5m"
    table_name = _table_for_timeframe(tf)
    chain_filter = f"AND chain_id = {int(chain_id)}" if chain_id is not None else ""

    query = f"""
        SELECT s.symbol, s.open_time, s.rsi7, s.rsi14, s.chain_id
        FROM {table_name} s
        JOIN (
            SELECT symbol, MAX(open_time) AS open_time
            FROM {table_name}
            WHERE 1=1 {chain_filter}
            GROUP BY symbol
        ) latest
        ON s.symbol = latest.symbol AND s.open_time = latest.open_time
        {f"WHERE s.chain_id = {int(chain_id)}" if chain_id is not None else ""}
        ORDER BY s.symbol ASC
    """

    try:
        rows = db.execute(text(query)).fetchall()
    except Exception as e:
        print(f"Error querying latest RSI for all tokens: {e}")
        raise HTTPException(status_code=500, detail="Query data error")

    def _rsi_signal(val: Optional[float]) -> str:
        if val is None:
            return ""
        if val >= 70:
            return "over bought"
        if val <= 30:
            return "over sold"
        return ""

    out = []
    for row in rows:
        sym = row.symbol or ""
        coin_key = (sym[:-4] if sym.upper().endswith("USDT") else sym).strip().lower()
        image = COIN_IMAGE_MAP.get(coin_key, "")
        rsi7_val = getattr(row, "rsi7", None)
        rsi14_val = getattr(row, "rsi14", None)
        cid = int(getattr(row, "chain_id", 1) or 1)
        chain_val = get_slug_for_chain_id(db, cid)
        out.append(
            schemas.RSILatestRecord(
                symbol=sym,
                timeframe=tf,
                chain=chain_val,
                open_time=row.open_time if hasattr(row, "open_time") else getattr(row, "open_time", None),
                rsi7=rsi7_val,
                rsi14=rsi14_val,
                rsi7_signal=_rsi_signal(rsi7_val),
                rsi14_signal=_rsi_signal(rsi14_val),
                image=image,
            )
        )
    return out
