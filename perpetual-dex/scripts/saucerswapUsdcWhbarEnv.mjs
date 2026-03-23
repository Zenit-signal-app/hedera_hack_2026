#!/usr/bin/env node
/**
 * Lấy pool **USDC ↔ cạnh HBAR** (WHBAR / `HBAR` trên API V2 / `HBAR.ℏ` trên V1) từ **SaucerSwap REST API**
 * (off-chain, nhanh), xếp hạng theo thanh khoản,
 * map entity Hedera → địa chỉ EVM long-zero, sinh gợi ý path V1 (`address[]`) + V2 CLMM (`packed path` hex).
 *
 * Mặc định: **chỉ off-chain** — không gọi RPC (tránh Hashio/JSON-RPC hay timeout).
 * Tuỳ chọn: `--validate-onchain` gọi QuoterV2 + Router V1 **một lần** để kiểm tra; nếu lỗi → vẫn in kết quả off-chain.
 *
 * @see https://docs.saucerswap.finance/v/developer/rest-api/pools-v1/pools-full
 *
 * Chạy:
 *   node scripts/saucerswapUsdcWhbarEnv.mjs
 *   node scripts/saucerswapUsdcWhbarEnv.mjs --network testnet
 *   HEDERA_MAINNET_RPC_URL=https://... node scripts/saucerswapUsdcWhbarEnv.mjs --validate-onchain
 *
 * Ghi file:
 *   node scripts/saucerswapUsdcWhbarEnv.mjs > frontend/.env.saucerswap-usdc-whbar.snippet
 */

import process from "node:process";

const DEFAULT_API_KEY = "875e1017-87b8-4b12-8301-6aa1f1aa073b"; // demo key — rate limited (docs SaucerSwap)

const ENTITY_ROUTER_V1 = 3045981;
const ENTITY_QUOTER_V2 = 3949424;

function parseArgs(argv) {
  const out = { network: "mainnet", validateOnchain: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--network" && argv[i + 1]) {
      out.network = argv[++i];
    } else if (a === "--validate-onchain") {
      out.validateOnchain = true;
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    }
  }
  return out;
}

function apiBase(network) {
  if (network === "testnet") return "https://test-api.saucerswap.finance";
  return "https://api.saucerswap.finance";
}

/** `0.0.456858` → `0x` + 40 hex (long-zero) */
function entityIdToEvmAddress(entityId) {
  const parts = String(entityId).trim().split(".");
  const num = parts[parts.length - 1];
  const n = BigInt(num);
  const hex = n.toString(16).padStart(40, "0");
  return `0x${hex}`;
}

