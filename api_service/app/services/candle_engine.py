"""
Candle aggregation and technical indicator calculations.

Single source of truth for time bucketing, OHLCV aggregation, and incremental
indicators (RSI, DM/ATR/ADX, PSAR) per data_process-indicator-and-candle-calculations.md.
All indicator calculations use close price (and previous close / high/low where required).

When candle_count is below the required warmup for an indicator, that indicator
is returned as None (JSON null) in the output dict.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Minimum candles required before each indicator is valid (per doc section 2 and summary table)
WARMUP_TR = 2  # need previous close
WARMUP_RSI7 = 8  # 7-period smoothed gain/loss + current
WARMUP_RSI14 = 15  # 14-period smoothed + current
WARMUP_DM14_ATR14 = 15  # 14-period smoothing for dm14_p/n, atr14; di14_p/n, dx14 depend on these
WARMUP_ATR28 = 29  # 28-period smoothing
WARMUP_ADX = 29  # 14-period smoothing of DX; first DX at 15, so 15+13=28 → 29
WARMUP_DI14_LINE_CROSS = 16  # need previous period's dm14_p, dm14_n
WARMUP_PSAR = 15  # ep14_h/l need 14 candles; first bar uses ep14

# --- Types ---


@dataclass(frozen=True)
class Candle:
    """Single OHLCV candle; open_time in seconds (Unix)."""
    open_time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    quote_asset: float
    num_trades: float
    buy_base: float
    buy_quote: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "open_time": self.open_time,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
            "quote_asset": self.quote_asset,
            "num_trades": self.num_trades,
            "buy_base": self.buy_base,
            "buy_quote": self.buy_quote,
        }


def candle_from_ohlcv(
    open_time: int,
    open_: float,
    high: float,
    low: float,
    close: float,
    volume: float = 0.0,
) -> Candle:
    """
    Build a Candle from OHLCV values (e.g. from DB price history).
    quote_asset, num_trades, buy_base, buy_quote default to 0.
    """
    return Candle(
        open_time=int(open_time),
        open=float(open_),
        high=float(high),
        low=float(low),
        close=float(close),
        volume=float(volume),
        quote_asset=0.0,
        num_trades=0.0,
        buy_base=0.0,
        buy_quote=0.0,
    )


def candle_from_binance_kline(k: dict[str, Any]) -> Candle:
    """
    Build a Candle from a Binance kline dict (e.g. from _kline_array_to_dict).
    openTime/closeTime in ms; open/high/low/close/volume etc. as numbers or strings.
    """
    open_time_ms = int(k.get("openTime", 0))
    open_time = open_time_ms // 1000
    def f(x: Any) -> float:
        if x is None:
            return 0.0
        if isinstance(x, (int, float)):
            return float(x)
        return float(str(x).strip() or 0)
    return Candle(
        open_time=open_time,
        open=f(k.get("open")),
        high=f(k.get("high")),
        low=f(k.get("low")),
        close=f(k.get("close")),
        volume=f(k.get("volume")),
        quote_asset=f(k.get("quoteAssetVolume")),
        num_trades=f(k.get("numberOfTrades")),
        buy_base=f(k.get("takerBuyBaseAssetVolume")),
        buy_quote=f(k.get("takerBuyQuoteAssetVolume")),
    )


@dataclass
class IndicatorState:
    """Rolling state for incremental indicator updates (one per symbol/timeframe)."""
    # Previous candle (for TR, RSI, DM)
    prev_high: float = 0.0
    prev_low: float = 0.0
    prev_close: float = 0.0
    # RSI (Wilder)
    ag7: float = 0.0
    al7: float = 0.0
    ag14: float = 0.0
    al14: float = 0.0
    # DM smoothed
    dm14_p: float = 0.0
    dm14_n: float = 0.0
    prev_dm14_p: float = 0.0
    prev_dm14_n: float = 0.0
    # ATR
    atr14: float = 0.0
    atr28: float = 0.0
    # ADX (smoothed DX)
    adx: float = 0.0
    # PSAR
    af: float = 0.02
    ep: float = 0.0
    psar_type: str = "UP"  # 'UP' | 'DOWN'
    ppsar: float = 0.0
    # Last 14 candles for ep14_h/l (first bar) and PSAR extremes
    _last_14: list[Candle] = field(default_factory=list)

    def _trim_last_14(self, maxlen: int = 14) -> None:
        if len(self._last_14) > maxlen:
            self._last_14 = self._last_14[:maxlen]


# --- Time bucketing (doc: 1.2.1) ---


def bucket_open_time_minutes(open_time_sec: int, minutes: int) -> int:
    """Bucket by minute size. open_time (candle) = (open_time // (min*60)) * (min*60)."""
    if minutes <= 0:
        return open_time_sec
    period = minutes * 60
    return (open_time_sec // period) * period


def bucket_close_time_minutes(open_time_sec: int, minutes: int) -> int:
    """close_time = ((open_time // (min*60)) + 1) * (min*60)."""
    if minutes <= 0:
        return open_time_sec
    period = minutes * 60
    return ((open_time_sec // period) + 1) * period


def bucket_open_time_hours(open_time_sec: int, hours: int) -> int:
    """Bucket by hour size. open_time (candle) = (open_time // (hour*3600)) * (hour*3600)."""
    if hours <= 0:
        return open_time_sec
    period = hours * 3600
    return (open_time_sec // period) * period


def bucket_close_time_hours(open_time_sec: int, hours: int) -> int:
    """close_time = ((open_time // (hour*3600)) + 1) * (hour*3600)."""
    if hours <= 0:
        return open_time_sec
    period = hours * 3600
    return ((open_time_sec // period) + 1) * period


# Map timeframe string to (minutes, 0) or (0, hours); 1m stays as-is
TIMEFRAME_MINUTES = {"1m": 1, "5m": 5, "30m": 30}
TIMEFRAME_HOURS = {"1h": 1, "4h": 4, "1d": 24}


def bucket_open_time(open_time_sec: int, timeframe: str) -> int:
    """Return candle open_time for the given timeframe (e.g. '5m', '1h', '1d')."""
    if timeframe in TIMEFRAME_MINUTES:
        return bucket_open_time_minutes(open_time_sec, TIMEFRAME_MINUTES[timeframe])
    if timeframe in TIMEFRAME_HOURS:
        return bucket_open_time_hours(open_time_sec, TIMEFRAME_HOURS[timeframe])
    return open_time_sec


# --- OHLCV aggregation (doc: 1.2.2) ---


def aggregate_candles(candles: list[Candle], bucket_open_time_sec: int) -> Candle | None:
    """
    Merge a list of candles (same bucket) into one: first open, max high, min low,
    last close (by open_time), sums for volume/quote_asset/num_trades/buy_base/buy_quote.
    """
    if not candles:
        return None
    sorted_candles = sorted(candles, key=lambda c: c.open_time)
    first_ = sorted_candles[0]
    last_ = sorted_candles[-1]
    high = max(c.high for c in sorted_candles)
    low = min(c.low for c in sorted_candles)
    return Candle(
        open_time=bucket_open_time_sec,
        open=float(first_.open),
        high=float(high),
        low=float(low),
        close=float(last_.close),
        volume=sum(c.volume for c in sorted_candles),
        quote_asset=sum(c.quote_asset for c in sorted_candles),
        num_trades=sum(c.num_trades for c in sorted_candles),
        buy_base=sum(c.buy_base for c in sorted_candles),
        buy_quote=sum(c.buy_quote for c in sorted_candles),
    )


# --- Indicator helpers (doc section 2) ---


def _true_range(high: float, low: float, prev_close: float) -> float:
    """TR = max(high - low, 0.00001 * high)."""
    return max(high - low, 0.00001 * high if high else 1e-9)


def _rsi_gain_loss(close: float, prev_close: float) -> tuple[float, float]:
    """c_diff_p (gain), c_diff_n (loss) from close vs previous close."""
    if close >= prev_close:
        return (close - prev_close, 0.0)
    return (0.0, prev_close - close)


def _dm_p_n(high: float, low: float, ph: float, pl: float) -> tuple[float, float]:
    """+DM and -DM. dm_p if (high-ph) >= (pl-low) else 0; dm_n if (pl-low) > (high-ph) else 0."""
    up = high - ph
    down = pl - low
    if up >= down:
        dm_p = max(up, 0.0)
        dm_n = 0.0 if up > down else max(down, 0.0)
    else:
        dm_n = max(down, 0.0)
        dm_p = 0.0
    return (dm_p, dm_n)


def _safe_div(num: float, denom: float, default: float = 0.0) -> float:
    if denom is None or denom == 0:
        return default
    return num / denom


def step_indicators(
    state: IndicatorState,
    candle: Candle,
    prev_candle: Candle | None,
    candle_count: int = 1,
) -> tuple[IndicatorState, dict[str, Any]]:
    """
    Incremental indicator step using close (and prev close / high/low per doc).
    Returns (new_state, indicator_dict). indicator_dict keys match summary table.
    When candle_count is below the required warmup for an indicator, that value is None.
    """
    high, low, close = candle.high, candle.low, candle.close
    ph = state.prev_high
    pl = state.prev_low
    pc = state.prev_close
    if prev_candle is not None:
        ph, pl, pc = prev_candle.high, prev_candle.low, prev_candle.close

    # TR
    tr = _true_range(high, low, pc)

    # RSI (close vs prev close)
    c_diff_p, c_diff_n = _rsi_gain_loss(close, pc)
    ag7 = (state.ag7 * 6 + c_diff_p) / 7 if state.ag7 or state.al7 or c_diff_p or c_diff_n else 0.0
    al7 = (state.al7 * 6 + c_diff_n) / 7 if state.ag7 or state.al7 or c_diff_p or c_diff_n else 0.0
    ag14 = (state.ag14 * 13 + c_diff_p) / 14 if state.ag14 or state.al14 or c_diff_p or c_diff_n else 0.0
    al14 = (state.al14 * 13 + c_diff_n) / 14 if state.ag14 or state.al14 or c_diff_p or c_diff_n else 0.0
    rsi7 = 100 - (100 * al7 / (al7 + ag7)) if (al7 + ag7) != 0 else 0.0
    rsi14 = 100 - (100 * al14 / (al14 + ag14)) if (al14 + ag14) != 0 else 0.0

    # DM
    dm_p, dm_n = _dm_p_n(high, low, ph, pl)
    dm14_p = (state.dm14_p * 13 + dm_p) / 14
    dm14_n = (state.dm14_n * 13 + dm_n) / 14

    # ATR
    atr14 = (state.atr14 * 13 + tr) / 14 if state.atr14 else tr
    atr28 = (state.atr28 * 27 + tr) / 28 if state.atr28 else tr

    # ADX: di14_p, di14_n, dx14, adx
    di14_p = 100 * _safe_div(dm14_p, atr14) if atr14 else 0.0
    di14_n = 100 * _safe_div(dm14_n, atr14) if atr14 else 0.0
    dm_sum = dm14_p + dm14_n
    dx14 = 100 * abs(dm14_p - dm14_n) / dm_sum if dm_sum else 0.0
    adx = (state.adx * 13 + dx14) / 14

    # DI line cross
    di14_line_cross = 1 if (state.prev_dm14_p - state.prev_dm14_n) * (dm14_p - dm14_n) <= 0 else 0

    # PSAR (close-based type: DOWN when close < prev_close)
    c_diff_n_val = max(pc - close, 0.0)
    psar_type = "DOWN" if c_diff_n_val > 0 else "UP"

    # Copy so we don't mutate caller's state
    last_14 = list(state._last_14)
    last_14.insert(0, candle)
    if len(last_14) > 14:
        last_14 = last_14[:14]
    ep14_h = max(c.high for c in last_14) if len(last_14) >= 14 else high
    ep14_l = min(c.low for c in last_14) if len(last_14) >= 14 else low

    if state.ppsar == 0.0:
        # First bar: ppsar = ep14_l (UP) or ep14_h (DOWN)
        ppsar = ep14_l if psar_type == "UP" else ep14_h
    else:
        ppsar = state.ppsar

    af = state.af
    ep = state.ep
    if psar_type != state.psar_type:
        # Reversal: reset af, set ep to opposite extreme
        af = 0.02
        if psar_type == "UP":
            ep = max(state.ep, high)
            _ppsar = min(state.ep, low - 0.1 * tr)
            psar_val = _ppsar + 0.02 * (ep - _ppsar)
        else:
            ep = min(state.ep, low)
            _ppsar = max(state.ep, high + 0.1 * tr)
            psar_val = _ppsar + 0.02 * (ep - _ppsar)
    else:
        if psar_type == "UP":
            ep = max(state.ep, high)
        else:
            ep = min(state.ep, low)
        af = min(af + 0.02, 0.2)
        psar_val = ppsar + af * (ep - ppsar)

    # Reversal check: psar_turn when price crosses SAR (doc 2.9)
    psar_turn = 0
    candidate_sar = ppsar + af * (ep - ppsar)
    if state.psar_type == "DOWN" and candidate_sar <= high:
        psar_turn = 1
        psar_type = "UP"
        ep = high
        _ppsar = min(ep14_l, low - 0.1 * tr)
        psar_val = _ppsar + 0.02 * (ep - _ppsar)
        af = 0.02
    elif state.psar_type == "UP" and candidate_sar >= low:
        psar_turn = 1
        psar_type = "DOWN"
        ep = low
        _ppsar = max(ep14_h, high + 0.1 * tr)
        psar_val = _ppsar + 0.02 * (ep - _ppsar)
        af = 0.02

    out: dict[str, Any] = {
        "open_time": candle.open_time,
        "tr": tr if candle_count >= WARMUP_TR else None,
        "rsi7": rsi7 if candle_count >= WARMUP_RSI7 else None,
        "rsi14": rsi14 if candle_count >= WARMUP_RSI14 else None,
        "ag7": ag7 if candle_count >= WARMUP_RSI7 else None,
        "al7": al7 if candle_count >= WARMUP_RSI7 else None,
        "ag14": ag14 if candle_count >= WARMUP_RSI14 else None,
        "al14": al14 if candle_count >= WARMUP_RSI14 else None,
        "dm_p": dm_p if candle_count >= WARMUP_TR else None,
        "dm_n": dm_n if candle_count >= WARMUP_TR else None,
        "dm14_p": dm14_p if candle_count >= WARMUP_DM14_ATR14 else None,
        "dm14_n": dm14_n if candle_count >= WARMUP_DM14_ATR14 else None,
        "atr14": atr14 if candle_count >= WARMUP_DM14_ATR14 else None,
        "atr28": atr28 if candle_count >= WARMUP_ATR28 else None,
        "di14_p": di14_p if candle_count >= WARMUP_DM14_ATR14 else None,
        "di14_n": di14_n if candle_count >= WARMUP_DM14_ATR14 else None,
        "dx14": dx14 if candle_count >= WARMUP_DM14_ATR14 else None,
        "adx": adx if candle_count >= WARMUP_ADX else None,
        "di14_line_cross": di14_line_cross if candle_count >= WARMUP_DI14_LINE_CROSS else None,
        "psar": psar_val if candle_count >= WARMUP_PSAR else None,
        "psar_type": psar_type if candle_count >= WARMUP_PSAR else None,
        "ep": ep if candle_count >= WARMUP_PSAR else None,
        "af": af if candle_count >= WARMUP_PSAR else None,
        "psar_turn": psar_turn if candle_count >= WARMUP_PSAR else None,
    }

    new_state = IndicatorState(
        prev_high=high,
        prev_low=low,
        prev_close=close,
        ag7=ag7,
        al7=al7,
        ag14=ag14,
        al14=al14,
        dm14_p=dm14_p,
        dm14_n=dm14_n,
        prev_dm14_p=dm14_p,
        prev_dm14_n=dm14_n,
        atr14=atr14,
        atr28=atr28,
        adx=adx,
        af=af,
        ep=ep,
        psar_type=psar_type,
        ppsar=psar_val,
        _last_14=last_14,
    )
    return (new_state, out)
