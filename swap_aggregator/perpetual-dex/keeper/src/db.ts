import { PrismaClient } from "@prisma/client";
import type { CreateOrderInput, Order, OrderStatus } from "./types.js";

const prisma = new PrismaClient();

function computeOpenKey(walletAddress: string, market: string) {
  return `${walletAddress.toLowerCase()}:${market}`;
}

function scoreOpenOrder(o: any) {
  const hasTx = o.openTxHash ? 1 : 0;
  const hasEvent = o.openEventId ? 1 : 0;
  const created = o.createdAt ? new Date(o.createdAt).getTime() : 0;
  const updated = o.updatedAt ? new Date(o.updatedAt).getTime() : 0;
  return hasEvent * 10 ** 18 + hasTx * 10 ** 15 + created * 10 ** 3 + (updated % 1000);
}

/**
 * Reconcile Open orders to prevent duplicates and to backfill openKey.
 * - Ensures 1 Open row per wallet+market with openKey set.
 * - Cancels extra Open rows (status=Cancelled, openKey=null).
 */
export async function reconcileOpenOrders(): Promise<{ cancelled: number; backfilled: number }> {
  const opens = await prisma.order.findMany({
    where: { status: "Open" },
    orderBy: [{ createdAt: "desc" }],
  });
  if (opens.length === 0) return { cancelled: 0, backfilled: 0 };

  const groups = new Map<string, any[]>();
  for (const o of opens) {
    const k = computeOpenKey(o.walletAddress, o.market);
    const arr = groups.get(k) ?? [];
    arr.push(o);
    groups.set(k, arr);
  }

  let cancelled = 0;
  let backfilled = 0;
  const txs: any[] = [];

  for (const [k, arr] of groups.entries()) {
    arr.sort((a, b) => scoreOpenOrder(b) - scoreOpenOrder(a));
    const keep = arr[0];
    if (!keep.openKey) {
      txs.push(
        prisma.order.update({
          where: { id: keep.id },
          data: { openKey: k },
        }),
      );
      backfilled++;
    }

    for (const extra of arr.slice(1)) {
      txs.push(
        prisma.order.update({
          where: { id: extra.id },
          data: {
            status: "Cancelled",
            openKey: null,
            closedAt: new Date(),
          },
        }),
      );
      cancelled++;
    }
  }

  if (txs.length) await prisma.$transaction(txs);
  return { cancelled, backfilled };
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const positionSize = String(Number(input.marginAmount) * input.leverage);
  const normalizedWallet = input.walletAddress.toLowerCase();
  const openKey = computeOpenKey(normalizedWallet, input.market);

  const update: Record<string, unknown> = {
    walletAddress: normalizedWallet,
    market: input.market,
    openKey,
    side: input.side,
    marginAmount: input.marginAmount,
    leverage: input.leverage,
    positionSize,
    entryPrice: input.entryPrice,
    liquidationPrice: input.liquidationPrice,
    status: "Open",
  };
  if (input.takeProfitPrice !== undefined) update.takeProfitPrice = input.takeProfitPrice ?? null;
  if (input.stopLossPrice !== undefined) update.stopLossPrice = input.stopLossPrice ?? null;
  if (input.openTxHash !== undefined) update.openTxHash = input.openTxHash ?? null;
  if (input.openEventId !== undefined) update.openEventId = input.openEventId ?? null;
  if (input.openLogIndex !== undefined) update.openLogIndex = input.openLogIndex ?? null;

  return prisma.order.upsert({
    where: { openKey },
    create: {
      openKey,
      walletAddress: normalizedWallet,
      market: input.market,
      side: input.side,
      marginAmount: input.marginAmount,
      leverage: input.leverage,
      positionSize,
      entryPrice: input.entryPrice,
      liquidationPrice: input.liquidationPrice,
      takeProfitPrice: input.takeProfitPrice ?? null,
      stopLossPrice: input.stopLossPrice ?? null,
      openTxHash: input.openTxHash ?? null,
      openEventId: input.openEventId ?? null,
      openLogIndex: input.openLogIndex ?? null,
      status: "Open",
    },
    update: update as any,
  }) as unknown as Order;
}

export async function getOpenOrders(): Promise<Order[]> {
  return prisma.order.findMany({
    where: { status: "Open", openKey: { not: null } },
    orderBy: { createdAt: "asc" },
  }) as unknown as Order[];
}

/**
 * Find the most recent open order matching a wallet address and market.
 * Used by the event listener to correlate on-chain PositionClosed events
 * back to our off-chain order records.
 */
