from typing import Optional

from app.schemas.my_base_model import CustomBaseModel


class Chain(CustomBaseModel):
    """Chain/network info (e.g. Binance, Polkadot, Hedera)."""

    id: int = 0
    name: str = ""
    slug: Optional[str] = None
    native_token: Optional[str] = None
    created_at: Optional[str] = None


class SetChainRequest(CustomBaseModel):
    """Body for POST /chains – set the authenticated user's chain."""

    chain_id: int = 1
