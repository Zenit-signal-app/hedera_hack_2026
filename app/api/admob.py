from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from fastapi import HTTPException

from app.core.router_decorated import APIRouter

router = APIRouter()
group_tags: List[str] = ["Admob"]


def _config_path() -> Path:
    # This file lives at: api/app/api/admob.py
    # We want:              api/confidential/admob-config.json
    return Path(__file__).resolve().parents[2] / "confidential" / "admob-config.json"


@router.get(
    "/config",
    summary="Get Admob config",
    description="Return admob IDs",
)
def get_admob_config() -> Dict[str, Any]:
    path = _config_path()
    if not path.exists():
        raise HTTPException(status_code=404, detail="admob-config.json not found")

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Invalid admob-config.json: {exc}") from exc

