/**
 * Aggregator quote: **SaucerSwap V1 `getAmountsOut`** on mainnet when token addresses resolve;
 * fallback **mock** for demo / missing pools.
 */

import type { AggregatorNetwork } from "@/config/aggregator";

export type HopPreview = {
  step: number;
  tokenIn: string;
  tokenOut: string;
  venueLabel: string;
  /** Human-readable rate hint (mock). */
  rateHint: string;
};

/** Một route ứng viên (đã sort theo output giảm dần khi `rank` = 1 là tốt nhất). */
export type AggregatorRouteQuoteRow = {
  rank: number;
  kind: "v1" | "v2_clmm";
  pathTokenAddresses: `0x${string}`[];
  expectedOutWei: bigint;
  expectedOutHuman: string;
  /** Route dùng cho `encodedPath` / swap hiện tại. */
  isPrimary: boolean;
};

export type AggregatorQuoteResult = {
  network: AggregatorNetwork;
  tokenIn: string;
  tokenOut: string;
  amountInHuman: string;
  /** Expected output (human, token out decimals). */
  expectedOutHuman: string;
  /** After slippage. */
  minOutHuman: string;
  /** Price impact; router quotes use 0 (reserves not simulated in UI). */
  priceImpactPercent: number;
  hops: HopPreview[];
  /** If true, UI suggests splitting (mock heuristic). */
  suggestSplit: boolean;
  notes: string[];
  /** `router_v2` = on-chain route quote; `mock` = illustrative only. */
  quoteSource?: "mock" | "router_v2";
  /** `v1_amm` = UniswapV2LikeAdapter + `abi.encode(address[])`; `v2_clmm` = UniswapV3SwapRouterAdapter + `abi.encode(bytes path)`. */
  swapExecution?: "v1_amm" | "v2_clmm";
  routerAddress?: string;
  /** Khi `swapExecution === 'v2_clmm'` — giá tham chiếu V1 (AMM) để so sánh. */
  v1AmmFallback?: { expectedOutHuman: string; expectedOutWei: bigint };
  /** `abi.encode(address[])` (V1) hoặc `abi.encode(bytes)` packed path (V2). */
  encodedPath?: `0x${string}`;
  /** Present when `quoteSource === 'router_v2'` — dùng làm fallback minOut nếu Exchange.quote lỗi. */
  expectedOutWei?: bigint;
  /** Decimals của token out (đọc on-chain lúc quote) — tránh format sai khi UI wagmi chưa kịp `decimals()`. */
  outDecimals?: number;
  /** Decimals token in (đọc on-chain lúc quote) — WHBAR/HBAR thường 8, không phải 18. */
  inDecimals?: number;
  /**
   * Chuỗi địa chỉ token theo route thực tế (đầu → cuối) — dùng UI hiển thị hop rõ (ký hiệu + fallback rút gọn).
   * Có khi `quoteSource === 'router_v2'` và router trả được path.
   */
  pathTokenAddresses?: `0x${string}`[];
  /**
   * Quote tối ưu khi **chia** thanh khoản qua 2 path khác nhau (cùng router) — thường tốt hơn 1 path nếu pool nông / trượt giá lớn.
   * Thực thi `Exchange.swap` hiện chỉ 1 path / 1 tx; đây là thông tin để so sánh & roadmap.
   */
  multiRouteSplit?: {
    expectedOutWei: bigint;
    expectedOutHuman: string;
    /** Phần amountIn cho path A (basis points 1–9999). */
    splitBpsToPathA: number;
    pathA: `0x${string}`[];
    pathB: `0x${string}`[];
    /** Cải thiện so với route 1-path tốt nhất (basis points). */
    improvementBps: number;
  };
  /**
   * Chia `amountIn` giữa **SaucerSwap V1** (`address[]`) và **V2 CLMM** (cùng `pathPacked` đã quote).
   * So sánh với `max(quote V1 full, quote V2 full)` — thực thi on-chain vẫn 1 tx / 1 venue (Zenit chưa gom 2 venue).
   */
  venueSplitV1V2?: {
    expectedOutWei: bigint;
    expectedOutHuman: string;
    /** Phần amountIn cho V1 (basis points; phần còn lại cho V2). */
    splitBpsToV1: number;
    v1Path: `0x${string}`[];
    v2PathPacked: `0x${string}`;
    v2PathTokens: `0x${string}`[];
    v2FeeTiers: number[];
    /** So với `max(V1 full, V2 full)` cùng `amountIn`. */
    improvementBpsVsBestSingle: number;
  };
  /** Gợi ý: routing native HTS (ngoài EVM) như app SaucerSwap — chưa có trong Zenit. */
  htsRoutingNote?: string;
  /**
   * Tham chiếu **SaucerSwap V2** (QuoterV2, pool concentrated) — gần với app saucerswap.finance.
   * Không dùng làm minOut / swap path: Zenit vẫn thực thi qua **V1** `UniswapV2LikeAdapter` trừ khi có adapter V2.
   */
  saucerswapV2Reference?: {
    expectedOutWei: bigint;
    expectedOutHuman: string;
    /** Phí pool (uint24) theo từng hop — khớp QuoterV2 `encodePacked`. */
    feeTiers: number[];
    /** direct | via_whbar | via_usdc | via_whbar_usdc | … */
    pathKind: string;
    /** So với quote V1 ở trên (bps). Dương = V2 cho ra nhiều token out hơn. */
    premiumVsV1Bps: number;
  };
  /** Khi Quoter V2 không trả được giá — thông báo ngắn (RPC / pool / cấu hình). */
  saucerswapV2Error?: string;
  /**
   * Tất cả route đã quote (V1 `getAmountsOut` + tuỳ chọn V2 CLMM), **sort theo `expectedOutWei` giảm dần**;
   * `rank === 1` = output cao nhất. Chỉ khi `quoteSource === 'router_v2'` và có đủ path.
   */
  rankedRoutes?: AggregatorRouteQuoteRow[];
  /**
   * `true`: đã có route + giá chính; đang tính thêm multi-route / hybrid split (RPC phụ).
   * UI có thể hiển thị danh sách route ngay, badge “đang tinh chỉnh”.
   */
  quoteRefinementPending?: boolean;
};

