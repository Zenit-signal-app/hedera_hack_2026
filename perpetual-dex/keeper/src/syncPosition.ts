import { ethers } from "ethers";
import { config } from "./config.js";
import { PERPETUAL_DEX_ABI_HUMAN, symbolToBytes32 } from "./abi.js";
import { createOrder, findOpenOrderByWalletAndMarket, updateTpSlByWalletAndMarket } from "./db.js";
import { fetchPrices } from "./price.js";
import { log } from "./logger.js";
import type { Market, Side } from "./types.js";
import { calcLiquidationPrice } from "./tradeMath.js";

const TAG = "sync";

const SIDE_MAP: Record<number, Side> = { 0: "Long", 1: "Short" };
const VALID_MARKETS = new Set<string>([
  "BTCUSD",
  "ETHUSD",
  "HBARUSD",
]);

function estimateLiquidationPrice(entryPrice: number, leverage: number, side: Side): number {
  const liq = calcLiquidationPrice(side, entryPrice, leverage, config.liquidationMmr);
  return liq ?? 0;
}

const provider = new ethers.JsonRpcProvider(config.rpcUrl, {
  chainId: config.chainId,
  name: "polkadot-hub-testnet",
});

const readOnlyContract = new ethers.Contract(
  config.perpDexAddress,
  PERPETUAL_DEX_ABI_HUMAN,
  provider,
);

export interface SyncResult {
  created: boolean;
  order: Awaited<ReturnType<typeof createOrder>> | Awaited<ReturnType<typeof updateTpSlByWalletAndMarket>>;
}

/**
 * Sync an on-chain position into the keeper DB. Creates order if missing (e.g. position
 * was opened before keeper started). Updates TP/SL if provided.
 */
export async function syncPositionFromChain(
  walletAddress: string,
  market: string,
  takeProfitPrice?: number | null,
  stopLossPrice?: number | null,
): Promise<SyncResult | null> {
  if (!VALID_MARKETS.has(market)) {
    log.warn(TAG, `Invalid market ${market}`);
    return null;
  }

  const marketBytes = symbolToBytes32(market as Market);
  const normalizedWallet = walletAddress.toLowerCase();

  let amount: bigint;
  let positionType: number;
  let leverage: number;

  try {
    const pos = await readOnlyContract.getCurrentPosition(walletAddress, marketBytes);
    amount = pos[0] as bigint;
    positionType = Number(pos[1]);
    leverage = Number(pos[2]);
  } catch (err) {
    log.error(TAG, "Failed to read position from contract", {
      wallet: normalizedWallet,
      market,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (amount === 0n) {
    log.info(TAG, "No on-chain position for wallet+market", { wallet: normalizedWallet, market });
    return null;
  }

  const side: Side = SIDE_MAP[positionType] ?? "Long";
  const marginFormatted = ethers.formatUnits(amount, 18);

  let existing = await findOpenOrderByWalletAndMarket(normalizedWallet, market);

  if (!existing) {
    let entryPrice = 0;
    try {
      const prices = await fetchPrices();
      const tick = prices.find((p) => p.market === market);
      if (tick) entryPrice = tick.price;
    } catch (err) {
      log.warn(TAG, "Could not fetch price for sync – using 0", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const liquidationPrice = entryPrice > 0 ? estimateLiquidationPrice(entryPrice, leverage, side) : 0;

    const order = await createOrder({
      walletAddress: normalizedWallet,
      market: market as Market,
      side,
      marginAmount: marginFormatted,
      leverage,
      entryPrice,
      liquidationPrice,
      takeProfitPrice: takeProfitPrice ?? null,
      stopLossPrice: stopLossPrice ?? null,
    });

    log.action(TAG, "Order created from on-chain sync", {
      orderId: order.id,
      wallet: normalizedWallet.slice(0, 10) + "...",
      market,
      side,
      margin: `${marginFormatted} zUSDC`,
      leverage: `${leverage}x`,
    });

    return { created: true, order };
  }

  const tp = takeProfitPrice ?? existing.takeProfitPrice;
  const sl = stopLossPrice ?? existing.stopLossPrice;
  const updated = await updateTpSlByWalletAndMarket(normalizedWallet, market, tp, sl);

  log.info(TAG, "TP/SL updated for existing order", {
    orderId: existing.id,
    tp: tp != null ? `$${tp.toFixed(2)}` : "none",
    sl: sl != null ? `$${sl.toFixed(2)}` : "none",
  });

  return { created: false, order: updated! };
}
