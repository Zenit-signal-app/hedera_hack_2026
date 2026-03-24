/**
 * Path Finder cho SaucerSwap (aggregate): sinh các dạng route tĩnh (WHBAR/USDC + SAUCE/XSAUCE/HBAR.ℏ…)
 * để Quoter V2 / V1 router thử đủ multi-hop (≤ {@link AGGREGATOR_MAX_HOPS}), gần với app chính thức.
 */
import { getAddress } from "ethers";

import type { AggregatorNetwork } from "@/config/aggregator";
import { AGGREGATOR_MAX_HOPS } from "@/config/aggregator";
import { BRIDGE_WHITELIST_MAINNET } from "@shared/constants/bridges";

/** Số token tối đa trên path = số hop + 1 */
const MAX_PATH_LEN = AGGREGATOR_MAX_HOPS + 1;

function normAddr(a: string): string {
  return getAddress(a).toLowerCase();
}

/** Các token “cầu” bổ sung trên mainnet (không trùng WHBAR/USDC từ env). */
export function getMainnetExtraBridgeAddresses(): `0x${string}`[] {
  const allow = new Set(["SAUCE", "XSAUCE", "HBAR.ℏ", "USDT"]);
  const out: `0x${string}`[] = [];
  for (const t of BRIDGE_WHITELIST_MAINNET) {
    if (!t.mainnetEvmAddress || !allow.has(t.symbol)) continue;
    out.push(getAddress(t.mainnetEvmAddress) as `0x${string}`);
  }
  return out;
}

function getSauceXsaucePair(): { sauce: `0x${string}` | null; xsauce: `0x${string}` | null } {
  let sauce: `0x${string}` | null = null;
  let xsauce: `0x${string}` | null = null;
  for (const t of BRIDGE_WHITELIST_MAINNET) {
    if (t.symbol === "SAUCE" && t.mainnetEvmAddress) sauce = getAddress(t.mainnetEvmAddress) as `0x${string}`;
    if (t.symbol === "XSAUCE" && t.mainnetEvmAddress) xsauce = getAddress(t.mainnetEvmAddress) as `0x${string}`;
  }
  return { sauce, xsauce };
}

function pushPath(acc: `0x${string}`[][], tokens: `0x${string}`[]) {
  if (tokens.length < 2 || tokens.length > MAX_PATH_LEN) return;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (normAddr(tokens[i]) === normAddr(tokens[i + 1])) return;
  }
  acc.push(tokens.map((t) => getAddress(t) as `0x${string}`));
}

/**
 * Danh sách path (mảng địa chỉ token) cho cả V1 `getAmountsOut` và V2 packed path.
 * Ưu tiên path ngắn trước (sort theo độ dài).
 */
export function buildSaucerAggregatorPathShapes(params: {
  network: AggregatorNetwork;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  whbar?: `0x${string}`;
  usdc?: `0x${string}`;
}): `0x${string}`[][] {
  const { tokenIn, tokenOut, whbar, usdc, network } = params;
  const tin = tokenIn.toLowerCase();
  const tout = tokenOut.toLowerCase();
  const raw: `0x${string}`[][] = [];

  const wLower = whbar ? normAddr(whbar) : undefined;

  /** 1) Base — trùng logic cũ `buildPathCandidates` / `buildStaticV2PathShapes`. */
  pushPath(raw, [tokenIn, tokenOut]);

  if (whbar && usdc) {
    const w = whbar.toLowerCase();
    const u = usdc.toLowerCase();
    if (tin !== w && tout !== w) pushPath(raw, [tokenIn, whbar, tokenOut]);
    if (tin !== u && tout !== u) pushPath(raw, [tokenIn, usdc, tokenOut]);
    if (tin !== w && tout !== u && tin !== u && tout !== w) {
      pushPath(raw, [tokenIn, whbar, usdc, tokenOut]);
      pushPath(raw, [tokenIn, usdc, whbar, tokenOut]);
    }
  } else if (whbar && tin !== whbar.toLowerCase() && tout !== whbar.toLowerCase()) {
    pushPath(raw, [tokenIn, whbar, tokenOut]);
  } else if (usdc && tin !== usdc.toLowerCase() && tout !== usdc.toLowerCase()) {
    pushPath(raw, [tokenIn, usdc, tokenOut]);
  }

  if (network !== "mainnet") {
    return dedupeAndSort(raw);
  }

  const bridges = getMainnetExtraBridgeAddresses();
  const { sauce, xsauce } = getSauceXsaucePair();

  const uLower = usdc ? normAddr(usdc) : undefined;

  for (const b of bridges) {
    const bl = b.toLowerCase();
    if (bl === tin || bl === tout) continue;
    if (wLower && bl === wLower) continue;
    if (uLower && bl === uLower) continue;

    pushPath(raw, [tokenIn, b, tokenOut]);

    if (whbar && bl !== wLower) {
      if (tin !== wLower && tout !== wLower) {
        pushPath(raw, [tokenIn, whbar, b, tokenOut]);
        pushPath(raw, [tokenIn, b, whbar, tokenOut]);
      }
    }
    if (usdc && bl !== uLower) {
      pushPath(raw, [tokenIn, usdc, b, tokenOut]);
      pushPath(raw, [tokenIn, b, usdc, tokenOut]);
    }
  }

  /** 2) Cặp SAUCE ↔ XSAUCE (route thường gặp trên SS). */
  if (sauce && xsauce) {
    const sl = sauce.toLowerCase();
    const xl = xsauce.toLowerCase();
    if (sl !== tin && sl !== tout && xl !== tin && xl !== tout) {
      pushPath(raw, [tokenIn, sauce, xsauce, tokenOut]);
      pushPath(raw, [tokenIn, xsauce, sauce, tokenOut]);
    }
  }

  /** 3) Khi bán WHBAR: thử qua facade HBAR.ℏ rồi bridge (một phần pool SS dùng facade). */
  const hbarFacMeta = BRIDGE_WHITELIST_MAINNET.find((t) => t.symbol === "HBAR.ℏ" && t.mainnetEvmAddress);
  const hbarFac = hbarFacMeta?.mainnetEvmAddress
    ? (getAddress(hbarFacMeta.mainnetEvmAddress) as `0x${string}`)
    : undefined;
  if (hbarFac && whbar && tin === wLower) {
    for (const b of bridges) {
      const bl = b.toLowerCase();
      if (bl === hbarFac.toLowerCase()) continue;
      if (bl === tin || bl === tout) continue;
      pushPath(raw, [tokenIn, hbarFac, b, tokenOut]);
    }
    pushPath(raw, [tokenIn, hbarFac, tokenOut]);
  }

  return dedupeAndSort(raw);
}

function dedupeAndSort(paths: `0x${string}`[][]): `0x${string}`[][] {
  const seen = new Set<string>();
  const out: `0x${string}`[][] = [];
  for (const p of paths) {
    const k = p.map((x) => x.toLowerCase()).join("|");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  out.sort((a, b) => a.length - b.length);
  return out;
}
