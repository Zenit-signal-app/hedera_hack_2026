/**
 * Quét **SaucerSwap V1 Factory** (Uniswap V2–style `allPairs`) — tìm token X sao cho có pool
 * USDC–X và X–WHBAR, xếp hạng theo tích thanh khoản (reserve0 × reserve1 mỗi pool).
 *
 * HeliSwap đã đóng — không dùng factory HeliSwap.
 *
 * Env (frontend/.env):
 *   HEDERA_MAINNET_RPC_URL
 *   VITE_SAUCERSWAP_V1_FACTORY_EVM_MAINNET — mặc định entity 0.0.1062784
 *   VITE_AGGREGATOR_TOKEN_USDC_MAINNET
 *   VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET
 *
 * Tuỳ chọn:
 *   SCAN_MAX_PAIRS=800        — chỉ index N cặp đầu (nhanh khi test)
 *   SCAN_PAIR_CONCURRENCY=2   — song song (mặc định 2 — tránh UND_ERR_HEADERS_TIMEOUT / Hashio chậm)
 *   SCAN_BATCH_DELAY_MS=250   — nghỉ giữa mỗi batch
 *   SCAN_RPC_TIMEOUT_MS=600000 — timeout HTTP toàn request (ethers FetchRequest)
 *   SCAN_SEQUENTIAL=1         — 1 pair / lần (chậm nhưng ổn khi RPC hay timeout)
 *   SCAN_RPC_RETRIES=12       — retry khi 429 / 502 / timeout / JSON-RPC lỗi tạm thời
 *
 * Chạy:
 *   npm run scan:bridges:mainnet
 */
import { ethers } from "hardhat";
import { FetchRequest, JsonRpcProvider } from "ethers";

import {
  BRIDGE_WHITELIST_MAINNET,
  getWhitelistedAddressesLower,
  hederaEntityNumToEvmAddress,
} from "../shared/constants/bridges";

const FACTORY_ABI = [
  "function allPairsLength() external view returns (uint256)",
  "function allPairs(uint256) external view returns (address pair)",
] as const;

const PAIR_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function getReserves() external view returns (uint112,uint112,uint32)",
] as const;

const ERC20_ABI = ["function symbol() view returns (string)"] as const;

const DEFAULT_FACTORY = hederaEntityNumToEvmAddress(1062784);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Lỗi RPC tạm thời (Hashio: 429, 502, Undici HeadersTimeout…) — nên retry. */
function isRetryableRpcError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const code =
    typeof e === "object" && e !== null && "code" in e ? String((e as { code?: unknown }).code) : "";
  if (code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT") {
    return true;
  }
  if (/HeadersTimeout|UND_ERR/i.test(msg)) return true;
  if (/Too Many Requests|429|rate limit|RATE|throttl/i.test(msg)) return true;
  if (
    /\b50[0234]\b|Bad Gateway|Gateway Timeout|Service Unavailable|Invalid JSON-RPC|HH110/i.test(msg)
  ) {
    return true;
  }
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|socket hang up|fetch failed|network|TIMEOUT/i.test(msg)) {
    return true;
  }
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isRetryableRpcError(e)) throw e;
      if (attempt === maxRetries - 1) throw e;
      const delay = 500 + 500 * 2 ** attempt;
      await sleep(Math.min(delay, 15_000));
    }
  }
  throw last;
}