function isUsdcSymbol(sym) {
  const s = String(sym || "").trim();
  return s === "USDC" || /^USDC[\[(]/i.test(s) || /^USDC$/i.test(s);
}

/**
 * Cạnh “HBAR” trên SaucerSwap API không thống nhất:
 * - V2 CLMM: thường `symbol: "HBAR"` nhưng `id` = `0.0.1456986` (WHBAR ERC-20 facade).
 * - V1 AMM: thường `HBAR.ℏ` (facade khác) — khác entity với WHBAR env.
 */
function isHbarSideSymbol(sym) {
  const s = String(sym || "").trim();
  const u = s.toUpperCase();
  if (u === "WHBAR" || u === "WBHBAR") return true;
  if (u === "HBAR") return true;
  if (s === "HBAR.ℏ" || s.startsWith("HBAR.")) return true;
  return false;
}

function sqrtBigint(n) {
  if (n < 0n) throw new Error("sqrt negative");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (n / x + x) / 2n;
  }
  return x;
}

/** Điểm V1: sqrt(reserveA * reserveB) — ổn định hơn product thuần */
function v1LiquidityScore(pool) {
  try {
    const a = BigInt(pool.tokenReserveA);
    const b = BigInt(pool.tokenReserveB);
    return sqrtBigint(a * b);
  } catch {
    return 0n;
  }
}

function v2LiquidityScore(pool) {
  try {
    return BigInt(pool.liquidity || "0");
  } catch {
    return 0n;
  }
}

function isUsdcHbarPool(tokenA, tokenB) {
  const sa = tokenA?.symbol;
  const sb = tokenB?.symbol;
  return (
    (isUsdcSymbol(sa) && isHbarSideSymbol(sb)) ||
    (isUsdcSymbol(sb) && isHbarSideSymbol(sa))
  );
}

async function fetchJson(url, apiKey) {
  const res = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status} ${url}: ${t.slice(0, 400)}`);
  }
  return res.json();
}

async function loadOffchain({ network, apiKey }) {
  const base = apiBase(network);
  const [v1, v2] = await Promise.all([
    fetchJson(`${base}/pools/full`, apiKey),
    fetchJson(`${base}/v2/pools/full`, apiKey),
  ]);
  const v1Pools = Array.isArray(v1) ? v1 : [];
  const v2Pools = Array.isArray(v2) ? v2 : [];

  const v1Uw = v1Pools.filter((p) => p.tokenA && p.tokenB && isUsdcHbarPool(p.tokenA, p.tokenB));
  const v2Uw = v2Pools.filter((p) => p.tokenA && p.tokenB && isUsdcHbarPool(p.tokenA, p.tokenB));

  v1Uw.sort((a, b) => {
    const da = v1LiquidityScore(a);
    const db = v1LiquidityScore(b);
    if (db > da) return 1;
    if (db < da) return -1;
    return 0;
  });
  v2Uw.sort((a, b) => {
    const da = v2LiquidityScore(a);
    const db = v2LiquidityScore(b);
    if (db > da) return 1;
    if (db < da) return -1;
    return 0;
  });

  return { v1Uw, v2Uw, base };
}

function tokenUsdcFromPair(pool) {
  const { tokenA, tokenB } = pool;
  if (isUsdcSymbol(tokenA.symbol) && !isUsdcSymbol(tokenB.symbol)) return tokenA;
  if (isUsdcSymbol(tokenB.symbol) && !isUsdcSymbol(tokenA.symbol)) return tokenB;
  return null;
}

/** Cạnh không phải USDC (HBAR / WHBAR / HBAR.ℏ …). */
function tokenHbarSideFromPair(pool) {
  const { tokenA, tokenB } = pool;
  if (isUsdcSymbol(tokenA.symbol) && isHbarSideSymbol(tokenB.symbol)) return tokenB;
  if (isUsdcSymbol(tokenB.symbol) && isHbarSideSymbol(tokenA.symbol)) return tokenA;
  return null;
}

function buildV1PathAddresses(pool, direction /* 'usdc_to_hbar' | 'hbar_to_usdc' */) {
  const usdc = tokenUsdcFromPair(pool);
  const hbarSide = tokenHbarSideFromPair(pool);
  if (!usdc || !hbarSide) return null;
  const aUsdc = entityIdToEvmAddress(usdc.id);
  const aH = entityIdToEvmAddress(hbarSide.id);
  if (direction === "usdc_to_hbar") return [aUsdc, aH];
  return [aH, aUsdc];
}

async function validateOnchain({ rpcUrl, v1PathUsdcToHbar, v2PackedHex }) {
  const { Contract, JsonRpcProvider } = await import("ethers");

  const provider = new JsonRpcProvider(rpcUrl);
  const routerV1 = entityIdToEvmAddress(`0.0.${ENTITY_ROUTER_V1}`);
  const quoterV2 = entityIdToEvmAddress(`0.0.${ENTITY_QUOTER_V2}`);

  const ROUTER_ABI = [
    "function getAmountsOut(uint256 amountIn, address[] calldata path) view returns (uint256[] memory amounts)",
  ];
  const QUOTER_ABI = [
    "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
  ];

  const lines = [];
  const amountInUsdc = 1_000_000n; // 1 USDC @ 6 decimals

  if (v1PathUsdcToHbar?.length >= 2) {
    try {
      const r = new Contract(routerV1, ROUTER_ABI, provider);
      const amounts = await r.getAmountsOut(amountInUsdc, v1PathUsdcToHbar);
      const out = amounts[amounts.length - 1];
      lines.push(`# On-chain OK: V1 getAmountsOut 1 USDC → ${out.toString()} (smallest unit WHBAR path)`);
    } catch (e) {
      lines.push(`# On-chain V1 failed (dùng off-chain): ${e?.message || e}`);
    }
  }

  if (v2PackedHex && typeof v2PackedHex === "string" && v2PackedHex.startsWith("0x") && v2PackedHex.length > 2) {
    try {
      const q = new Contract(quoterV2, QUOTER_ABI, provider);
      const result = await q.quoteExactInput.staticCall(v2PackedHex, amountInUsdc);
      const out = result?.amountOut ?? result?.[0];
      lines.push(`# On-chain OK: V2 Quoter quoteExactInput 1 USDC → ${out.toString()} (smallest unit)`);
    } catch (e) {
      lines.push(`# On-chain V2 Quoter failed (dùng off-chain): ${e?.message || e}`);
    }
  }

  return lines;
}

