from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional, Sequence

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends, Header, HTTPException, Path, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.jwt_auth import verify_access_token
from app.core.router_decorated import APIRouter
from app.db.session import get_db
from app.schemas import favorites as schemas

router = APIRouter()
group_tags = ["Favorites"]

security = HTTPBearer()


def _sql(value: Any) -> str:
    """Serialize Python primitives for inline SQL queries."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    safe = str(value).replace("'", "''")
    return f"'{safe}'"


def _quote_list(values: Sequence[str]) -> str:
    quoted = [_sql(value.lower()) for value in values if value]
    return ", ".join(quoted)


def _extract_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:

    token = credentials.credentials  # already removes "Bearer "

    payload = verify_access_token(token)

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing user_id",
        )

    return str(user_id)


def _map_row_to_favorite(row: Any, added_at: Optional[datetime]) -> schemas.FavoriteToken:
    return schemas.FavoriteToken(
        token_id=int(row.token_id),
        symbol=str(row.symbol or ""),
        name=row.name,
        chain=row.chain,
        contract_address=row.contract_address,
        is_active=bool(row.is_active),
        added_at=added_at,
    )


@router.get(
    "/",
    response_model=List[schemas.FavoriteToken],
    summary="List favorite tokens",
    description=(
        "**Input:** None (query/body). Requires `Authorization: Bearer <access_token>` (user extracted from JWT).\n\n"
        "**Output:** List of `FavoriteToken`, each with:\n"
        "- **token_id**: ID of the token in production.tokens.\n"
        "- **symbol**: Token symbol.\n"
        "- **name**: Token name.\n"
        "- **chain**: Chain identifier.\n"
        "- **contract_address**: Contract address (if applicable).\n"
        "- **is_active**: Whether the token is active.\n"
        "- **added_at**: When the token was added to the user's favorites.\n"
        "Returns the authenticated user's favorites ordered by symbol."
    ),
)
def list_favorites(
    user_id: str = Depends(_extract_user_id),
    db: Session = Depends(get_db),
) -> List[schemas.FavoriteToken]:
    query = f"""
        SELECT
            t.id AS token_id,
            t.symbol,
            t.name,
            t.chain,
            t.contract_address,
            t.is_active,
            uft.created_at AS added_at
        FROM production.user_favorite_tokens uft
        JOIN production.tokens t ON t.id = uft.token_id
        WHERE uft.user_id = {_sql(user_id)}
        ORDER BY t.symbol
    """
    rows = db.execute(text(query)).fetchall()
    if not rows:
        return []
    return [_map_row_to_favorite(row, row.added_at) for row in rows]


def _load_tokens_for_symbols(db: Session, symbols: List[str]) -> List[Any]:
    unique_symbols = list(dict.fromkeys(symbols))
    quoted = _quote_list(unique_symbols)
    if not quoted:
        return []
    query = f"""
        SELECT
            id AS token_id,
            symbol,
            name,
            chain,
            contract_address,
            is_active
        FROM production.tokens
        WHERE LOWER(symbol) IN ({quoted})
    """
    return db.execute(text(query)).fetchall()


@router.post(
    "/",
    response_model=List[schemas.FavoriteToken],
    status_code=status.HTTP_201_CREATED,
    summary="Add favorite tokens",
    description=(
        "**Input:** Body `FavoriteBulkCreateRequest`: `symbols` (list of strings, at least one; case-insensitive). "
        "Requires `Authorization: Bearer <access_token>`.\n\n"
        "**Output:** List of `FavoriteToken` for each added token (same fields as list: token_id, symbol, name, chain, contract_address, is_active, added_at).\n"
        "404 if any symbol is not found; 409 if any symbol is already favorited."
    ),
)
def add_favorite(
    body: schemas.FavoriteBulkCreateRequest,
    user_id: str = Depends(_extract_user_id),
    db: Session = Depends(get_db),
) -> List[schemas.FavoriteToken]:
    if not body.symbols:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request must include at least one symbol",
        )

    tokens = _load_tokens_for_symbols(db, body.symbols)
    matched_symbols = {str(row.symbol or "").strip().lower() for row in tokens}
    requested = [symbol.strip().lower() for symbol in body.symbols if symbol.strip()]
    missing_symbols = [symbol for symbol in requested if symbol not in matched_symbols]
    if missing_symbols:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tokens not found for symbols: {missing_symbols}",
        )

    token_ids = [int(row.token_id) for row in tokens]
    if not token_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No matching tokens found",
        )

    token_list = ", ".join(str(token_id) for token_id in token_ids)
    existing_rows = db.execute(
        text(
            f"""
            SELECT token_id
            FROM production.user_favorite_tokens
            WHERE user_id = {_sql(user_id)} AND token_id IN ({token_list})
            """
        )
    ).fetchall()
    if existing_rows:
        existing_ids = [int(row.token_id) for row in existing_rows]
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tokens already favorited: {existing_ids}",
        )

    favorites: List[schemas.FavoriteToken] = []
    for row in tokens:
        token_id = int(row.token_id)
        insert_row = db.execute(
            text(
                f"""
                INSERT INTO production.user_favorite_tokens (user_id, token_id)
                VALUES ({_sql(user_id)}, {_sql(token_id)})
                RETURNING created_at
                """
            )
        ).fetchone()
        added_at = insert_row.created_at if insert_row else None
        favorites.append(_map_row_to_favorite(row, added_at))

    db.commit()
    return favorites


@router.delete(
    "/",
    response_model=schemas.FavoriteBulkDeleteResponse,
    summary="Remove favorite tokens",
    description=(
        "**Input:** Body `FavoriteBulkDeleteRequest`: `symbols` (list of strings, at least one). "
        "Requires `Authorization: Bearer <access_token>`.\n\n"
        "**Output:** `FavoriteBulkDeleteResponse` with:\n"
        "- **deleted_symbols**: List of symbols that were removed from favorites.\n"
        "- **missing_symbols**: List of requested symbols that were not in favorites or not found in production.tokens."
    ),
)
def remove_favorite(
    body: schemas.FavoriteBulkDeleteRequest,
    user_id: str = Depends(_extract_user_id),
    db: Session = Depends(get_db),
) -> schemas.FavoriteBulkDeleteResponse:
    if not body.symbols:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one symbol to delete",
        )

    tokens = _load_tokens_for_symbols(db, body.symbols)
    requested = [symbol.strip().lower() for symbol in body.symbols if symbol.strip()]
    symbol_to_ids: dict[str, List[int]] = {}
    for row in tokens:
        symbol = str(row.symbol or "").strip().lower()
        symbol_to_ids.setdefault(symbol, []).append(int(row.token_id))

    delete_list = [token_id for ids in symbol_to_ids.values() for token_id in ids]
    if not delete_list:
        return schemas.FavoriteBulkDeleteResponse(
            deleted_symbols=[],
            missing_symbols=requested,
        )

    token_list = ", ".join(str(token_id) for token_id in delete_list)
    delete_rows = db.execute(
        text(
            f"""
            DELETE FROM production.user_favorite_tokens
            WHERE user_id = {_sql(user_id)} AND token_id IN ({token_list})
            RETURNING token_id
            """
        )
    ).fetchall()
    db.commit()

    deleted_ids = {int(row.token_id) for row in delete_rows}
    deleted_symbols = [
        symbol for symbol, ids in symbol_to_ids.items() if any(token_id in deleted_ids for token_id in ids)
    ]
    missing_symbols = [symbol for symbol in requested if symbol not in deleted_symbols]

    return schemas.FavoriteBulkDeleteResponse(
        deleted_symbols=deleted_symbols,
        missing_symbols=missing_symbols,
    )


def _get_tele_user_id(db: Session, telegram_id: str) -> str:
    row = db.execute(
        text(f"SELECT id FROM production.users_tele WHERE telegram_id = {_sql(telegram_id)}")
    ).fetchone()
    if not row:
        email = f""
        row = db.execute(
            text(f"INSERT INTO production.users_tele (telegram_id, email) VALUES ({_sql(telegram_id)}, {_sql(email)}) RETURNING id")
        ).fetchone()
        db.commit()
    return str(row.id)


@router.get(
    "/telegram",
    response_model=List[schemas.FavoriteToken],
    summary="List favorite tokens by telegram initData",
    description="Returns the user's favorites ordered by symbol. User authenticated via initData.",
)
def list_favorites_tele(
    initData: str,
    db: Session = Depends(get_db),
) -> List[schemas.FavoriteToken]:
    try:
        from app.core.telegram_auth import verify_telegram_auth
        telegram_id = verify_telegram_auth(init_data=initData)
        user_id = _get_tele_user_id(db, telegram_id)
        return list_favorites(user_id=user_id, db=db)
    except Exception:
        return []


@router.post(
    "/telegram",
    response_model=List[schemas.FavoriteToken],
    status_code=status.HTTP_201_CREATED,
    summary="Add favorite tokens by telegram initData",
    description="Adds symbols to favorites for the user specified by initData.",
)
def add_favorite_tele(
    body: schemas.FavoriteBulkCreateTeleRequest,
    db: Session = Depends(get_db),
) -> List[schemas.FavoriteToken]:
    from app.core.telegram_auth import verify_telegram_auth
    telegram_id = verify_telegram_auth(init_data=body.initData)
    user_id = _get_tele_user_id(db, telegram_id)
    req = schemas.FavoriteBulkCreateRequest(symbols=body.symbols)
    return add_favorite(body=req, user_id=user_id, db=db)


@router.delete(
    "/telegram",
    response_model=schemas.FavoriteBulkDeleteResponse,
    summary="Remove favorite tokens by telegram initData",
    description="Removes symbols from favorites for the user specified by initData.",
)
def remove_favorite_tele(
    body: schemas.FavoriteBulkDeleteTeleRequest,
    db: Session = Depends(get_db),
) -> schemas.FavoriteBulkDeleteResponse:
    from app.core.telegram_auth import verify_telegram_auth
    telegram_id = verify_telegram_auth(init_data=body.initData)
    user_id = _get_tele_user_id(db, telegram_id)
    req = schemas.FavoriteBulkDeleteRequest(symbols=body.symbols)
    return remove_favorite(body=req, user_id=user_id, db=db)