function edgeKey(a: string, b: string): string {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

async function main() {
  const usdc = process.env.VITE_AGGREGATOR_TOKEN_USDC_MAINNET?.trim();
  const whbar = process.env.VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET?.trim();
  const factoryAddr =
    process.env.VITE_SAUCERSWAP_V1_FACTORY_EVM_MAINNET?.trim() ||
    process.env.VITE_HELISWAP_FACTORY_EVM_MAINNET?.trim() ||
    DEFAULT_FACTORY;

  if (!usdc || !/^0x[a-fA-F0-9]{40}$/.test(usdc)) {
    throw new Error("Set VITE_AGGREGATOR_TOKEN_USDC_MAINNET=0x… in frontend/.env");
  }
  if (!whbar || !/^0x[a-fA-F0-9]{40}$/.test(whbar)) {
    throw new Error("Set VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET=0x… in frontend/.env");
  }

  const usdcLc = ethers.getAddress(usdc).toLowerCase();
  const whbarLc = ethers.getAddress(whbar).toLowerCase();

  if (usdcLc === whbarLc) throw new Error("USDC and WHBAR must differ");

  const rpcUrl = process.env.HEDERA_MAINNET_RPC_URL?.trim() || "https://mainnet.hashio.io/api";
  const timeoutMs = Math.max(60_000, parseInt(process.env.SCAN_RPC_TIMEOUT_MS ?? "600000", 10));
  const fetchReq = new FetchRequest(rpcUrl);
  fetchReq.timeout = timeoutMs;
  const provider = new JsonRpcProvider(fetchReq, 295);

  const maxEnv = process.env.SCAN_MAX_PAIRS?.trim();
  const conc = Math.min(32, Math.max(1, parseInt(process.env.SCAN_PAIR_CONCURRENCY ?? "2", 10)));
  const batchDelayMs = Math.max(0, parseInt(process.env.SCAN_BATCH_DELAY_MS ?? "250", 10));
  const rpcRetries = Math.max(1, parseInt(process.env.SCAN_RPC_RETRIES ?? "12", 10));
  const sequential = process.env.SCAN_SEQUENTIAL === "1" || process.env.SCAN_SEQUENTIAL === "true";

  const factory = new ethers.Contract(factoryAddr, FACTORY_ABI, provider);
  const n = await withRetry(() => factory.allPairsLength.staticCall(), rpcRetries);
  const len = Number(n);
  const maxPairs = maxEnv ? Math.min(len, Math.max(1, parseInt(maxEnv, 10))) : len;
  const whitelist = getWhitelistedAddressesLower();

  console.log("\n========== Bridge candidates (USDC → X → WHBAR) ==========\n");
  console.log("Factory (SaucerSwap V1):", factoryAddr);
  console.log("USDC:", usdc);
  console.log("WHBAR:", whbar);
  console.log("Pairs total:", len.toString(), maxPairs < len ? `(indexing first ${maxPairs})` : "");
  console.log(
    "RPC:",
    rpcUrl.slice(0, 48) + (rpcUrl.length > 48 ? "…" : ""),
    "| timeout ms:",
    timeoutMs,
  );
  console.log(
    sequential ? "Mode: sequential" : `Concurrency: ${conc}`,
    "| batch delay ms:",
    batchDelayMs,
    "| retries:",
    rpcRetries,
  );
  console.log("");

  const edgeMap = new Map<string, bigint>();

  async function indexPair(i: number): Promise<void> {
    await withRetry(async () => {
      const pairAddr = (await factory.allPairs.staticCall(i)) as string;
      const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
      const t0 = ((await pair.token0.staticCall()) as string).toLowerCase();
      const t1 = ((await pair.token1.staticCall()) as string).toLowerCase();
      const [r0, r1] = (await pair.getReserves.staticCall()) as [bigint, bigint, number];
      const L = r0 * r1;
      edgeMap.set(edgeKey(t0, t1), L);
    }, rpcRetries);
  }

  if (sequential) {
    for (let i = 0; i < maxPairs; i++) {
      await indexPair(i);
      if (i % 50 === 49 || i + 1 === maxPairs) process.stdout.write(`\rIndexed pairs ${i + 1}/${maxPairs}`);
      if (i + 1 < maxPairs && batchDelayMs > 0) await sleep(batchDelayMs);
    }
  } else {
    for (let start = 0; start < maxPairs; start += conc) {
      const end = Math.min(start + conc, maxPairs);
      await Promise.all(Array.from({ length: end - start }, (_, j) => indexPair(start + j)));
      process.stdout.write(`\rIndexed pairs ${end}/${maxPairs}`);
      if (end < maxPairs && batchDelayMs > 0) {
        await sleep(batchDelayMs);
      }
    }
  }
  process.stdout.write(`\rIndexed pairs ${maxPairs}/${maxPairs}\n\n`);

  function liquidityBetween(a: string, b: string): bigint | undefined {
    return edgeMap.get(edgeKey(a, b));
  }

  type Row = { x: string; L1: bigint; L2: bigint; score: bigint; inWhitelist: boolean };
  const rows: Row[] = [];

  for (const [k, L1] of edgeMap) {
    const [a, b] = k.split("|");
    if (a === undefined || b === undefined) continue;

    if ((a === usdcLc && b === whbarLc) || (a === whbarLc && b === usdcLc)) {
      continue;
    }

    let x: string | null = null;
    if (a === usdcLc && b !== whbarLc) x = b;
    else if (b === usdcLc && a !== whbarLc) x = a;
    else continue;

    if (x === usdcLc || x === whbarLc) continue;

    const L2 = liquidityBetween(x, whbarLc);
    if (L2 === undefined) continue;

    const score = L1 * L2;

    rows.push({
      x: ethers.getAddress(x),
      L1,
      L2,
      score,
      inWhitelist: whitelist.has(x.toLowerCase()),
    });
  }

  rows.sort((p, q) => (q.score > p.score ? 1 : q.score < p.score ? -1 : 0));

  const top = rows.slice(0, 25);
  if (rows.length === 0) {
    console.log(
      "Không tìm thấy cặp USDC–X và X–WHBAR trong phạm vi đã index. Tăng SCAN_MAX_PAIRS hoặc bỏ giới hạn để quét full factory.\n",
    );
  } else {
    console.log("Top candidates (by reserve product × reserve product, higher = deeper liquidity):\n");
    for (let i = 0; i < top.length; i++) {
      const r = top[i]!;
      let sym = "";
      try {
        const c = new ethers.Contract(r.x, ERC20_ABI, provider);
        sym = (await withRetry(() => c.symbol.staticCall() as Promise<string>, rpcRetries)) as string;
      } catch {
        sym = "?";
      }
      const wl = r.inWhitelist ? " [whitelist]" : "";
      console.log(
        `${i + 1}. ${r.x}  symbol=${sym}${wl}  score=${r.score.toString(16).slice(0, 24)}… (L_usdc×L_x·L_x×L_whbar)`,
      );
    }
    console.log("");
  }

  console.log("\n--- Whitelist (reference) ---");
  for (const t of BRIDGE_WHITELIST_MAINNET) {
    console.log(`  ${t.symbol}: ${t.mainnetEvmAddress ?? "(chưa set)"} ${t.entityId ?? ""}`);
  }

  console.log(
    "\nGợi ý: chọn X có score cao + nằm trong whitelist; đặt DIAGNOSE_BRIDGE_TOKEN=0x… hoặc dùng trong UI.",
  );
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
