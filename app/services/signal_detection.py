"""
Signal detection from indicator values (RSI, ADX, PSAR only).

Used by the WebSocket flow to build per-symbol signal messages for FCM.
Standard thresholds: RSI oversold < 30 / overbought > 70; ADX >= 25; PSAR turn (psar_turn == 1).
ATR and DI are ignored.
"""

from __future__ import annotations

from typing import Any

# Standard thresholds (plan)
RSI_OVERSOLD = 30
RSI_OVERBOUGHT = 70
ADX_STRONG_TREND = 25


def _get(val: Any) -> float | None:
    """Return float or None if missing/null."""
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def get_signal_strings(indicator_dict: dict[str, Any], timeframe: str) -> list[str]:
    """
    From one indicator dict (latest candle for a given timeframe), return a list of
    human-readable signal strings with numbers. Only RSI, ADX, and PSAR are considered.

    - RSI: rsi7 or rsi14 < 30 (oversold) or > 70 (overbought).
    - ADX: adx >= 25 (strong trend).
    - PSAR: psar_turn == 1; include psar value and psar_type.

    Timeframe is prefixed to each string, e.g. "5m: RSI14 28.5 (oversold)".
    """
    out: list[str] = []
    prefix = f"{timeframe}: "

    # RSI
    rsi7 = _get(indicator_dict.get("rsi7"))
    rsi14 = _get(indicator_dict.get("rsi14"))
    if rsi7 is not None:
        if rsi7 < RSI_OVERSOLD:
            out.append(f"{prefix}RSI7 {rsi7:.2f} (oversold)")
        elif rsi7 > RSI_OVERBOUGHT:
            out.append(f"{prefix}RSI7 {rsi7:.2f} (overbought)")
    if rsi14 is not None:
        if rsi14 < RSI_OVERSOLD:
            out.append(f"{prefix}RSI14 {rsi14:.2f} (oversold)")
        elif rsi14 > RSI_OVERBOUGHT:
            out.append(f"{prefix}RSI14 {rsi14:.2f} (overbought)")

    # ADX
    adx = _get(indicator_dict.get("adx"))
    if adx is not None and adx >= ADX_STRONG_TREND:
        out.append(f"{prefix}ADX {adx:.2f} (strong trend)")

    # PSAR turn
    psar_turn = indicator_dict.get("psar_turn")
    if psar_turn == 1:
        psar = _get(indicator_dict.get("psar"))
        psar_type = indicator_dict.get("psar_type")
        type_str = str(psar_type).strip() if psar_type is not None else "UP"
        if psar is not None:
            out.append(f"{prefix}PSAR turn to {type_str} at {psar:.2f}")
        else:
            out.append(f"{prefix}PSAR turn to {type_str}")

    return out


def get_signals(indicator_dict: dict[str, Any], timeframe: str) -> list[tuple[str, str]]:
    """
    Like get_signal_strings, but returns stable (signal_id, message) tuples.

    signal_id is designed for deduping notifications; it intentionally ignores the
    precise numeric indicator values so "same candle, slightly different RSI" does
    not produce a new notification.
    """
    out: list[tuple[str, str]] = []
    prefix = f"{timeframe}: "

    # RSI
    rsi7 = _get(indicator_dict.get("rsi7"))
    rsi14 = _get(indicator_dict.get("rsi14"))
    if rsi7 is not None:
        if rsi7 < RSI_OVERSOLD:
            out.append((f"{timeframe}:rsi7:oversold", f"{prefix}RSI7 {rsi7:.2f} (oversold)"))
        elif rsi7 > RSI_OVERBOUGHT:
            out.append((f"{timeframe}:rsi7:overbought", f"{prefix}RSI7 {rsi7:.2f} (overbought)"))
    if rsi14 is not None:
        if rsi14 < RSI_OVERSOLD:
            out.append((f"{timeframe}:rsi14:oversold", f"{prefix}RSI14 {rsi14:.2f} (oversold)"))
        elif rsi14 > RSI_OVERBOUGHT:
            out.append((f"{timeframe}:rsi14:overbought", f"{prefix}RSI14 {rsi14:.2f} (overbought)"))

    # ADX
    adx = _get(indicator_dict.get("adx"))
    if adx is not None and adx >= ADX_STRONG_TREND:
        out.append((f"{timeframe}:adx:strong", f"{prefix}ADX {adx:.2f} (strong trend)"))

    # PSAR turn
    psar_turn = indicator_dict.get("psar_turn")
    if psar_turn == 1:
        psar = _get(indicator_dict.get("psar"))
        psar_type = indicator_dict.get("psar_type")
        type_str = str(psar_type).strip() if psar_type is not None else "UP"
        signal_id = f"{timeframe}:psar:turn:{type_str}"
        if psar is not None:
            out.append((signal_id, f"{prefix}PSAR turn to {type_str} at {psar:.2f}"))
        else:
            out.append((signal_id, f"{prefix}PSAR turn to {type_str}"))

    return out


def get_signal_payload(signal_id: str, indicator_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Return a dict with only the indicator key(s) that triggered this signal.
    Used when persisting a signal to the DB so we store only the relevant indicators, not all.
    """
    if not signal_id or not indicator_dict:
        return {}
    # signal_id format: "30m:rsi7:oversold", "30m:rsi14:overbought", "30m:adx:strong", "30m:psar:turn:UP"
    if ":rsi7:" in signal_id:
        return {k: indicator_dict[k] for k in ("rsi7",) if k in indicator_dict}
    if ":rsi14:" in signal_id:
        return {k: indicator_dict[k] for k in ("rsi14",) if k in indicator_dict}
    if ":adx:" in signal_id:
        return {k: indicator_dict[k] for k in ("adx",) if k in indicator_dict}
    if ":psar:turn:" in signal_id:
        return {k: indicator_dict[k] for k in ("psar", "psar_turn", "psar_type") if k in indicator_dict}
    return {}
