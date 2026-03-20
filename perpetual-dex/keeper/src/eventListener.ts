import {
  createPublicClient,
  http,
  defineChain,
  formatUnits,
  type Log,
  type WatchContractEventReturnType,
} from "viem";
import { Wallet } from "ethers";
import { config } from "./config.js";
import { PERPETUAL_DEX_ABI } from "./abi.js";
import {
  createOrder,
  findOpenOrderByWalletAndMarket,
  findOrderByCloseTxHash,
  findLatestOrderByWalletAndMarket,
  markClosedByEvent,
} from "./db.js";
import { updateSmartContractWithClosureStats } from "./executor.js";
import { fetchPrices } from "./price.js";
import { log } from "./logger.js";
import type { ClosureStats, Market, Order, Side } from "./types.js";
import { calcLiquidationPrice } from "./tradeMath.js";
import { checkOrderTrigger, closeReasonCodeToOrderStatus, CloseReasonCode } from "./closeReason.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const TAG = "events";
const POLL_INTERVAL_MS = 4_000;
const MAX_RETRY_DELAY_MS = 60_000;
const INITIAL_RETRY_DELAY_MS = 2_000;

const VALID_MARKETS = new Set<string>([
  "BTCUSD",
  "ETHUSD",
  "HBARUSD",
]);
const SIDE_MAP: Record<number, Side> = { 0: "Long", 1: "Short" };

let keeperAddressLower: string | null = null;
try {
  keeperAddressLower = new Wallet(config.keeperPrivateKey).address.toLowerCase();
} catch {
  keeperAddressLower = null;
}

// ─── Chain & read-only client (viem) ─────────────────────────────────────────