function buildV2PackedPath(tokenInEvm, tokenOutEvm, feeUint24) {
  // dynamic import sync alternative: use ethers in caller
  return import("ethers").then(({ solidityPacked }) =>
    solidityPacked(
      ["address", "uint24", "address"],
      [tokenInEvm, Number(feeUint24), tokenOutEvm],
    ),
  );
}

function printHelp() {
  console.log(`
saucerswapUsdcWhbarEnv.mjs — USDC/WHBAR pools từ REST API + snippet .env

Options:
  --network mainnet|testnet   (default: mainnet)
  --validate-onchain          gọi RPC (cần HEDERA_MAINNET_RPC_URL hoặc HEDERA_TESTNET_RPC_URL)

Env:
  SAUCERSWAP_API_KEY          (default: demo key trong docs — nên xin key production)
  HEDERA_MAINNET_RPC_URL      (mainnet on-chain validate)
  HEDERA_TESTNET_RPC_URL      (testnet on-chain validate)
`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const apiKey = process.env.SAUCERSWAP_API_KEY?.trim() || DEFAULT_API_KEY;
  const { v1Uw, v2Uw, base } = await loadOffchain({ network: args.network, apiKey });

  const bestV1 = v1Uw[0];
  const bestV2 = v2Uw[0];

  let usdcEvm = entityIdToEvmAddress("0.0.456858");
  /** Ưu tiên entity từ pool V2 (USDC/HBAR) — thường trùng WHBAR 0.0.1456986 */
  let whbarEvm = entityIdToEvmAddress("0.0.1456986");
  if (bestV1 || bestV2) {
    const ref = bestV2 || bestV1;
    const u = tokenUsdcFromPair(ref);
    const h = tokenHbarSideFromPair(ref);
    if (u?.id) usdcEvm = entityIdToEvmAddress(u.id);
    if (h?.id) whbarEvm = entityIdToEvmAddress(h.id);
  }

  const v1PathUsdcToHbar = bestV1 ? buildV1PathAddresses(bestV1, "usdc_to_hbar") : null;
  const v1PathHbarToUsdc = bestV1 ? buildV1PathAddresses(bestV1, "hbar_to_usdc") : null;

  let v2PackedUsdcToHbar = null;
  let v2PackedHbarToUsdc = null;
  if (bestV2) {
    const fee = Number(bestV2.fee);
    const usdc = tokenUsdcFromPair(bestV2);
    const hbarSide = tokenHbarSideFromPair(bestV2);
    if (usdc && hbarSide) {
      const a = entityIdToEvmAddress(usdc.id);
      const b = entityIdToEvmAddress(hbarSide.id);
      v2PackedUsdcToHbar = await buildV2PackedPath(a, b, fee);
      v2PackedHbarToUsdc = await buildV2PackedPath(b, a, fee);
    }
  }

  const lines = [];
  lines.push(`# --- Snippet gợi ý (SaucerSwap ${args.network}, ${new Date().toISOString()}) ---`);
  lines.push(`# Nguồn pool: ${base}/pools/full + /v2/pools/full (off-chain)`);
  lines.push(`# Dán vào frontend/.env — kiểm tra lại địa chỉ trên HashScan trước production`);
  lines.push(``);
  lines.push(`VITE_AGGREGATOR_TOKEN_USDC_MAINNET=${usdcEvm}`);
  lines.push(`VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET=${whbarEvm}`);
  lines.push(``);
  lines.push(`# --- Pool V1 tốt nhất (theo sqrt(reserveA*reserveB)) ---`);
  if (bestV1) {
    const hs = tokenHbarSideFromPair(bestV1);
    lines.push(
      `# contractId=${bestV1.contractId} score≈${v1LiquidityScore(bestV1).toString()} hbarSide=${hs?.symbol} id=${hs?.id}`,
    );
    lines.push(`# ZENIT_V1_PATH_USDC_TO_HBAR_SIDE=${(v1PathUsdcToHbar || []).join(",")}`);
    lines.push(`# ZENIT_V1_PATH_HBAR_SIDE_TO_USDC=${(v1PathHbarToUsdc || []).join(",")}`);
  } else {
    lines.push(`# (không tìm thấy pool V1 USDC + cạnh HBAR trong API)`);
  }
  lines.push(``);
  lines.push(`# --- Pool V2 CLMM tốt nhất (theo liquidity) ---`);
  if (bestV2) {
    const hs = tokenHbarSideFromPair(bestV2);
    lines.push(
      `# contractId=${bestV2.contractId} feeBps=${bestV2.fee} liquidity=${bestV2.liquidity} hbarSide=${hs?.symbol} id=${hs?.id}`,
    );
    lines.push(`# ZENIT_V2_PACKED_PATH_USDC_TO_HBAR=${v2PackedUsdcToHbar || ""}`);
    lines.push(`# ZENIT_V2_PACKED_PATH_HBAR_TO_USDC=${v2PackedHbarToUsdc || ""}`);
    lines.push(`# (packed path = tokenIn + fee uint24 + tokenOut — dùng QuoterV2 / SwapRouter exactInput)`);
  } else {
    lines.push(`# (không tìm thấy pool V2 USDC + HBAR trong API)`);
  }
  lines.push(``);
  lines.push(`# Top 3 V1 (tham khảo):`);
  for (let i = 0; i < Math.min(3, v1Uw.length); i++) {
    const p = v1Uw[i];
    const sa = p.tokenA?.symbol ?? "?";
    const sb = p.tokenB?.symbol ?? "?";
    lines.push(
      `#  ${i + 1}. ${p.contractId} [${sa}/${sb}] score=${v1LiquidityScore(p).toString()} resA=${p.tokenReserveA} resB=${p.tokenReserveB}`,
    );
  }
  lines.push(`# Top 3 V2 (tham khảo):`);
  for (let i = 0; i < Math.min(3, v2Uw.length); i++) {
    const p = v2Uw[i];
    const sa = p.tokenA?.symbol ?? "?";
    const sb = p.tokenB?.symbol ?? "?";
    lines.push(`#  ${i + 1}. ${p.contractId} [${sa}/${sb}] fee=${p.fee} liq=${p.liquidity}`);
  }

  if (args.validateOnchain) {
    const rpcKey = args.network === "testnet" ? "HEDERA_TESTNET_RPC_URL" : "HEDERA_MAINNET_RPC_URL";
    const rpcUrl = process.env[rpcKey]?.trim();
    lines.push(``);
    if (!rpcUrl) {
      lines.push(`# On-chain validate bỏ qua: đặt ${rpcKey}`);
    } else {
      const onchainLines = await validateOnchain({
        rpcUrl,
        v1PathUsdcToHbar,
        v2PackedHex: v2PackedUsdcToHbar,
      });
      lines.push(...onchainLines);
    }
  } else {
    lines.push(``);
    lines.push(
      `# On-chain: không gọi RPC (mặc định nhanh). Thêm --validate-onchain + ${args.network === "testnet" ? "HEDERA_TESTNET_RPC_URL" : "HEDERA_MAINNET_RPC_URL"} để kiểm tra Quoter/Router.`,
    );
  }

  console.log(lines.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
