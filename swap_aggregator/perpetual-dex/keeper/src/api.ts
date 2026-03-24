import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import {
  getOpenOrders,
  getAllOrders,
  getOrderById,
  updateOrderTpSl,
  updateTpSlByWalletAndMarket,
} from "./db.js";
import { syncPositionFromChain } from "./syncPosition.js";
import { checkCooldown, sendZUSDC } from "./faucet.js";
import { log } from "./logger.js";
import { getRecentLogs } from "./recentLogs.js";
import { calcLiquidationPrice } from "./tradeMath.js";
import { getCacheResetState } from "./cacheReset.js";

const TAG = "api";
const MIRROR_BASE_URL = "https://testnet.mirrornode.hedera.com/api/v1";

function toRaw8FromRaw18(amountRaw18: bigint): bigint {
  const factor = 10n ** 10n;
  if (amountRaw18 % factor !== 0n) {
    throw new Error("amountRaw must align to token decimals (8)");
  }
  return amountRaw18 / factor;
}

function normalizeTxIdForMirror(input: string): string {
  const v = input.trim();
  if (!v) return v;
  return v.replace("@", "-");
}

function parseMirrorTxId(txId: string): { accountId: string; seconds: number; nanos?: number } | null {
  const normalized = normalizeTxIdForMirror(txId);
  const parts = normalized.split("-");
  if (parts.length < 2) return null;
  const accountId = parts[0];
  if (!/^0\.0\.\d+$/.test(accountId)) return null;
  let seconds = NaN;
  let nanos: number | undefined;

  if (parts.length >= 3) {
    // Format: 0.0.x-seconds-nanos
    seconds = Number(parts[1]);
    nanos = Number(String(parts[2]).replace(/[^\d]/g, "").padStart(9, "0").slice(0, 9));
  } else {
    // Format: 0.0.x-seconds.nanos
    const [secRaw, nanoRaw] = parts[1].split(".");
    seconds = Number(secRaw);
    if (nanoRaw) {
      nanos = Number(String(nanoRaw).replace(/[^\d]/g, "").padStart(9, "0").slice(0, 9));
    }
  }
  if (!Number.isFinite(seconds)) return null;
  if (nanos !== undefined && !Number.isFinite(nanos)) nanos = undefined;
  return { accountId, seconds, nanos };
}

async function resolveContractAccountIdFromEvm(evmAddress: string): Promise<string> {
  const resp = await fetch(`${MIRROR_BASE_URL}/contracts/${evmAddress}`);
  if (!resp.ok) throw new Error(`Cannot resolve DEX contract account id: ${evmAddress}`);
  const data = (await resp.json()) as { contract_id?: string };
  if (!data.contract_id || !/^0\.0\.\d+$/.test(data.contract_id)) {
    throw new Error(`Invalid DEX contract_id from mirror: ${evmAddress}`);
  }
  return data.contract_id;
}

