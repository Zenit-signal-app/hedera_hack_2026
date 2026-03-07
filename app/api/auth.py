from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Any

from app.core.config import settings
from app.core.jwt_auth import create_access_token
from app.core.router_decorated import APIRouter
from app.db.session import get_db
from app.schemas.auth import (
    FirebaseLoginRequest,
    FirebaseLoginResponse,
    LogoutRequest,
    LogoutResponse,
    RefreshRequest,
    RefreshResponse,
    TokenResponse,
    UserResponse,
)
from app.services.firebase_auth import verify_id_token

router = APIRouter()
group_tags: List[str] = ["Authentication"]

# Authentication APIs:
# - `POST /auth/firebase/login` verifies the Firebase ID token using Firebase Admin,
#   ensures the user exists, and returns backend access + refresh tokens.
# - `POST /auth/refresh` rotates the provided refresh token.
# - `POST /auth/logout` revokes the supplied refresh token.


def _sql(value: Optional[Any]) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    safe = str(value).replace("'", "''")
    return f"'{safe}'"


def _refresh_hash(refresh_token: str) -> str:
    key = settings.REFRESH_TOKEN_HASH_KEY or settings.ENCODE_KEY or settings.SESSION_SECRET_KEY
    if not key:
        raise RuntimeError("Missing REFRESH_TOKEN_HASH_KEY/ENCODE_KEY/SESSION_SECRET_KEY")
    return hmac.new(key.encode("utf-8"), refresh_token.encode("utf-8"), hashlib.sha256).hexdigest()


def _issue_tokens(db: Session, user_id: str, email: str, provider: Optional[str]) -> TokenResponse:
    now = datetime.now(timezone.utc)
    access_token = create_access_token(
        user_id=user_id, extra_claims={"email": email, "provider": provider}
    )
    refresh_token = secrets.token_urlsafe(48)
    token_hash = _refresh_hash(refresh_token)
    expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    db.execute(
        text(
            f"""
            INSERT INTO production.refresh_tokens (user_id, token_hash, expires_at, revoked)
            VALUES ({_sql(user_id)}, {_sql(token_hash)}, {_sql(expires_at.isoformat())}, FALSE)
            """
        )
    )
    db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=(settings.ACCESS_TOKEN_EXPIRE_MINUTES or 30) * 60,
        issued_at=now.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
    )


def _upsert_user(
    db: Session,
    firebase_uid: str,
    email: str,
    display_name: Optional[str],
    photo_url: Optional[str],
    provider: Optional[str],
) -> UserResponse:
    row = db.execute(
        text(
            f"""
            SELECT id, firebase_uid, email, display_name, photo_url, provider, role
            FROM production.users
            WHERE email = {_sql(email)}
            LIMIT 1
            """
        )
    ).fetchone()

    if row:
        row = db.execute(
            text(
                f"""
                UPDATE production.users
                SET firebase_uid = {_sql(firebase_uid)},
                    display_name = {_sql(display_name)},
                    photo_url = {_sql(photo_url)},
                    provider = {_sql(provider)},
                    updated_at = now()
                WHERE id = {_sql(str(row.id))}
                RETURNING id, firebase_uid, email, display_name, photo_url, provider, role
                """
            )
        ).fetchone()
        db.commit()
    else:
        row = db.execute(
            text(
                f"""
                INSERT INTO production.users (firebase_uid, email, display_name, photo_url, provider, role)
                VALUES ({_sql(firebase_uid)}, {_sql(email)}, {_sql(display_name)}, {_sql(photo_url)}, {_sql(provider)}, 'user')
                RETURNING id, firebase_uid, email, display_name, photo_url, provider, role
                """
            )
        ).fetchone()
        db.commit()

    if not row:
        raise HTTPException(status_code=500, detail="Could not upsert user")

    return UserResponse(
        id=str(row.id),
        firebase_uid=str(row.firebase_uid),
        email=str(row.email),
        display_name=row.display_name,
        photo_url=row.photo_url,
        provider=row.provider,
        role=str(row.role or "user"),
    )


