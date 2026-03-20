from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.jwt_auth import verify_access_token
from app.db.chain_resolve import get_slug_for_chain_id
from app.db.session import get_db

security = HTTPBearer()


def _sql_escape(value: str) -> str:
    # Inline escaping for SQL strings built via f-strings.
    # Note: this is not a substitute for parameterized queries, but matches existing code style.
    return str(value).replace("'", "''")


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    payload = verify_access_token(credentials.credentials)
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    return str(user_id)


def get_current_user_chain_id(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> int:
    user_id_safe = _sql_escape(user_id)
    row = db.execute(
        text(
            f"""
            SELECT chain_id
            FROM production.users
            WHERE id = '{user_id_safe}'
            LIMIT 1
            """
        )
    ).fetchone()

    if not row:
        # Treat missing user as auth failure so we don't leak existence.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    cid = getattr(row, "chain_id", None)
    try:
        chain_id = int(cid) if cid is not None else 1
    except (TypeError, ValueError):
        chain_id = 1

    return max(1, chain_id)


def get_current_user_chain_slug(
    db: Session = Depends(get_db),
    chain_id: int = Depends(get_current_user_chain_id),
) -> str:
    # Convenience helper for endpoints that return `chain` slug.
    return get_slug_for_chain_id(db, int(chain_id)) or ""

