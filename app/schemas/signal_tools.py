from typing import Optional, Dict, Any
from app.schemas.my_base_model import CustomBaseModel


class SignalTool(CustomBaseModel):
    id: int = 0
    code: str = ''
    name: str = ''
    type: str = ''
    description: Optional[str] = None
    icon_path: Optional[str] = None
    display_order: int = 0
    metadata: Dict[str, Any] = {}
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
