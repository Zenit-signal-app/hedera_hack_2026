from typing import Optional, Dict, Any, List
from pydantic import Field
from app.schemas.my_base_model import CustomBaseModel


class RSIDataPoint(CustomBaseModel):
    """One RSI record per candle."""
    open_time: Optional[int] = Field(None, description="Unix timestamp (seconds) of the candle.")
    rsi7: Optional[float] = Field(None, description="RSI 7-period (Wilder smoothing). Range 0–100.")
    rsi14: Optional[float] = Field(None, description="RSI 14-period (Wilder smoothing). Range 0–100.")


class RSIResponse(CustomBaseModel):
    """Response for GET /signal-tools/rsi. data is newest-first (latest candle first)."""
    symbol: str = Field("", description="Trading pair symbol (e.g. BTCUSDT).")
    timeframe: str = Field("", description="Candle interval used (5m, 30m, 1h, 4h, 1d).")
    data: List[RSIDataPoint] = Field(default_factory=list, description="List of RSI values per candle; newest first. Length equals limit (up to 100).")


class ADXDataPoint(CustomBaseModel):
    """One ADX record per candle."""
    open_time: Optional[int] = Field(None, description="Unix timestamp (seconds) of the candle.")
    adx: Optional[float] = Field(None, description="Average Directional Index (14-period).")
    di_plus: Optional[float] = Field(None, description="Plus Directional Indicator (+DI14).")
    di_minus: Optional[float] = Field(None, description="Minus Directional Indicator (-DI14).")


class ADXResponse(CustomBaseModel):
    """Response for GET /signal-tools/adx. data is newest-first (latest candle first)."""
    symbol: str = Field("", description="Trading pair symbol (e.g. BTCUSDT).")
    timeframe: str = Field("", description="Candle interval used (5m, 30m, 1h, 4h, 1d).")
    data: List[ADXDataPoint] = Field(default_factory=list, description="List of ADX values per candle; newest first. Length equals limit (up to 100).")


class PSARDataPoint(CustomBaseModel):
    """One PSAR record per candle."""
    open_time: Optional[int] = Field(None, description="Unix timestamp (seconds) of the candle.")
    psar: Optional[float] = Field(None, description="Parabolic SAR value (stop level).")
    psar_type: Optional[str] = Field(None, description="Trend direction: UP or DOWN.")
    ep: Optional[float] = Field(None, description="Extreme point.")
    af: Optional[float] = Field(None, description="Acceleration factor (0.02–0.2).")
    psar_turn: Optional[int] = Field(None, description="1 if a reversal occurred on this candle, 0 otherwise.")


class PSARResponse(CustomBaseModel):
    """Response for GET /signal-tools/psar. data is newest-first (latest candle first)."""
    symbol: str = Field("", description="Trading pair symbol (e.g. BTCUSDT).")
    timeframe: str = Field("", description="Candle interval used (5m, 30m, 1h, 4h, 1d).")
    data: List[PSARDataPoint] = Field(default_factory=list, description="List of PSAR values per candle; newest first. Length equals limit (up to 100).")


class RSILatestRecord(CustomBaseModel):
    """Latest RSI record per token for a given timeframe."""
    symbol: str = Field("", description="Trading pair symbol (e.g. BTCUSDT).")
    timeframe: str = Field("", description="Candle interval used (5m, 30m, 1h, 4h, 1d).")
    open_time: Optional[int] = Field(None, description="Unix timestamp (seconds) of the latest candle for this symbol.")
    rsi7: Optional[float] = Field(None, description="RSI 7-period (Wilder smoothing) at the latest candle.")
    rsi14: Optional[float] = Field(None, description="RSI 14-period (Wilder smoothing) at the latest candle.")
    rsi7_signal: str = Field("", description="Signal from rsi7: 'over bought' if >= 70, 'over sold' if <= 30, else ''.")
    rsi14_signal: str = Field("", description="Signal from rsi14: 'over bought' if >= 70, 'over sold' if <= 30, else ''.")
    image: str = Field("", description="Coin image URL from coins_data.json (same as GET /tokens).")


class ADXLatestRecord(CustomBaseModel):
    """Latest ADX record per token for a given timeframe."""
    symbol: str = Field("", description="Trading pair symbol (e.g. BTCUSDT).")
    timeframe: str = Field("", description="Candle interval used (5m, 30m, 1h, 4h, 1d).")
    open_time: Optional[int] = Field(None, description="Unix timestamp (seconds) of the latest candle for this symbol.")
    adx: Optional[float] = Field(None, description="Average Directional Index (14-period) at the latest candle.")
    di_plus: Optional[float] = Field(None, description="Plus Directional Indicator (+DI14) at the latest candle.")
    di_minus: Optional[float] = Field(None, description="Minus Directional Indicator (-DI14) at the latest candle.")
    trend: str = Field("", description="Trend direction based on ADX and price action: uptrend, downtrend, or ''.")
    image: str = Field("", description="Coin image URL from coins_data.json (same as GET /tokens).")


class PSARLatestRecord(CustomBaseModel):
    """Latest PSAR record per token for a given timeframe."""
    symbol: str = Field("", description="Trading pair symbol (e.g. BTCUSDT).")
    timeframe: str = Field("", description="Candle interval used (5m, 30m, 1h, 4h, 1d).")
    open_time: Optional[int] = Field(None, description="Unix timestamp (seconds) of the latest candle for this symbol.")
    psar: Optional[float] = Field(None, description="Parabolic SAR value at the latest candle.")
    psar_type: Optional[str] = Field(None, description="Trend direction at the latest candle: UP or DOWN.")
    ep: Optional[float] = Field(None, description="Extreme point at the latest candle.")
    af: Optional[float] = Field(None, description="Acceleration factor (0.02–0.2) at the latest candle.")
    trend: str = Field("", description="Trend compared to previous candle: uptrend, downtrend, or ''.")
    image: str = Field("", description="Coin image URL from coins_data.json (same as GET /tokens).")


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
