from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import Field, root_validator

from app.schemas.my_base_model import CustomBaseModel


class FavoriteCreateRequest(CustomBaseModel):
    """Payload for marking a token as a favorite."""

    token_id: Optional[int] = None
    symbol: Optional[str] = Field(None, description="Token symbol (case-insensitive)")
    chain: Optional[str] = Field(None, description="Chain identifier")

    @root_validator(skip_on_failure=True)
    def require_identifier(cls, values: dict[str, Optional[str]]) -> dict[str, Optional[str]]:
        token_id = values.get("token_id")
        symbol = values.get("symbol")
        chain = values.get("chain")

        if token_id is None and (not symbol or not chain):
            raise ValueError("Provide token_id or both symbol and chain")

        if symbol:
            values["symbol"] = symbol.strip()
        if chain:
            values["chain"] = chain.strip()

        return values


class FavoriteToken(CustomBaseModel):
    """DTO representing a favorited token entry."""

    token_id: int
    symbol: str = ""
    name: Optional[str] = None
    chain: Optional[str] = None
    contract_address: Optional[str] = None
    is_active: bool = False
    added_at: Optional[datetime] = None


class FavoriteDeleteResponse(CustomBaseModel):
    token_id: int
    removed: bool = False


class FavoriteBulkCreateRequest(CustomBaseModel):
    symbols: List[str] = Field(..., min_items=1)

    @root_validator(skip_on_failure=True)
    def _trim_symbols(cls, values: dict[str, List[str]]) -> dict[str, List[str]]:
        symbols = values.get("symbols")
        if symbols:
            cleaned = [symbol.strip() for symbol in symbols if symbol and symbol.strip()]
            values["symbols"] = cleaned
        return values


class FavoriteBulkDeleteRequest(CustomBaseModel):
    symbols: List[str] = Field(..., min_items=1)

    @root_validator(skip_on_failure=True)
    def _trim_symbols(cls, values: dict[str, List[str]]) -> dict[str, List[str]]:
        symbols = values.get("symbols")
        if symbols:
            cleaned = [symbol.strip() for symbol in symbols if symbol and symbol.strip()]
            values["symbols"] = cleaned
        return values


class FavoriteBulkDeleteResponse(CustomBaseModel):
    deleted_symbols: List[str]
    missing_symbols: List[str]


class FavoriteBulkCreateTeleRequest(FavoriteBulkCreateRequest):
    initData: str


class FavoriteBulkDeleteTeleRequest(FavoriteBulkDeleteRequest):
    initData: str


class FavoriteToken(CustomBaseModel):
    """DTO representing a favorited token entry."""

    token_id: int
    symbol: str = ""
    name: Optional[str] = None
    chain: Optional[str] = None
    contract_address: Optional[str] = None
    is_active: bool = False
    added_at: Optional[datetime] = None


class FavoriteDeleteResponse(CustomBaseModel):
    token_id: int
    removed: bool = False