const chain = defineChain({
  id: config.chainId,
  name: "Polkadot Hub TestNet",
  nativeCurrency: { name: "PAS", symbol: "PAS", decimals: 10 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});

const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
  pollingInterval: POLL_INTERVAL_MS,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bytes32ToSymbol(hex: string): string {
  let result = "";
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  for (let i = 0; i < clean.length; i += 2) {
    const byte = parseInt(clean.slice(i, i + 2), 16);
    if (byte === 0) break;
    result += String.fromCharCode(byte);
  }
  return result;
}

function decodeIndexedTopics(eventLog: Log): {
  userAddress: `0x${string}` | null;
  marketBytes: string | null;
  txHash: string;
  blockNumber: bigint;
  logIndex: number;
} {
  const topics = eventLog.topics;
  const userAddress = topics[1]
    ? (`0x${topics[1].slice(26)}` as `0x${string}`)
    : null;
  const marketBytes = topics[2] ?? null;
  const rawLogIndex: any = (eventLog as any).logIndex;
  const logIndex =
    typeof rawLogIndex === "bigint"
      ? Number(rawLogIndex)
      : typeof rawLogIndex === "number"
        ? rawLogIndex
        : 0;
  return {
    userAddress,
    marketBytes,
    txHash: eventLog.transactionHash ?? "unknown",
    blockNumber: eventLog.blockNumber ?? 0n,
    logIndex,
  };
}

function estimateLiquidationPrice(entryPrice: number, leverage: number, side: Side): number {
  const liq = calcLiquidationPrice(side, entryPrice, leverage, config.liquidationMmr);
  return liq ?? 0;
}

function reconstructClosePriceFromPnl(
  side: Side,
  entryPrice: number,
  leverage: number,
  closedMargin: number,
  pnl: bigint,
): number | null {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  if (!Number.isFinite(leverage) || leverage <= 0) return null;
  if (!Number.isFinite(closedMargin) || closedMargin <= 0) return null;
  const pnlAbs = Number(formatUnits(pnl < 0n ? -pnl : pnl, 18));
  if (!Number.isFinite(pnlAbs)) return null;
  const pnlSigned = pnl < 0n ? -pnlAbs : pnlAbs;
  const positionSize = closedMargin * leverage;
  if (!Number.isFinite(positionSize) || positionSize <= 0) return null;
  const ratio = pnlSigned / positionSize;
  const closePrice =
    side === "Long"
      ? entryPrice * (1 + ratio)
      : entryPrice * (1 - ratio);
  if (!Number.isFinite(closePrice) || closePrice <= 0) return null;
  return closePrice;
}

// ─── Handler: PositionOpened ─────────────────────────────────────────────────

async function handlePositionOpened(eventLog: Log): Promise<void> {
  const { userAddress, marketBytes, txHash, blockNumber, logIndex } =
    decodeIndexedTopics(eventLog);
  const data = eventLog.data;

  if (!userAddress || !marketBytes) {
    log.warn(TAG, "PositionOpened event with missing topics – skipping", { txHash });
    return;
  }

  let amount = 0n;
  let positionType = 0;
  let leverage = 1;

  if (data && data.length >= 194) {
    amount = BigInt(`0x${data.slice(2, 66)}`);
    positionType = Number(BigInt(`0x${data.slice(66, 130)}`));
    leverage = Number(BigInt(`0x${data.slice(130, 194)}`));
  }

  const marketSymbol = bytes32ToSymbol(marketBytes);
  const amountFormatted = formatUnits(amount, 18);
  const side: Side = SIDE_MAP[positionType] ?? "Long";

  log.info(TAG, `━━━ PositionOpened event detected ━━━`, {
    user: userAddress,
    market: marketSymbol,
    amount: amountFormatted,
    side,
    leverage: `${leverage}x`,
    txHash,
    logIndex,
    block: blockNumber.toString(),
  });

  if (!VALID_MARKETS.has(marketSymbol)) {
    log.warn(TAG, `Unknown market ${marketSymbol} – skipping`, { txHash });
    return;
  }

  // Fetch current price from oracle to record entry price
  let entryPrice = 0;
  try {
    const prices = await fetchPrices();
    const tick = prices.find((p) => p.market === marketSymbol);
    if (tick) entryPrice = tick.price;
  } catch (err) {
    log.warn(TAG, `Could not fetch price for entry – using 0`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const liquidationPrice = entryPrice > 0 ? estimateLiquidationPrice(entryPrice, leverage, side) : 0;

  try {
    const order = await createOrder({
      walletAddress: userAddress.toLowerCase(),
      market: marketSymbol as Market,
      side,
      marginAmount: amountFormatted,
      leverage,
      entryPrice,
      liquidationPrice,
      openTxHash: txHash,
      openEventId: `${txHash}:${logIndex}`,
      openLogIndex: logIndex,
    });

    log.action(TAG, `Order created in DB from PositionOpened event`, {
      orderId: order.id,
      wallet: userAddress.slice(0, 10) + "...",
      market: marketSymbol,
      side,
      margin: `${amountFormatted} zUSDC`,
      leverage: `${leverage}x`,
      entryPrice: entryPrice > 0 ? `$${entryPrice.toFixed(2)}` : "pending",
      liquidationPrice: liquidationPrice > 0 ? `$${liquidationPrice.toFixed(2)}` : "pending",
    });
  } catch (err) {
    log.error(TAG, `Failed to create order from PositionOpened event`, {
      user: userAddress,
      market: marketSymbol,
      txHash,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Handler: PositionClosed ─────────────────────────────────────────────────

async function handlePositionClosed(eventLog: Log): Promise<void> {
  const { userAddress, marketBytes, txHash, blockNumber } =
    decodeIndexedTopics(eventLog);
  const data = eventLog.data;

  if (!userAddress || !marketBytes) {
    log.warn(TAG, "PositionClosed event with missing topics – skipping", { txHash });
    return;
  }

  let amount = 0n;
  let pnl = 0n;
  if (data && data.length >= 130) {
    amount = BigInt(`0x${data.slice(2, 66)}`);
    const rawPnl = BigInt(`0x${data.slice(66, 130)}`);
    pnl =
      rawPnl >
      BigInt(
        "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      )
        ? rawPnl -
          BigInt(
            "0x10000000000000000000000000000000000000000000000000000000000000000",
          )
        : rawPnl;
  }

  const marketSymbol = bytes32ToSymbol(marketBytes);
  const amountFormatted = formatUnits(amount, 18);
  const pnlFormatted = formatUnits(pnl < 0n ? -pnl : pnl, 18);
  const pnlSign = pnl < 0n ? "-" : "+";

  log.info(TAG, `━━━ PositionClosed event detected ━━━`, {
    user: userAddress,
    market: marketSymbol,
    amount: amountFormatted,
    pnl: `${pnlSign}${pnlFormatted}`,
    txHash,
    block: blockNumber.toString(),
  });

  let order: Order | null = null;
  try {
    // 1) Try idempotency by closeTxHash (important when watcher already closed the order).
    order = await findOrderByCloseTxHash(txHash);

    // 2) Try openKey matching (works when watcher has not yet cleared openKey).
    if (!order) {
      order = await findOpenOrderByWalletAndMarket(
        userAddress.toLowerCase(),
        marketSymbol,
      );
    }

    // 3) Fallback: most recent order for wallet+market.
    if (!order) {
      order = await findLatestOrderByWalletAndMarket(userAddress.toLowerCase(), marketSymbol);
    }
  } catch (err) {
    log.error(TAG, `DB lookup failed for PositionClosed event`, {
      user: userAddress,
      market: marketSymbol,
      txHash,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (!order) {
    log.warn(
      TAG,
      `No matching open order found in DB – position may have been opened externally or already closed`,
      { user: userAddress, market: marketSymbol, txHash },
    );
    return;
  }

  log.info(TAG, `Matched on-chain event to off-chain order`, {
    orderId: order.id,
    side: order.side,
    entryPrice: `$${order.entryPrice.toFixed(2)}`,
    margin: `${order.marginAmount} zUSDC`,
    leverage: `${order.leverage}x`,
  });

  try {
    const closePrice = reconstructClosePriceFromPnl(
      order.side,
      order.entryPrice,
      order.leverage,
      Number(amountFormatted),
      pnl,
    );
    // Determine whether tx was submitted by keeper, and then classify closeReason.
    let closeReasonCode: CloseReasonCode = CloseReasonCode.Manual;
    let statusToSet: Order["status"] = "Closed";

    try {
      const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
      const fromLower = tx?.from?.toLowerCase();
      const isKeeperTx = Boolean(keeperAddressLower && fromLower && fromLower === keeperAddressLower);

      if (isKeeperTx) {
        if (closePrice != null) {
          closeReasonCode = checkOrderTrigger(order, closePrice);
          statusToSet = closeReasonCodeToOrderStatus(closeReasonCode);
        } else {
          closeReasonCode = CloseReasonCode.Manual;
          statusToSet = "Closed";
        }
      } else {
        // User-initiated close => manual (code 0)
        closeReasonCode = CloseReasonCode.Manual;
        statusToSet = "Closed";
      }
    } catch (err) {
      log.warn(TAG, "Failed to fetch tx.from for PositionClosed classification", {
        txHash,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const updatedOrder = await markClosedByEvent(
      order.id,
      txHash,
      closePrice ?? undefined,
      statusToSet,
      closeReasonCode,
      pnl.toString(),
    );
    log.action(
      TAG,
      `Off-chain DB updated: order #${order.id.slice(0, 8)} → ${statusToSet}`,
      {
        orderId: order.id,
        closeTxHash: txHash,
        closePrice: closePrice ?? "unknown",
        closeReasonCode,
        finalPnl: pnl.toString(),
      },
    );

    // Use the updated order values for smart-contract stats.
    order = updatedOrder;
  } catch (err) {
    log.error(TAG, `Failed to update off-chain DB for order`, {
      orderId: order.id,
      txHash,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const durationMs = Date.now() - new Date(order.openedAt).getTime();

  const stats: ClosureStats = {
    positionId: order.id,
    walletAddress: order.walletAddress,
    market: order.market,
    side: order.side,
    entryPrice: order.entryPrice,
    closePrice: order.closePrice,
    pnl: `${pnlSign}${pnlFormatted}`,
    positionSize: order.positionSize,
    leverage: order.leverage,
    durationMs,
    closeTxHash: txHash,
    closedAt: new Date(),
  };

  log.info(TAG, `Closure summary`, {
    orderId: order.id.slice(0, 8),
    market: stats.market,
    side: stats.side,
    entry: `$${stats.entryPrice.toFixed(2)}`,
    pnl: stats.pnl,
    size: `${stats.positionSize} zUSDC`,
    leverage: `${stats.leverage}x`,
    held: `${Math.round(durationMs / 60_000)}min`,
  });

  try {
    const result = await updateSmartContractWithClosureStats(stats);
    if (result.success) {
      log.info(TAG, `Closure stats submitted on-chain`, {
        txHash: result.txHash,
        gasUsed: result.gasUsed?.toString(),
      });
    } else {
      log.warn(TAG, `Closure stats submission failed (non-blocking)`, {
        error: result.error,
        attempts: result.attempts,
      });
    }
  } catch (err) {
    log.error(
      TAG,
      `updateSmartContractWithClosureStats threw unexpectedly`,
      {
        positionId: stats.positionId,
        error: err instanceof Error ? err.message : String(err),
      },
    );
  }

  log.info(
    TAG,
    `PositionClosed pipeline complete for order #${order.id.slice(0, 8)}`,
  );
}

// ─── Handler: PositionLiquidated ─────────────────────────────────────────────

async function handlePositionLiquidated(eventLog: Log): Promise<void> {
  const { userAddress, marketBytes, txHash, blockNumber } =
    decodeIndexedTopics(eventLog);
  const data = eventLog.data;

  if (!userAddress || !marketBytes) {
    log.warn(TAG, "PositionLiquidated event with missing topics – skipping", { txHash });
    return;
  }

  let amount = 0n;
  let pnl = 0n;
  if (data && data.length >= 66) {
    amount = BigInt(`0x${data.slice(2, 66)}`);
    if (data.length >= 130) {
      const rawPnl = BigInt(`0x${data.slice(66, 130)}`);
      pnl =
        rawPnl >
        BigInt(
          "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        )
          ? rawPnl -
            BigInt(
              "0x10000000000000000000000000000000000000000000000000000000000000000",
            )
          : rawPnl;
    }
  }

  const marketSymbol = bytes32ToSymbol(marketBytes);
  const amountFormatted = formatUnits(amount, 18);

  log.warn(TAG, `━━━ PositionLiquidated event detected ━━━`, {
    user: userAddress,
    market: marketSymbol,
    amount: amountFormatted,
    txHash,
    block: blockNumber.toString(),
  });

  let order: Order | null = null;
  try {
    // 1) Try idempotency by closeTxHash.
    order = await findOrderByCloseTxHash(txHash);

    // 2) Try openKey matching.
    if (!order) {
      order = await findOpenOrderByWalletAndMarket(
        userAddress.toLowerCase(),
        marketSymbol,
      );
    }

    // 3) Fallback: most recent order for wallet+market.
    if (!order) {
      order = await findLatestOrderByWalletAndMarket(userAddress.toLowerCase(), marketSymbol);
    }
  } catch (err) {
    log.error(TAG, `DB lookup failed for PositionLiquidated event`, {
      user: userAddress,
      market: marketSymbol,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (!order) {
    log.warn(TAG, `No matching open order for liquidation event`, {
      user: userAddress,
      market: marketSymbol,
      txHash,
    });
    return;
  }

  try {
    const closePrice = reconstructClosePriceFromPnl(
      order.side,
      order.entryPrice,
      order.leverage,
      Number(amountFormatted),
      pnl,
    );

    let closeReasonCode: CloseReasonCode = CloseReasonCode.Manual;
    let statusToSet: Order["status"] = "Closed";

    try {
      const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
      const fromLower = tx?.from?.toLowerCase();
      const isKeeperTx = Boolean(keeperAddressLower && fromLower && fromLower === keeperAddressLower);

      if (isKeeperTx) {
        if (closePrice != null) {
          closeReasonCode = checkOrderTrigger(order, closePrice);
          statusToSet = closeReasonCodeToOrderStatus(closeReasonCode);
        } else {
          closeReasonCode = CloseReasonCode.Manual;
          statusToSet = "Closed";
        }
      } else {
        closeReasonCode = CloseReasonCode.Manual;
        statusToSet = "Closed";
      }
    } catch (err) {
      log.warn(TAG, "Failed to fetch tx.from for PositionLiquidated classification", {
        txHash,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const updatedOrder = await markClosedByEvent(
      order.id,
      txHash,
      closePrice ?? undefined,
      statusToSet,
      closeReasonCode,
      pnl.toString(),
    );
    log.action(
      TAG,
      `Order #${order.id.slice(0, 8)} marked via on-chain event`,
      { orderId: order.id, closeTxHash: txHash, closePrice: closePrice ?? "unknown", closeReasonCode },
    );
    order = updatedOrder;
  } catch (err) {
    log.error(TAG, `Failed to mark order as liquidated`, {
      orderId: order.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Event router ────────────────────────────────────────────────────────────

async function routeEvent(
  eventName: string,
  eventLog: Log,
): Promise<void> {
  switch (eventName) {
    case "PositionOpened":
      await handlePositionOpened(eventLog);
      break;
    case "PositionClosed":
      await handlePositionClosed(eventLog);
      break;
    case "PositionLiquidated":
      await handlePositionLiquidated(eventLog);
      break;
    default:
      log.info(TAG, `Unhandled event: ${eventName}`);
  }
}

// ─── Multi-event watcher ─────────────────────────────────────────────────────

let lastProcessedBlock: bigint | null = null;
const unwatchList: WatchContractEventReturnType[] = [];
let retryDelay = INITIAL_RETRY_DELAY_MS;

const WATCHED_EVENTS = [
  "PositionOpened",
  "PositionClosed",
  "PositionLiquidated",
] as const;

export async function startEventListener(): Promise<void> {
  log.info(TAG, `Starting blockchain event listener`, {
    contract: config.perpDexAddress,
    chain: config.chainId,
    events: WATCHED_EVENTS.join(", "),
    pollingInterval: `${POLL_INTERVAL_MS}ms`,
  });

  try {
    const currentBlock = await publicClient.getBlockNumber();
    lastProcessedBlock = currentBlock;
    log.info(TAG, `Current block: ${currentBlock}`, {
      block: currentBlock.toString(),
    });
  } catch (err) {
    log.warn(TAG, `Could not fetch current block – starting from latest`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  subscribeToEvents();
}

function subscribeToEvents(): void {
  try {
    for (const u of unwatchList) u();
    unwatchList.length = 0;

    for (const eventName of WATCHED_EVENTS) {
      const unsub = publicClient.watchContractEvent({
        address: config.perpDexAddress,
        abi: PERPETUAL_DEX_ABI,
        eventName,
        onLogs: async (logs) => {
          retryDelay = INITIAL_RETRY_DELAY_MS;

          for (const eventLog of logs) {
            const block = eventLog.blockNumber ?? 0n;

            if (lastProcessedBlock !== null && block <= lastProcessedBlock) {
              continue;
            }

            try {
              await routeEvent(eventName, eventLog as unknown as Log);
            } catch (err) {
              log.error(TAG, `Unhandled error in ${eventName} handler`, {
                txHash: eventLog.transactionHash ?? "unknown",
                block: block.toString(),
                error: err instanceof Error ? err.message : String(err),
              });
            }

            if (block > (lastProcessedBlock ?? 0n)) {
              lastProcessedBlock = block;
            }
          }
        },
        onError: (err) => {
          log.error(TAG, `${eventName} subscription error – will reconnect`, {
            error: err instanceof Error ? err.message : String(err),
            retryIn: `${retryDelay}ms`,
          });
          scheduleReconnect();
        },
      });

      unwatchList.push(unsub);
    }

    log.info(TAG, `Subscribed to ${WATCHED_EVENTS.length} events`, {
      events: WATCHED_EVENTS.join(", "),
      contract: config.perpDexAddress,
    });
  } catch (err) {
    log.error(TAG, `Failed to subscribe to events`, {
      error: err instanceof Error ? err.message : String(err),
    });
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  log.warn(TAG, `Reconnecting in ${retryDelay}ms...`);
  setTimeout(() => {
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
    subscribeToEvents();
  }, retryDelay);
}

export function stopEventListener(): void {
  for (const u of unwatchList) u();
  unwatchList.length = 0;
  log.info(TAG, "Event listener stopped");
}
