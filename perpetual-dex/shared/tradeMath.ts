export type Side = "Long" | "Short";
export type TpSlMode = "roi" | "price";

export type TpSlPreview = {
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
};

/**
 * Liquidation estimate consistent with simple PnL model.
 * - Long: entry * (1 - 1/leverage + mmr)
 * - Short: entry * (1 + 1/leverage - mmr)
 */
export function calcLiquidationPrice(
  side: Side,
  entryPrice: number,
  leverage: number,
  mmr = 0.01,
): number | null {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  if (!Number.isFinite(leverage) || leverage <= 0) return null;
  if (!Number.isFinite(mmr) || mmr < 0) return null;

  const invLev = 1 / leverage;
  const liq = side === "Long"
    ? entryPrice * (1 - invLev + mmr)
    : entryPrice * (1 + invLev - mmr);

  if (!Number.isFinite(liq) || liq <= 0) return null;
  return liq;
}

/**
 * TP/SL price preview from a percent input.
 * - mode="roi": percent means ROI on margin → price move = percent/leverage
 * - mode="price": percent means raw price move → price move = percent
 */
export function calcTpSlPrices(
  side: Side,
  entryPrice: number,
  leverage: number,
  takeProfitPct: number,
  stopLossPct: number,
  mode: TpSlMode,
): TpSlPreview {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return { takeProfitPrice: null, stopLossPrice: null };
  }

  const safeLev = Math.max(1, Number.isFinite(leverage) ? leverage : 1);
  const tpPct = Math.max(0, Number.isFinite(takeProfitPct) ? takeProfitPct : 0);
  const slPct = Math.max(0, Number.isFinite(stopLossPct) ? stopLossPct : 0);

  const tpDelta = (mode === "roi" ? tpPct / 100 / safeLev : tpPct / 100);
  const slDelta = (mode === "roi" ? slPct / 100 / safeLev : slPct / 100);

  const takeProfitPrice = side === "Long"
    ? entryPrice * (1 + tpDelta)
    : entryPrice * Math.max(0, 1 - tpDelta);

  const stopLossPrice = side === "Long"
    ? entryPrice * Math.max(0, 1 - slDelta)
    : entryPrice * (1 + slDelta);

  return {
    takeProfitPrice: Number.isFinite(takeProfitPrice) ? takeProfitPrice : null,
    stopLossPrice: Number.isFinite(stopLossPrice) ? stopLossPrice : null,
  };
}

