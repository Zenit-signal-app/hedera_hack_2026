import { cancelOpenOrder, closeOrder, getOpenOrders } from "./db.js";
import { fetchPrices } from "./price.js";
import { executeOnChainClose } from "./executor.js";
import { log } from "./logger.js";
import { config } from "./config.js";
import { notifyCacheReset } from "./cacheReset.js";
import { publishOraclePrices } from "./oraclePublisher.js";
import type { Order, Market } from "./types.js";
import { ethers } from "ethers";
import { PERPETUAL_DEX_ABI_HUMAN, symbolToBytes32 } from "./abi.js";
import { checkOrderTrigger, closeReasonCodeToOrderStatus, CloseReasonCode } from "./closeReason.js";

// Trigger classification is delegated to `checkOrderTrigger()`.

// ─── Core: processOpenPositions ──────────────────────────────────────────────

export async function processOpenPositions(): Promise<void> {
  const tag = "watcher";

  let orders: Order[];
  try {
    orders = await getOpenOrders();
  } catch (err) {
    log.error(tag, "Failed to fetch open orders from database", {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let prices: Awaited<ReturnType<typeof fetchPrices>>;
  try {
    prices = await fetchPrices();
  } catch (err) {
    log.error(tag, "Failed to fetch prices from oracle", {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (prices.length === 0) {
    log.warn(tag, "Price feed returned empty – skipping this cycle");
    return;
  }

  // Best-effort: publish prices to on-chain oracle for settlement.
  await publishOraclePrices(prices);

  if (orders.length === 0) {
    log.info(tag, "No open positions to monitor");
    return;
  }

  // De-duplicate by wallet+market to avoid sending multiple identical close txs
  // (duplicates can happen due to repeated PositionOpened ingestions).
  const deduped = new Map<string, Order>();
  for (const o of orders) {
    const key = `${o.walletAddress.toLowerCase()}:${o.market}`;
    const prev = deduped.get(key);
    if (!prev) {
      deduped.set(key, o);
      continue;
    }
    // Prefer the newest record as the canonical order.
    const prevCreated = new Date(prev.createdAt).getTime();
    const nextCreated = new Date(o.createdAt).getTime();
    if (nextCreated >= prevCreated) deduped.set(key, o);
  }
  orders = Array.from(deduped.values());

  log.info(tag, `Monitoring ${orders.length} open position(s)`);

  // Reconcile stale DB: if on-chain position is already closed, mark DB closed to avoid "ghost Open"
  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, {
      chainId: config.chainId,
      name: "polkadot-hub-testnet",
    });
    const contract = new ethers.Contract(config.perpDexAddress, PERPETUAL_DEX_ABI_HUMAN, provider);

    const stillOpen: Order[] = [];
    for (const o of orders) {
      try {
        const pos = await contract.getCurrentPosition(o.walletAddress, symbolToBytes32(o.market as Market));
        const amount = (pos?.amount ?? pos?.[0] ?? 0n) as bigint;
        log.info(tag, "Reconcile on-chain position snapshot", {
          orderId: o.id,
          walletAddress: o.walletAddress,
          market: o.market,
          onchainAmount: amount.toString(),
        });
        if (BigInt(amount) === 0n) {
          await cancelOpenOrder(o.id);
          log.warn(tag, "DB had Open order but on-chain position is closed; cancelling stale Open row", {
            orderId: o.id,
            walletAddress: o.walletAddress,
            market: o.market,
          });
          continue;
        }
      } catch (err) {
        // If RPC read fails, keep it for normal processing
        log.warn(tag, "Failed to read on-chain position during reconciliation (keeping Open for now)", {
          orderId: o.id,
          walletAddress: o.walletAddress,
          market: o.market,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      stillOpen.push(o);
    }
    orders = stillOpen;
    if (orders.length === 0) {
      log.info(tag, "All open orders were stale; nothing to monitor after reconciliation");
      return;
    }
  } catch (err) {
    log.warn(tag, "Failed to reconcile on-chain positions (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const priceMap = new Map<Market, number>();
  for (const p of prices) priceMap.set(p.market, p.price);

  let triggered = 0;

  for (const order of orders) {
    const currentPrice = priceMap.get(order.market as Market);

    if (currentPrice == null) {
      log.warn(tag, `No price data for ${order.market} – skipping order`, {
        orderId: order.id,
      });
      continue;
    }

    const tpDist = order.takeProfitPrice != null
      ? `$${Math.abs(currentPrice - order.takeProfitPrice).toFixed(2)} (${((Math.abs(currentPrice - order.takeProfitPrice) / currentPrice) * 100).toFixed(2)}%)`
      : "not set";
    const slDist = order.stopLossPrice != null
      ? `$${Math.abs(currentPrice - order.stopLossPrice).toFixed(2)} (${((Math.abs(currentPrice - order.stopLossPrice) / currentPrice) * 100).toFixed(2)}%)`
      : "not set";
    const estimatedLiq = order.liquidationPrice;
    const liqDist = `$${Math.abs(currentPrice - estimatedLiq).toFixed(2)} (${((Math.abs(currentPrice - estimatedLiq) / currentPrice) * 100).toFixed(2)}%)`;

    log.info(tag, `Checking ${order.market} ${order.side} #${order.id.slice(0, 8)}`, {
      currentPrice: `$${currentPrice.toFixed(2)}`,
      entryPrice: `$${order.entryPrice.toFixed(2)}`,
      tp: order.takeProfitPrice != null ? `$${order.takeProfitPrice.toFixed(2)}` : "—",
      sl: order.stopLossPrice != null ? `$${order.stopLossPrice.toFixed(2)}` : "—",
      liq: `$${estimatedLiq.toFixed(2)}`,
      distToTP: tpDist,
      distToSL: slDist,
      distToLiq: liqDist,
    });

    const closeReasonCode = checkOrderTrigger(order, currentPrice);
    if (closeReasonCode === CloseReasonCode.Manual) continue;

    const reason = closeReasonCodeToOrderStatus(closeReasonCode);

    if (closeReasonCode === CloseReasonCode.Liquidated) {
      log.warn(tag, `LIQUIDATION triggered`, {
        orderId: order.id,
        walletAddress: order.walletAddress,
        market: order.market,
        side: order.side,
        currentPrice: `$${currentPrice.toFixed(2)}`,
        liquidationPrice: `$${estimatedLiq.toFixed(2)}`,
      });
    } else if (closeReasonCode === CloseReasonCode.TP) {
      log.action(tag, `TAKE PROFIT triggered`, {
        orderId: order.id,
        walletAddress: order.walletAddress,
        market: order.market,
        side: order.side,
        currentPrice: `$${currentPrice.toFixed(2)}`,
        takeProfitPrice: order.takeProfitPrice != null ? `$${order.takeProfitPrice.toFixed(2)}` : "—",
      });
    } else if (closeReasonCode === CloseReasonCode.SL) {
      log.action(tag, `STOP LOSS triggered`, {
        orderId: order.id,
        walletAddress: order.walletAddress,
        market: order.market,
        side: order.side,
        currentPrice: `$${currentPrice.toFixed(2)}`,
        stopLossPrice: order.stopLossPrice != null ? `$${order.stopLossPrice.toFixed(2)}` : "—",
      });
    }

    triggered++;

    // Execute close on-chain (with retry logic, gas optimization, nonce management)
    let txHash: string | null = null;
    let onchainSuccess = false;
    let finalPnl: string | undefined = undefined;
    try {
      const result = await executeOnChainClose(order, currentPrice);

      txHash = result.txHash;
      onchainSuccess = result.success;
      finalPnl = result.finalPnl != null ? result.finalPnl.toString() : undefined;

      if (result.success) {
        if (finalPnl == null) {
          log.warn(tag, "finalPnl not found in tx receipt logs (will store null)", {
            orderId: order.id,
            txHash: result.txHash,
          });
        }
        log.info(tag, `On-chain close succeeded`, {
          orderId: order.id,
          txHash: result.txHash,
          gasUsed: result.gasUsed?.toString(),
          keeperReward: result.keeperReward?.toString() ?? "none",
          closeReasonCode,
          finalPnl: finalPnl ?? "unknown",
          attempts: result.attempts,
        });
      } else {
        log.error(tag, `On-chain close failed`, {
          orderId: order.id,
          error: result.error,
          attempts: result.attempts,
        });
      }

      // Persist computed fields even if closePrice came from oracle.
      // `closeOrder` will also store `finalPnl`.
      if (onchainSuccess) {
        // closeOrder call happens below.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      }
    } catch (err) {
      log.error(tag, `executeOnChainClose threw unexpectedly`, {
        orderId: order.id,
        reason,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Only mark DB as closed if the on-chain close succeeded.
    // If it failed, keep status=Open so we retry next cycle.
    if (!onchainSuccess) {
      log.warn(tag, `Keeping order Open (will retry next cycle)`, {
        orderId: order.id,
        reason,
        txHash: txHash ?? "none",
      });
      continue;
    }

    try {
      await closeOrder(
        order.id,
        reason,
        currentPrice,
        txHash ?? undefined,
        closeReasonCode,
        finalPnl,
      );
      log.info(tag, `DB updated: order ${order.id.slice(0, 8)} → ${reason}`, {
        closePrice: `$${currentPrice.toFixed(2)}`,
        txHash: txHash ?? "none",
        closeReasonCode,
      });
      notifyCacheReset(order.walletAddress);
    } catch (err) {
      log.error(tag, `Failed to update order in DB after close`, {
        orderId: order.id,
        reason,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (triggered > 0) {
    log.info(tag, `Cycle complete: ${triggered}/${orders.length} position(s) triggered`);
  } else {
    log.info(tag, `Cycle complete: all ${orders.length} position(s) safe`);
  }
}

/** @deprecated Use processOpenPositions() instead */
export const tick = processOpenPositions;
