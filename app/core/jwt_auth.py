from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from fastapi import HTTPException, status

from app.core.config import settings


def create_access_token(
    user_id: str, extra_claims: Optional[Dict[str, Any]] = None
) -> str:
    if not settings.ENCODE_KEY:
        raise RuntimeError("ENCODE_KEY is not configured")

    now = datetime.now(timezone.utc)
    expire_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES or 30
    exp = now + timedelta(minutes=expire_minutes)

    payload: Dict[str, Any] = {
        "typ": "access",
        "sub": user_id,
        "user_id": user_id,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(
        payload,
        settings.ENCODE_KEY,
        algorithm=settings.ENCODE_ALGORITHM or "HS256",
    )


def verify_access_token(token: str) -> Dict[str, Any]:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token"
        )

    if not settings.ENCODE_KEY:
        raise RuntimeError("ENCODE_KEY is not configured")

    try:
        payload = jwt.decode(
            token,
            settings.ENCODE_KEY,
            algorithms=[settings.ENCODE_ALGORITHM or "HS256"],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )

    if payload.get("typ") != "access" or not payload.get("user_id"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload"
        )
    return payload

