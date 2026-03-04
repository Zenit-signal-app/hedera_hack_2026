from app.core.router_decorated import APIRouter
from app.db.session import get_db
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any
import json
import app.schemas.signal_tools as schemas

router = APIRouter()
group_tags = ["Signal Tools"]

@router.get("/",
            tags=group_tags,
            response_model=List[schemas.SignalTool],
            summary="List signal tools",
            description=(
                "Return all configured signal tools (indicators and confluences) "
                "ordered by `type`, then `display_order`."
            ))
def get_signal_tools(
    db: Session = Depends(get_db)
) -> List[schemas.SignalTool]:
    """Get all signal tools (both indicators and confluences)
    
    Returns a list of all signal tools (indicators and confluences),
    ordered by type, then display_order.
    """
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
