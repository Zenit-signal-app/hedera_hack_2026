"""GET /chains – list chains; POST /chains – set authenticated user's chain_id."""

from __future__ import annotations

from typing import Any, List

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.jwt_auth import verify_access_token
from app.core.router_decorated import APIRouter
from app.db.chain_resolve import get_chain_id_for_slug
from app.db.session import get_db
from app.schemas.chains import Chain, SetChainRequest, SetChainTeleRequest
from app.schemas.my_base_model import Message

router = APIRouter()
group_tags = ["Chains"]
security = HTTPBearer()


def _schema_prefix() -> str:
    schema = (settings.SCHEMA_1 or "").strip()
    if schema:
        return f"{schema}."
    return ""


def _chains_table() -> str:
    return _schema_prefix() + "chains"


def _users_table() -> str:
    return _schema_prefix() + "users"


def _sql(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    safe = str(value).replace("'", "''")
    return f"'{safe}'"


def _extract_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    payload = verify_access_token(credentials.credentials)
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing user_id",
        )
    return str(user_id)


@router.get(
    "/chains",
    tags=group_tags,
    response_model=List[Chain],
    summary="List chains",
    description=(
        "Returns all chains from the chains table. Each chain has id, name, slug, native_token, created_at."
    ),
)
def list_chains(db: Session = Depends(get_db)) -> List[Chain]:
    table = _chains_table()
    query = f"""
        SELECT id, name, slug, native_token,
               to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM {table}
        ORDER BY id
    """
    try:
        rows = db.execute(text(query)).fetchall()
    except Exception as e:
        print(f"Error querying chains: {e}")
        raise HTTPException(status_code=500, detail="Query data error")

    return [Chain(
        id=row.id,
        name=row.name or "",
        slug=row.slug,
        native_token=row.native_token,
        created_at=row.created_at,
    ) for row in rows]


@router.post(
    "/user/choose-chain",
    tags=group_tags,
    response_model=Message,
    status_code=status.HTTP_200_OK,
    summary="Set user chain",
    description=(
        "Requires **Authorization: Bearer &lt;access_token&gt;** (JWT). "
        "Updates the authenticated user's chain_id to the given value. "
        "**Body:** `chain` (string, required) – treated as slug, must exist in the chains table. "
        "Returns `{ \"message\": \"success\" }` on success. 400 if chain not found; 401 if not authenticated."
    ),
)
def set_user_chain(
    body: SetChainRequest,
    user_id: str = Depends(_extract_user_id),
    db: Session = Depends(get_db),
) -> Message:
    chain = body.chain
    chains_t = _chains_table()
    users_t = _users_table()

    chain_id = get_chain_id_for_slug(db, chain)
    if chain_id == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="chain not found",
        )

    db.execute(
        text(f"UPDATE {users_t} SET chain_id = {chain_id} WHERE id = {_sql(user_id)}")
    )
    db.commit()
    return Message(message="success")


@router.post(
    "/user/telegram/choose-chain",
    tags=group_tags,
    response_model=Message,
    status_code=status.HTTP_200_OK,
    summary="Set user chain via telegram_id",
    description=(
        "Updates the user's chain_id by telegram_id. "
        "**Body:** `telegram_id` (string, required), `chain` (string, required) – treated as slug, must exist in the chains table. "
        "Returns `{ \"message\": \"success\" }` on success. 400 if chain not found; 404 if user not found."
    ),
)
def set_user_chain_tele(
    body: SetChainTeleRequest,
    db: Session = Depends(get_db),
) -> Message:
    chain = body.chain
    telegram_id = body.telegram_id

    chain_id = get_chain_id_for_slug(db, chain)
    if chain_id == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="chain not found",
        )

    result = db.execute(
        text(f"UPDATE production.users_tele SET chain_id = {chain_id} WHERE telegram_id = {_sql(telegram_id)} RETURNING id")
    )
    if not result.fetchone():
        email = f""
        db.execute(
            text(f"INSERT INTO production.users_tele (telegram_id, email, chain_id) VALUES ({_sql(telegram_id)}, {_sql(email)}, {chain_id})")
        )
    db.commit()
    return Message(message="success")
