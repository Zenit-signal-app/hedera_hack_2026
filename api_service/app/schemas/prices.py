from typing import List
from pydantic import BaseModel, field_validator
from app.schemas.my_base_model import CustomBaseModel

class LatestPrice(CustomBaseModel):
    coin: str = ''
    price: float = 0
    price_change: float = 0

    @field_validator("price")
    def round_price(cls, v:float) -> float:
        return round(v, 6)

    @field_validator("price_change")
    def round_pc(cls, v: float) -> float:
        return round(v, 2)


class LatestPriceV1(CustomBaseModel):
    coin: str = ''
    time: str = ''
    price: float = 0
    price_change: float = 0
    price_change_percent: float = 0

    @field_validator("price", "price_change")
    def round_price(cls, v:float) -> float:
        return round(v, 6)

    @field_validator("price_change_percent")
    def round_pc(cls, v: float) -> float:
        return round(v, 2)


class Prices(CustomBaseModel):
    price: float = 0
    time: int = 0
    
class CoinPrice(CustomBaseModel):
    symbol: str = ''
    price: float = 0
    price_change: float = 0
    list_prices: List[float] = [0]

    @field_validator("price_change")
    def round_pc(cls, v: float) -> float:
        return round(v, 2)
    
class Indicators(CustomBaseModel):
    timestamp: int = 0
    open: float = 0
    high: float = 0
    low: float = 0
    close: float = 0
    volume: float = 0
    trades: int = 0
    trend1: str = 0
    trend3: str = 0
    trend7: str = 0
    trend14: str = 0
    rsi7: float = 0
    rsi14: float = 0
    rsi7_epl: int = 0
    rsi7_eph: int = 0
    rsi14_epl: int = 0
    rsi14_eph: int = 0
    adx: float = 0
    adx_ep: int = 0
    di_cross: int = 0
    psar: float = 0
    psar_trend: str = 0


class Token(CustomBaseModel):
    symbol: str = ''
    coin: str = ''
    chain: str = ''
    price: float = 0
    time: int = 0
    time_readable: str = ''
    image: str = ''
    priceChange: float = 0
    priceChangePercent: float = 0
    volume: float = 0
    quoteVolume: float = 0

    @field_validator("price")
    def round_price(cls, v: float) -> float:
        return round(v, 6)

    @field_validator("priceChange")
    def round_price_change(cls, v: float) -> float:
        return round(v, 6)

    @field_validator("priceChangePercent")
    def round_price_change_percent(cls, v: float) -> float:
        return round(v, 2)

    @field_validator("volume", "quoteVolume")
    def round_volumes(cls, v: float) -> float:
        return round(v, 2)


class PriceHistory(CustomBaseModel):
    symbol: str = ''
    chain: str = ''
    time: int = 0
    time_readable: str = ''
    open: float = 0
    high: float = 0
    low: float = 0
    close: float = 0
    volume: float = 0

    @field_validator("open", "high", "low", "close")
    def round_price(cls, v: float) -> float:
        return round(v, 6)

    @field_validator("volume")
    def round_volume(cls, v: float) -> float:
        return round(v, 2)


class Currency(CustomBaseModel):
    id: int = 0
    symbol: str = ''
    name: str = ''
    price: float = 0
    volume_24h: float = 0
    percent_change_24h: float = 0
    market_cap: float = 0

    @field_validator("price")
    def round_8(cls, v: float) -> float:
        return round(v, 8)

    @field_validator("volume_24h", "percent_change_24h", "market_cap")
    def round_2(cls, v: float) -> float:
        return round(v, 2)