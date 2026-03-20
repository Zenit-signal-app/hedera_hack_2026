import { calcLiquidationPrice } from "./tradeMath.js";
import { config } from "./config.js";
import type { Order, Side } from "./types.js";

// Close reason codes (0..3)
export const CloseReasonCode = {
  Manual: 0,
  TP: 1,
  SL: 2,
  Liquidated: 3,
} as const;

export type CloseReasonCode = (typeof CloseReasonCode)[keyof typeof CloseReasonCode];

// Keep it aligned with keeper's watcher trigger tolerance for TP/SL.
// Small tolerance (0.02%) to handle price feed lag between keeper and frontend.
const SL_TP_TOLERANCE = 1.0002;

function estimateLiquidationPrice(order: Order): number {
  const liq = calcLiquidationPrice(order.side, order.entryPrice, order.leverage, config.liquidationMmr);
  return liq ?? order.liquidationPrice;
}

function getNormalizedSide(side: Side | undefined): Side | null {
  if (side === "Long" || side === "Short") return side;
  return null;
}

/**
 * Classify which trigger closed `order`, based on `currentPrice`.
 *
 * Return value:
 *  - 1: TP
 *  - 2: SL
 *  - 3: Liquidated
 *  - 0: no trigger matched (caller can map to Manual if desired)
 */
export function checkOrderTrigger(order: Order, currentPrice: number): CloseReasonCode {
  try {
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return CloseReasonCode.Manual;

    const side = getNormalizedSide(order.side);
    if (!side) return CloseReasonCode.Manual;

    const liq = estimateLiquidationPrice(order);

    // Liquidation check should be evaluated first, same as watcher.
    if (side === "Long") {
      if (currentPrice <= liq) return CloseReasonCode.Liquidated;

      if (order.takeProfitPrice != null) {
        // watcher: price >= tp / tolerance
        if (currentPrice >= order.takeProfitPrice / SL_TP_TOLERANCE) return CloseReasonCode.TP;
      }

      if (order.stopLossPrice != null) {
        // watcher: price <= sl * tolerance
        if (currentPrice <= order.stopLossPrice * SL_TP_TOLERANCE) return CloseReasonCode.SL;
      }
    } else {
      // Short
      if (currentPrice >= liq) return CloseReasonCode.Liquidated;

      if (order.takeProfitPrice != null) {
        // watcher: price <= tp * tolerance
        if (currentPrice <= order.takeProfitPrice * SL_TP_TOLERANCE) return CloseReasonCode.TP;
      }

      if (order.stopLossPrice != null) {
        // watcher: price >= sl / tolerance
        if (currentPrice >= order.stopLossPrice / SL_TP_TOLERANCE) return CloseReasonCode.SL;
      }
    }

    return CloseReasonCode.Manual;
  } catch {
    return CloseReasonCode.Manual;
  }
}

export function closeReasonCodeToOrderStatus(code: CloseReasonCode): Order["status"] {
  // Per DB requirement: all closed orders have status='Closed'.
  // TP/SL/Liquidated is represented by `closeReasonCode`.
  return "Closed";
}