export async function findOpenOrderByWalletAndMarket(
  walletAddress: string,
  market: string,
): Promise<Order | null> {
  const order = await prisma.order.findUnique({
    where: { openKey: computeOpenKey(walletAddress, market) },
  });
  return (order as unknown as Order) ?? null;
}

/**
 * Find an order by the close transaction hash (idempotency).
 * Useful when the watcher already closed the order and cleared `openKey`,
 * while the event listener processes PositionClosed/Liquidated afterwards.
 */
export async function findOrderByCloseTxHash(closeTxHash: string): Promise<Order | null> {
  const order = await prisma.order.findFirst({
    where: { closeTxHash: closeTxHash ?? null },
    orderBy: { closedAt: "desc" },
  });
  return (order as unknown as Order) ?? null;
}

/**
 * Fallback correlation: find the most recent order for wallet+market,
 * regardless of current status.
 *
 * This is best-effort and should rarely be hit if (1) openKey matching
 * or (2) closeTxHash matching works.
 */
export async function findLatestOrderByWalletAndMarket(walletAddress: string, market: string): Promise<Order | null> {
  const order = await prisma.order.findFirst({
    where: { walletAddress: walletAddress.toLowerCase(), market },
    orderBy: { openedAt: "desc" },
  });
  return (order as unknown as Order) ?? null;
}

export async function closeOrder(
  id: string,
  status: OrderStatus,
  closePrice: number,
  closeTxHash?: string,
  closeReasonCode?: number,
  finalPnl?: string,
): Promise<Order> {
  return prisma.order.update({
    where: { id },
    data: {
      status,
      closePrice,
      closeTxHash: closeTxHash ?? null,
      closeReasonCode: closeReasonCode ?? 0,
      finalPnl: finalPnl ?? null,
      closedAt: new Date(),
      openKey: null,
    },
  }) as unknown as Order;
}

export async function cancelOpenOrder(id: string): Promise<Order> {
  return prisma.order.update({
    where: { id },
    data: {
      status: "Cancelled",
      openKey: null,
      closedAt: new Date(),
    },
  }) as unknown as Order;
}

/**
 * Mark an order as Closed specifically in response to an on-chain event.
 * Separate from closeOrder to provide a cleaner API for the event listener,
 * where we may not have a closePrice from our oracle feed.
 */
export async function markClosedByEvent(
  id: string,
  closeTxHash: string,
  closePrice?: number,
  status: OrderStatus = "Closed",
  closeReasonCode?: number,
  finalPnl?: string,
): Promise<Order> {
  return prisma.order.update({
    where: { id },
    data: {
      status,
      closePrice: closePrice ?? null,
      closeTxHash,
      closeReasonCode: closeReasonCode ?? 0,
      finalPnl: finalPnl ?? null,
      closedAt: new Date(),
      openKey: null,
    },
  }) as unknown as Order;
}

/**
 * Update TP/SL for an existing order. Called by the REST API when
 * the frontend registers take-profit / stop-loss after opening a position.
 */
export async function updateOrderTpSl(
  id: string,
  takeProfitPrice: number | null,
  stopLossPrice: number | null,
): Promise<Order> {
  return prisma.order.update({
    where: { id },
    data: { takeProfitPrice, stopLossPrice },
  }) as unknown as Order;
}

/**
 * Update TP/SL by wallet + market (finds the latest open order).
 */
export async function updateTpSlByWalletAndMarket(
  walletAddress: string,
  market: string,
  takeProfitPrice: number | null,
  stopLossPrice: number | null,
): Promise<Order | null> {
  const normalized = walletAddress.toLowerCase();

  // There can be duplicate Open orders for the same position (e.g. multiple PositionOpened ingestions).
  // To ensure the watcher triggers, update TP/SL across ALL open orders for this wallet+market.
  const result = await prisma.order.updateMany({
    where: {
      walletAddress: normalized,
      market,
      status: "Open",
    },
    data: { takeProfitPrice, stopLossPrice },
  });

  if (!result.count) return null;

  // Return the most recent open order as the canonical record.
  const order = await prisma.order.findFirst({
    where: {
      walletAddress: normalized,
      market,
      status: "Open",
    },
    orderBy: { createdAt: "desc" },
  });
  return (order as unknown as Order) ?? null;
}

export async function getOrderById(id: string): Promise<Order | null> {
  const order = await prisma.order.findUnique({ where: { id } });
  return (order as unknown as Order) ?? null;
}

export async function getAllOrders(limit = 100): Promise<Order[]> {
  return prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  }) as unknown as Order[];
}

export { prisma };
