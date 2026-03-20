export type Side = "Long" | "Short";

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