async function verifyHtsTransferBeforeDeposit(params: {
  transferTxHash: string;
  walletAddress: string;
  amountRaw18: bigint;
  expectedTokenId: string;
  expectedReceiverAccountId: string;
}): Promise<void> {
  const txId = normalizeTxIdForMirror(params.transferTxHash);
  if (!txId || txId.startsWith("0x")) {
    throw new Error("transferTxHash must be Hedera transaction id (0.0.x@seconds.nanos)");
  }
  const senderAccountId = await resolveRecipientAccountId(params.walletAddress);
  if (!senderAccountId) throw new Error("Cannot resolve sender accountId from walletAddress");
  const expectedAmountRaw8 = toRaw8FromRaw18(params.amountRaw18);
  const expectedAmount = Number(expectedAmountRaw8);
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    throw new Error("Invalid expected transfer amount");
  }

  let tx: {
    result?: string;
    token_transfers?: Array<{ token_id?: string; account?: string; amount?: number }>;
  } | null = null;
  let lastFetchError = "";
  for (let i = 0; i < 12; i += 1) {
    const txResp = await fetch(`${MIRROR_BASE_URL}/transactions/${txId}`);
    if (txResp.ok) {
      const txData = (await txResp.json()) as {
        transactions?: Array<{
          result?: string;
          token_transfers?: Array<{ token_id?: string; account?: string; amount?: number }>;
        }>;
      };
      tx = txData.transactions?.[0] ?? null;
      if (tx) break;
    } else {
      lastFetchError = `${txResp.status}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  // Fallback: query by account + timestamp window and match by token/account/amount.
  if (!tx) {
    const parsed = parseMirrorTxId(txId);
    if (parsed) {
      const fromSec = Math.max(0, parsed.seconds - 120);
      const toSec = parsed.seconds + 120;
      const fallbackUrl =
        `${MIRROR_BASE_URL}/transactions?account.id=${parsed.accountId}` +
        `&timestamp=gte:${fromSec}.000000000&timestamp=lte:${toSec}.999999999&limit=100&order=desc`;
      const fallbackResp = await fetch(fallbackUrl);
      if (fallbackResp.ok) {
        const fallbackData = (await fallbackResp.json()) as {
          transactions?: Array<{
            consensus_timestamp?: string;
            result?: string;
            token_transfers?: Array<{ token_id?: string; account?: string; amount?: number }>;
          }>;
        };
        tx =
          fallbackData.transactions?.find((candidate) => {
            const transfers = candidate.token_transfers ?? [];
            const senderOk = transfers.some(
              (t) =>
                t.token_id === params.expectedTokenId &&
                t.account === senderAccountId &&
                Number(t.amount ?? 0) === -expectedAmount,
            );
            const receiverOk = transfers.some(
              (t) =>
                t.token_id === params.expectedTokenId &&
                t.account === params.expectedReceiverAccountId &&
                Number(t.amount ?? 0) === expectedAmount,
            );
            return senderOk && receiverOk;
          }) ?? null;
      }
    }
  }
  if (!tx) {
    throw new Error(
      `Cannot fetch transfer tx from mirror: ${txId}${lastFetchError ? ` (status ${lastFetchError})` : ""}`,
    );
  }
  if (!tx) throw new Error("Transfer tx not found on mirror");
  if (String(tx.result ?? "").toUpperCase() !== "SUCCESS") {
    throw new Error(`Transfer tx is not successful: ${tx.result ?? "UNKNOWN"}`);
  }

  const tokenTransfers = tx.token_transfers ?? [];
  const senderMatched = tokenTransfers.some(
    (t) =>
      t.token_id === params.expectedTokenId &&
      t.account === senderAccountId &&
      Number(t.amount ?? 0) === -expectedAmount,
  );
  const receiverMatched = tokenTransfers.some(
    (t) =>
      t.token_id === params.expectedTokenId &&
      t.account === params.expectedReceiverAccountId &&
      Number(t.amount ?? 0) === expectedAmount,
  );
  if (!senderMatched || !receiverMatched) {
    throw new Error("Transfer proof mismatch: token/account/amount does not match request");
  }
}

async function resolveRecipientAccountId(input: string): Promise<string | null> {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (/^0\.0\.\d+$/.test(raw)) return raw;
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) return null;
  try {
    const url = `https://testnet.mirrornode.hedera.com/api/v1/accounts/${raw}`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data = (await resp.json()) as { account?: string };
      if (data?.account && /^0\.0\.\d+$/.test(data.account)) {
        return data.account;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function withComputedLiquidation<T extends { side: "Long" | "Short"; entryPrice: number; leverage: number; liquidationPrice: number }>(
  order: T,
): T {
  const liq = calcLiquidationPrice(order.side, order.entryPrice, order.leverage, config.liquidationMmr);
  return {
    ...order,
    liquidationPrice: liq ?? order.liquidationPrice,
  };
}

export async function startApi(): Promise<void> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  // ─── Health check ──────────────────────────────────────────────────────────

  app.get("/health", async () => ({
    status: "ok",
    chain: config.chainId,
    contract: config.perpDexAddress,
    uptime: process.uptime(),
  }));

  // ─── GET /diagnostic — TP/SL chain verification ────────────────────────────

  app.get("/diagnostic", async () => {
    const openOrders = await getOpenOrders();
    let keeperAddress = "0x0000000000000000000000000000000000000000";
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.JsonRpcProvider(config.rpcUrl, {
        chainId: config.chainId,
        name: "polkadot-hub-testnet",
      });
      const abi = ["function keeperAddress() view returns (address)"];
      const contract = new ethers.Contract(config.perpDexAddress as string, abi, provider);
      keeperAddress = await contract.keeperAddress();
    } catch (e) {
      keeperAddress = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
    let keeperWalletAddress = "unknown";
    try {
      const { ethers } = await import("ethers");
      const w = new ethers.Wallet(config.keeperPrivateKey as string);
      keeperWalletAddress = w.address;
    } catch {
      keeperWalletAddress = "invalid key";
    }
    return {
      contract: config.perpDexAddress,
      openOrdersCount: openOrders.length,
      openOrdersSample: openOrders.slice(0, 3).map((o) => ({
        id: o.id.slice(0, 8),
        market: o.market,
        side: o.side,
        tp: o.takeProfitPrice,
        sl: o.stopLossPrice,
        wallet: o.walletAddress.slice(0, 14) + "...",
      })),
      contractKeeperAddress: keeperAddress,
      keeperWalletAddress,
      keeperAuthorized: String(keeperAddress).toLowerCase() === keeperWalletAddress.toLowerCase(),
      hint: keeperAddress === "0x0000000000000000000000000000000000000000"
        ? "Run: npx hardhat run scripts/setKeeper.ts --network polkadotTestnet"
        : openOrders.length === 0
          ? "No open orders. Sync position: POST /orders/sync with walletAddress, market, takeProfitPrice, stopLossPrice"
          : null,
    };
  });

  // ─── GET /orders — list all orders ─────────────────────────────────────────

  app.get<{
    Querystring: { status?: string; limit?: string };
  }>("/orders", async (req) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    if (req.query.status === "Open") {
      const orders = await getOpenOrders();
      return orders.map(withComputedLiquidation);
    }
    const orders = await getAllOrders(limit);
    return orders.map(withComputedLiquidation);
  });

  // ─── GET /logs/recent — recent keeper logs (English) ───────────────────────
  app.get<{ Querystring: { limit?: string } }>("/logs/recent", async (req) => {
    const limit = Math.min(Number(req.query.limit) || 120, 400);
    return getRecentLogs(limit);
  });

  // ─── GET /cache/reset — client cache reset signal per wallet ───────────────
  app.get<{ Querystring: { wallet: string } }>("/cache/reset", async (req, reply) => {
    const wallet = String((req.query as any)?.wallet ?? "").trim();
    if (!wallet) {
      reply.status(400);
      return { error: "Missing querystring: wallet" };
    }
    const state = getCacheResetState(wallet);
    return { wallet, ...state };
  });

  // ─── GET /orders/:id — get single order ────────────────────────────────────

  app.get<{ Params: { id: string } }>("/orders/:id", async (req, reply) => {
    const order = await getOrderById(req.params.id);
    if (!order) {
      reply.status(404);
      return { error: "Order not found" };
    }
    return withComputedLiquidation(order as any);
  });

  // ─── PUT /orders/:id/tp-sl — update TP/SL by order ID ─────────────────────

  app.put<{
    Params: { id: string };
    Body: { takeProfitPrice?: number | null; stopLossPrice?: number | null };
  }>("/orders/:id/tp-sl", async (req, reply) => {
    const { id } = req.params;
    const { takeProfitPrice, stopLossPrice } = req.body ?? {};

    const existing = await getOrderById(id);
    if (!existing) {
      reply.status(404);
      return { error: "Order not found" };
    }
    if (existing.status !== "Open") {
      reply.status(400);
      return { error: `Cannot update TP/SL for order with status '${existing.status}'` };
    }

    const tp = takeProfitPrice !== undefined ? takeProfitPrice : existing.takeProfitPrice;
    const sl = stopLossPrice !== undefined ? stopLossPrice : existing.stopLossPrice;

    const updated = await updateOrderTpSl(id, tp, sl);

    log.info(TAG, `TP/SL updated via API`, {
      orderId: id,
      tp: tp != null ? `$${tp.toFixed(2)}` : "none",
      sl: sl != null ? `$${sl.toFixed(2)}` : "none",
    });

    return updated;
  });

  // ─── POST /orders/sync — sync on-chain position into DB (for positions opened before keeper) ─

  app.post<{
    Body: {
      walletAddress: string;
      market: string;
      takeProfitPrice?: number | null;
      stopLossPrice?: number | null;
    };
  }>("/orders/sync", async (req, reply) => {
    const { walletAddress, market, takeProfitPrice, stopLossPrice } = req.body ?? {};

    if (!walletAddress || !market) {
      reply.status(400);
      return { error: "walletAddress and market are required" };
    }

    const result = await syncPositionFromChain(
      walletAddress,
      market,
      takeProfitPrice ?? null,
      stopLossPrice ?? null,
    );

    if (!result) {
      reply.status(404);
      return {
        error: "No on-chain position found for this wallet and market",
        walletAddress,
        market,
      };
    }

    return result;
  });

  // ─── POST /orders/tp-sl — update TP/SL by wallet + market ─────────────────
  // This is what the frontend calls after opening a position

  app.post<{
    Body: {
      walletAddress: string;
      market: string;
      takeProfitPrice?: number | null;
      stopLossPrice?: number | null;
    };
  }>("/orders/tp-sl", async (req, reply) => {
    const { walletAddress, market, takeProfitPrice, stopLossPrice } =
      req.body ?? {};

    if (!walletAddress || !market) {
      reply.status(400);
      return { error: "walletAddress and market are required" };
    }

    const tp = takeProfitPrice ?? null;
    const sl = stopLossPrice ?? null;

    const updated = await updateTpSlByWalletAndMarket(
      walletAddress,
      market,
      tp,
      sl,
    );

    if (!updated) {
      reply.status(404);
      return {
        error: "No open order found for this wallet and market",
        walletAddress,
        market,
      };
    }

    log.info(TAG, `TP/SL registered via frontend`, {
      orderId: updated.id,
      wallet: walletAddress.slice(0, 10) + "...",
      market,
      tp: tp != null ? `$${tp.toFixed(2)}` : "none",
      sl: sl != null ? `$${sl.toFixed(2)}` : "none",
    });

    return updated;
  });

  // ─── POST /deposit/hts-sync — keeper syncs internal DEX balance after HTS transfer ─────────
  app.post<{
    Body: {
      walletAddress: string;
      amountRaw: string;
      transferTxHash?: string;
    };
  }>("/deposit/hts-sync", async (req, reply) => {
    const walletAddress = String(req.body?.walletAddress ?? "").trim();
    const amountRaw = String(req.body?.amountRaw ?? "").trim();
    const transferTxHash = String(req.body?.transferTxHash ?? "").trim();

    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      reply.status(400);
      return { error: "Invalid walletAddress (expected 0x...)" };
    }
    if (!/^\d+$/.test(amountRaw) || BigInt(amountRaw) <= 0n) {
      reply.status(400);
      return { error: "Invalid amountRaw" };
    }
    if (!transferTxHash) {
      reply.status(400);
      return { error: "transferTxHash is required for HTS transfer verification" };
    }

    try {
      const expectedTokenId = String(process.env.FAUCET_HTS_TOKEN_ID ?? "").trim();
      if (!/^0\.0\.\d+$/.test(expectedTokenId)) {
        throw new Error("Missing/invalid FAUCET_HTS_TOKEN_ID in keeper env");
      }
      const dexAccountId = await resolveContractAccountIdFromEvm(config.perpDexAddress);
      await verifyHtsTransferBeforeDeposit({
        transferTxHash,
        walletAddress,
        amountRaw18: BigInt(amountRaw),
        expectedTokenId,
        expectedReceiverAccountId: dexAccountId,
      });

      const { ethers } = await import("ethers");
      const provider = new ethers.JsonRpcProvider(config.rpcUrl, {
        chainId: config.chainId,
        name: "hedera-testnet",
      });
      const keeper = new ethers.Wallet(config.keeperPrivateKey, provider);
      const dexAbi = ["function depositFor(address _user, uint256 _amount)"];
      const dex = new ethers.Contract(config.perpDexAddress, dexAbi, keeper);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ?? ethers.parseUnits("1000", "gwei");

      const tx = await dex.depositFor(walletAddress, BigInt(amountRaw), {
        type: 0,
        gasPrice,
        gasLimit: 1_000_000n,
      });
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error("depositFor reverted on-chain");
      }

      return {
        success: true,
        syncTxHash: tx.hash,
        transferTxHash: transferTxHash || undefined,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reply.status(500);
      return { error: msg };
    }
  });

  // ─── GET /faucet/status?wallet=0x… ────────────────────────────────────────

  app.get<{ Querystring: { wallet?: string } }>("/faucet/status", async (req, reply) => {
    const { wallet } = req.query;
    const accountId = await resolveRecipientAccountId(wallet ?? "");
    if (!accountId) {
      reply.status(400);
      return { error: "Invalid wallet format (use 0x... or 0.0.x)" };
    }
    const { ok, remainingMs, remainingClaims } = checkCooldown(accountId);
    return {
      canClaim: ok,
      remainingMs: ok ? 0 : remainingMs,
      remainingHours: ok ? 0 : Math.ceil(remainingMs / 3_600_000),
      remainingClaims,
      maxClaimsPer24h: 5,
    };
  });

  // ─── POST /faucet/zusdc — send 1000 zUSDC to user wallet ──────────────────

  app.post<{ Body: { walletAddress: string } }>("/faucet/zusdc", async (req, reply) => {
    const { walletAddress: rawWallet } = req.body ?? {};
    const recipientAccountId = await resolveRecipientAccountId(rawWallet ?? "");
    if (!recipientAccountId) {
      reply.status(400);
      return { error: "Invalid or missing walletAddress (use 0x... or 0.0.x)" };
    }

    const cooldown = checkCooldown(recipientAccountId);
    if (!cooldown.ok) {
      const remainingHours = Math.ceil(cooldown.remainingMs / 3_600_000);
      reply.status(429);
      return {
        error: `Rate limit: this wallet reached 5 claims in 24h. Try again in ~${remainingHours}h.`,
        remainingMs: cooldown.remainingMs,
        remainingHours,
        remainingClaims: cooldown.remainingClaims,
        maxClaimsPer24h: 5,
      };
    }

    try {
      const result = await sendZUSDC(recipientAccountId);
      log.info(TAG, `Faucet claimed`, { wallet: recipientAccountId, txHash: result.txHash });
      return {
        success: true,
        txHash: result.txHash,
        amount: result.amount,
        token: process.env.FAUCET_HTS_TOKEN_ID ?? "0.0.8271323",
        explorerUrl: `https://hashscan.io/testnet/transaction/${result.txHash}`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Faucet error";
      log.error(TAG, `Faucet failed`, { wallet: recipientAccountId, error: msg });
      reply.status(500);
      return { error: msg };
    }
  });

  // ─── Start server ──────────────────────────────────────────────────────────

  await app.listen({ port: config.apiPort, host: "0.0.0.0" });

  log.info(TAG, `REST API listening`, {
    port: config.apiPort,
    endpoints: [
      "GET  /health",
      "GET  /diagnostic",
      "GET  /orders",
      "GET  /orders/:id",
      "PUT  /orders/:id/tp-sl",
      "POST /orders/sync",
      "POST /orders/tp-sl",
      "POST /deposit/hts-sync",
      "GET  /faucet/status?wallet=0x…",
      "POST /faucet/zusdc",
    ],
  });
}
