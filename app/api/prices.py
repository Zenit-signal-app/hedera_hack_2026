from app.core.router_decorated import APIRouter
from app.core.config import settings
from app.db.session import get_db, get_tables
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from datetime import datetime
import app.schemas.prices as schemas

router = APIRouter()
group_tags = ["Prices"]
tables = get_tables(settings.SCHEMA_1)

# Price-related APIs
# Examples:
# - Get history token prices
# - Get recent token prices
# - Get latest prices
# - Get coin prices

@router.get("/history",
            tags=group_tags,
            response_model=List[schemas.PriceHistory],
            summary="Get token price history",
            description=(
                "**Input:** Query: `symbol` (required), `timeframe` (5m, 30m, 1h, 4h, 1d; default 5m), "
                "`limit` (1–1000, default 100), `from_time` (optional Unix seconds), `to_time` (optional Unix seconds).\n\n"
                "**Output:** List of `PriceHistory`, each with:\n"
                "- **symbol**: Trading pair (e.g. BTCUSDT).\n"
                "- **time**: Candle open time (Unix seconds).\n"
                "- **time_readable**: Human-readable time.\n"
                "- **open**: Open price for the candle.\n"
                "- **high**: High price for the candle.\n"
                "- **low**: Low price for the candle.\n"
                "- **close**: Close price for the candle.\n"
                "- **volume**: Volume for the candle.\n"
                "Ordered by time descending."
            ))
def get_price_history(
    symbol: str,
    timeframe: str = "5m",
    limit: int = 100,
    from_time: Optional[int] = None,
    to_time: Optional[int] = None,
    db: Session = Depends(get_db)
) -> List[schemas.PriceHistory]:
    """Get price history for a token
    
    - symbol: str: token symbol (e.g., 'BTCUSDT', 'ETHUSDT')
    - timeframe: str: time interval (5m, 30m, 1h, 4h, 1D), default '5m'
    - limit: int: number of records to return (default 100, max 1000)
    - from_time: int: start timestamp (Unix epoch in seconds), optional
    - to_time: int: end timestamp (Unix epoch in seconds), optional
    """
    symbol = symbol.strip().upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    
    # Validate symbol doesn't contain SQL injection attempts
    if any(char in symbol for char in ["'", '"', ";", "--", "/*", "*/", "\\"]):
        raise HTTPException(status_code=400, detail="Invalid symbol format")
    
    # Validate and clamp limit
    limit = max(1, min(1000, limit))

    # Validate optional time parameters
    if from_time is not None:
        if from_time < 0:
            raise HTTPException(status_code=400, detail="from_time must be a positive integer")
    if to_time is not None:
        if to_time < 0:
            raise HTTPException(status_code=400, detail="to_time must be a positive integer")
    if from_time is not None and to_time is not None and from_time > to_time:
        raise HTTPException(status_code=400, detail="from_time must be less than or equal to to_time")
    
    # Normalize timeframe and select table (same as zenit-fastapi-main)
    timeframe_original = timeframe.strip()
    timeframe = timeframe_original.lower()
    time_column = "open_time"
    
    # Map timeframes to tables (use price tables where available, otherwise use indicator tables)
    if timeframe == "5m":
        table_name = tables['p5m']
    elif timeframe == "30m":
        table_name = tables['f30m']
    elif timeframe == "1h":
        table_name = tables['p1h']
    elif timeframe == "4h":
        table_name = tables['f4h']
    elif timeframe == "1d":
        # Handle both "1d" and "1D" (zenit-fastapi-main uses "1D")
        table_name = tables['f1d']
    else:
        # Default to 5m if invalid timeframe
        table_name = tables['p5m']
        timeframe = "5m"
    
    # Build dynamic WHERE clause
    where_conditions = [f"symbol = '{symbol}'"]
    if from_time is not None:
        where_conditions.append(f"{time_column} >= {from_time}")
    if to_time is not None:
        where_conditions.append(f"{time_column} <= {to_time}")
    where_clause = " AND ".join(where_conditions)

    query = f"""
        SELECT symbol, {time_column} as time, open, high, low, close, volume
        FROM {table_name}
        WHERE {where_clause}
        ORDER BY {time_column} DESC
        LIMIT {limit}
    """
    
    try:
        result = db.execute(text(query)).fetchall()
    except Exception as e:
        print(f"Error querying price history: {e}")
        raise HTTPException(status_code=500, detail="Query data error")
    
    if not result:
        return []
    
    return [
        schemas.PriceHistory(
            symbol=row.symbol,
            time=row.time,
            time_readable=datetime.fromtimestamp(row.time).strftime('%Y-%m-%d %H:%M:%S UTC') if row.time else '',
            open=row.open,
            high=row.high,
            low=row.low,
            close=row.close,
            volume=row.volume
        )
        for row in result
    ]