function parsePositiveFloat(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Mock quote: builds a 1- or 2-hop path and scales output deterministically from amount.
 * Replace with reserve math / quoter contracts in P1.
 */
export function getMockAggregatorQuote(params: {
  network: AggregatorNetwork;
  tokenIn: string;
  tokenOut: string;
  amountInHuman: string;
  slippageBps: number;
}): AggregatorQuoteResult | { error: string } {
  const { network, tokenIn, tokenOut, amountInHuman, slippageBps } = params;
  const tin = tokenIn.trim().toUpperCase();
  const tout = tokenOut.trim().toUpperCase();
  if (!tin || !tout) return { error: "Enter token symbols." };
  if (tin === tout) return { error: "From and to tokens must differ." };

  const amt = parsePositiveFloat(amountInHuman);
  if (amt == null) return { error: "Enter a valid amount." };

  const useTwoHop = tin !== "HBAR" && tout !== "HBAR" && tin !== "WHBAR" && tout !== "WHBAR";
  const mid = "USDC";

  const baseRate = 0.997 + (network === "mainnet" ? 0 : 0.001); // mock
  const expectedOut = amt * baseRate * (useTwoHop ? 0.998 : 1);
  const slip = Math.min(Math.max(slippageBps, 1), 5000) / 10_000;
  const minOut = expectedOut * (1 - slip);
  const priceImpact = Math.min(2.5, 0.08 + amt * 0.00002 + (useTwoHop ? 0.15 : 0));

  const hops: HopPreview[] = useTwoHop
    ? [
        { step: 1, tokenIn: tin, tokenOut: mid, venueLabel: "Zenit route · hop 1 (mock)", rateHint: "~1 : 0.998" },
        { step: 2, tokenIn: mid, tokenOut: tout, venueLabel: "Zenit route · hop 2 (mock)", rateHint: "~1 : 1.002" },
      ]
    : [{ step: 1, tokenIn: tin, tokenOut: tout, venueLabel: "Zenit route · direct (mock)", rateHint: "~1 : 0.999" }];

  const suggestSplit = amt > 10_000;

  return {
    network,
    tokenIn: tin,
    tokenOut: tout,
    amountInHuman: amt.toLocaleString("en-US", { maximumFractionDigits: 6 }),
    expectedOutHuman: expectedOut.toLocaleString("en-US", { maximumFractionDigits: 6 }),
    minOutHuman: minOut.toLocaleString("en-US", { maximumFractionDigits: 6 }),
    priceImpactPercent: Number(priceImpact.toFixed(2)),
    hops,
    suggestSplit,
    quoteSource: "mock",
    notes: [
      "Mock quote — illustrative only (set token env + pools on SaucerSwap for real route).",
      useTwoHop ? "Multi-hop route (illustrative)." : "Single-hop route (illustrative).",
      suggestSplit ? "Large size: consider splitting into smaller chunks (future feature)." : "",
    ].filter(Boolean),
  };
}

/**
 * Prefer **real** V2-style router quote (SaucerSwap V1 mainnet by default) when addresses resolve; else mock.
 */
export async function getAggregatorQuoteUnified(params: {
  network: AggregatorNetwork;
  tokenIn: string;
  tokenOut: string;
  amountInHuman: string;
  slippageBps: number;
  resolvedIn?: `0x${string}`;
  resolvedOut?: `0x${string}`;
  whbar?: `0x${string}`;
  usdc?: `0x${string}`;
  /** Gọi khi đã có `rankedRoutes` + output chính — trước bước split tốn RPC. */
  onQuotePartial?: (q: AggregatorQuoteResult) => void;
}): Promise<AggregatorQuoteResult | { error: string }> {
  const { resolvedIn, resolvedOut, whbar, usdc, onQuotePartial, ...rest } = params;
  if (resolvedIn && resolvedOut) {
    const { tryV2RouterRealQuote } = await import("./v2RouterQuote");
    const real = await tryV2RouterRealQuote({
      network: rest.network,
      tokenInSymbol: rest.tokenIn,
      tokenOutSymbol: rest.tokenOut,
      tokenIn: resolvedIn,
      tokenOut: resolvedOut,
      whbar,
      usdc,
      amountInHuman: rest.amountInHuman,
      slippageBps: rest.slippageBps,
      onPartial: onQuotePartial,
    });
    if (real) return real.result;

    const allowMock =
      import.meta.env.VITE_AGGREGATOR_ALLOW_MOCK_ON_ROUTER_FAIL === "1" ||
      import.meta.env.VITE_AGGREGATOR_ALLOW_MOCK_ON_ROUTER_FAIL === "true";
    if (allowMock) {
      return getMockAggregatorQuote({
        network: rest.network,
        tokenIn: rest.tokenIn,
        tokenOut: rest.tokenOut,
        amountInHuman: rest.amountInHuman,
        slippageBps: rest.slippageBps,
      });
    }
    return {
      error:
        "Could not get a price from the SaucerSwap router (getAmountsOut / Quoter failed). Check: " +
        "(1) `VITE_AGGREGATOR_TOKEN_*_MAINNET` are correct ERC-20 facade addresses on Hedera mainnet, " +
        "(2) `VITE_HEDERA_MAINNET_RPC_URL` or network is stable, " +
        "(3) the pair has a pool on the DEX. " +
        "You can temporarily enable mock quotes: `VITE_AGGREGATOR_ALLOW_MOCK_ON_ROUTER_FAIL=1` (demo only).",
    };
  }
  return getMockAggregatorQuote({
    network: rest.network,
    tokenIn: rest.tokenIn,
    tokenOut: rest.tokenOut,
    amountInHuman: rest.amountInHuman,
    slippageBps: rest.slippageBps,
  });
}