@router.post(
    "/firebase/login",
    response_model=FirebaseLoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Exchange Firebase ID token for backend tokens",
    description=(
        "**Input:** Body with `token` (string, required) — Firebase ID token from Google/Apple sign-in.\n\n"
        "**Output:** `FirebaseLoginResponse` with:\n"
        "- **tokens**: access_token (JWT for API calls), refresh_token (for rotating session), token_type (e.g. bearer), expires_in (seconds), issued_at (ISO timestamp).\n"
        "- **user**: id (backend user ID), firebase_uid, email, display_name, photo_url, provider (sign-in provider), role.\n"
        "Validates the token via Firebase Admin, upserts `production.users`, and issues backend access + refresh tokens.\n\n"
        "400 if token is empty or missing email; 401 if token is invalid."
    ),
)
def firebase_login(body: FirebaseLoginRequest, db: Session = Depends(get_db)) -> FirebaseLoginResponse:
    if not body.token.strip():
        raise HTTPException(status_code=400, detail="token is required")
    try:
        decoded: Dict[str, Any] = verify_id_token(body.token.strip())
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Firebase token: {exc}")

    firebase_uid = str(decoded.get("uid") or "")
    if not firebase_uid:
        raise HTTPException(status_code=401, detail="Firebase uid missing")

    email = (decoded.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Firebase token missing email")

    firebase_claim = decoded.get("firebase")
    provider = (
        firebase_claim.get("sign_in_provider")
        if isinstance(firebase_claim, dict)
        else None
    )
    display_name = decoded.get("name")
    photo_url = decoded.get("picture")

    user = _upsert_user(
        db=db,
        firebase_uid=firebase_uid,
        email=email,
        display_name=display_name,
        photo_url=photo_url,
        provider=provider,
    )
    tokens = _issue_tokens(db=db, user_id=user.id, email=user.email, provider=user.provider)
    return FirebaseLoginResponse(tokens=tokens, user=user)


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    status_code=status.HTTP_200_OK,
    summary="Rotate refresh token for existing session",
    description=(
        "**Input:** Body with `refresh_token` (string, required).\n\n"
        "**Output:** `RefreshResponse` with **tokens**: access_token (new JWT), refresh_token (new refresh token), token_type (e.g. bearer), expires_in (seconds), issued_at (ISO timestamp). "
        "Revokes the supplied refresh token and issues a new access + refresh pair.\n\n"
        "401 if token is invalid, revoked, or expired."
    ),
)
def refresh_tokens(body: RefreshRequest, db: Session = Depends(get_db)) -> RefreshResponse:
    refresh_token = body.refresh_token.strip()
    if not refresh_token:
        raise HTTPException(status_code=400, detail="refresh_token is required")

    token_hash = _refresh_hash(refresh_token)
    row = db.execute(
        text(
            f"""
            SELECT id, user_id, expires_at, revoked
            FROM production.refresh_tokens
            WHERE token_hash = {_sql(token_hash)}
            LIMIT 1
            """
        )
    ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if bool(row.revoked):
        raise HTTPException(status_code=401, detail="Refresh token revoked")

    expires_at = row.expires_at
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token expired")

    db.execute(
        text(
            f"""
            UPDATE production.refresh_tokens
            SET revoked = TRUE
            WHERE id = {_sql(str(row.id))}
            """
        )
    )
    db.commit()

    user_row = db.execute(
        text(
            f"""
            SELECT email, provider
            FROM production.users
            WHERE id = {_sql(str(row.user_id))}
            LIMIT 1
            """
        )
    ).fetchone()
    if not user_row:
        raise HTTPException(status_code=401, detail="User not found")

    tokens = _issue_tokens(
        db=db,
        user_id=str(row.user_id),
        email=str(user_row.email),
        provider=user_row.provider,
    )
    return RefreshResponse(tokens=tokens)


@router.post(
    "/logout",
    response_model=LogoutResponse,
    status_code=status.HTTP_200_OK,
    summary="Revoke refresh token",
    description=(
        "**Input:** Body with `refresh_token` (string, required).\n\n"
        "**Output:** `LogoutResponse` with **revoked**: true if the refresh token was found and revoked, false otherwise. "
        "Marks the refresh token as revoked so it cannot be used for /refresh."
    ),
)
def logout(body: LogoutRequest, db: Session = Depends(get_db)) -> LogoutResponse:
    refresh_token = body.refresh_token.strip()
    if not refresh_token:
        raise HTTPException(status_code=400, detail="refresh_token is required")

    token_hash = _refresh_hash(refresh_token)
    result = db.execute(
        text(
            f"""
            UPDATE production.refresh_tokens
            SET revoked = TRUE
            WHERE token_hash = {_sql(token_hash)}
            """
        )
    )
    db.commit()
    return LogoutResponse(revoked=bool(getattr(result, "rowcount", 0)))

