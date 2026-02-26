from app.core.router_decorated import APIRouter
from app.core.config import settings
from app.db.session import get_db, get_tables
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from datetime import datetime
import app.schemas.prices as schemas

router = APIRouter()
group_tags = ["Tokens"]
tables = get_tables(settings.SCHEMA_1)

@router.get("/",
            tags=group_tags,
            response_model=List[schemas.Token])
def list_all_tokens(
    offset: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
) -> List[schemas.Token]:
    """List all available tokens
    
    - offset: int: number of records to skip, default 0, min 0
    - limit: int: number of records to return, default 100, min 1, max 500
    """
    offset = max(0, offset)
    limit = max(1, min(500, limit))
    
    table_5m = tables['p5m']
    
    # Query distinct symbols with their latest prices
    # Using f-string as per project requirements (no parameterized queries)
    query = f"""
        SELECT 
            symbol,
            left(symbol, char_length(symbol) - 4) as coin,
            close as price,
            open_time as time
        FROM (
            SELECT 
                symbol,
                close,
                open_time,
                row_number() over (PARTITION by symbol order by open_time desc) AS r
            FROM {table_5m}
            WHERE open_time > extract(epoch from now())::bigint - 1800
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
    
    return [
        schemas.Token(
            symbol=row.symbol,
            coin=row.coin,
            price=row.price if row.price else 0,
            time=row.time if row.time else 0,
            time_readable=datetime.fromtimestamp(row.time).strftime('%Y-%m-%d %H:%M:%S UTC') if row.time else ''
        )
        for row in result
    ]
