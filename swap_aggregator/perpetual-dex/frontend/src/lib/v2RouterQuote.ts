/**
 * Real V2-style route quotes via `getAmountsOut` (SaucerSwap V1 / Uniswap V2–style AMM on Hedera).
 * @see https://docs.saucerswap.finance/v/developer/saucerswap-v1 — `SaucerSwapV1RouterV3`
 */
import { AbiCoder, Contract, getAddress, type Provider } from "ethers";
import { formatUnits, parseUnits } from "ethers";

import type { AggregatorNetwork } from "@/config/aggregator";
import {
  AGGREGATOR_MAX_HOPS,
  getMirrorRestBase,
  getSaucerswapV1FactoryAddress,
  getSaucerswapV2QuoterAddress,
  getSaucerswapV2SwapRouterAddress,
  getV2RouterAddress,
} from "@/config/aggregator";
import { createHashioProvider } from "@/lib/aggregatorQuoteBridge";
import type { AggregatorQuoteResult, AggregatorRouteQuoteRow, HopPreview } from "@/lib/aggregatorQuote";
import { discoverViableUsdcWhbarBridges } from "@/lib/bridgeTokenDiscovery";
import {
  fetchPairAdjacencyFromMirror,
  findPathsBfs,
  loadCachedAdjacency,
  saveCachedAdjacency,
  type AdjacencyGraph,
} from "@/lib/mirrorPoolGraph";
import { buildSaucerAggregatorPathShapes } from "@/lib/saucerPathFinder";
import {
  quoteV2ExactInputForPackedPath,
  tryBestSaucerswapV2Quote,
  type SaucerV2QuoteAttempt,
  type SaucerV2QuoteBest,
} from "@/lib/saucerswapV2Quoter";
import { HTS_ROUTING_NOTE_SHORT } from "@/lib/htsRouting";

const ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
] as const;

/** BFS có thể trả rất nhiều path — giới hạn để quote V1 không gọi RPC hàng trăm lần. */
const MAX_BFS_PATHS_FOR_QUOTE = 12;
/** Gọi getAmountsOut song song theo lô (tránh vượt giới hạn RPC). */
const V1_GET_AMOUNTS_OUT_BATCH = 16;

/** Số path xếp hạng để thử split (giảm RPC). */
const TOP_PATHS_FOR_SPLIT = 3;
/** Lưới chia amountIn (bps) — thưa hơn trước để khớp mục tiêu ~6s UI. */
const SPLIT_WEIGHT_BPS_GRID = [2500, 4000, 5000, 6000, 7500] as const;

const ERC20_DECIMALS_ABI = ["function decimals() view returns (uint8)"] as const;

/** Số route tối đa gửi UI (đã sort output giảm dần). */
const MAX_RANKED_ROUTES_UI = 28;

function pathKeyTokens(p: readonly `0x${string}`[]): string {
  return p.map((x) => getAddress(x).toLowerCase()).join("|");
}

function buildRankedRoutesForUi(params: {
  rankedV1: { path: `0x${string}`[]; outWei: bigint }[];
  v2best: SaucerV2QuoteBest | null;
  useV2Primary: boolean;
  bestV1Path: `0x${string}`[];
  decimalsOut: number;
}): AggregatorRouteQuoteRow[] {
  type Cand = Omit<AggregatorRouteQuoteRow, "rank">;
  const raw: Cand[] = [];
  const seenV1 = new Set<string>();

  if (params.v2best && params.v2best.outWei > 0n) {
    raw.push({
      kind: "v2_clmm",
      pathTokenAddresses: [...params.v2best.pathTokens],
      expectedOutWei: params.v2best.outWei,
      expectedOutHuman: formatUnits(params.v2best.outWei, params.decimalsOut),
      isPrimary: params.useV2Primary,
    });
  }

  for (const rq of params.rankedV1) {
    const pk = `v1|${pathKeyTokens(rq.path)}`;
    if (seenV1.has(pk)) continue;
    seenV1.add(pk);
    raw.push({
      kind: "v1",
      pathTokenAddresses: [...rq.path],
      expectedOutWei: rq.outWei,
      expectedOutHuman: formatUnits(rq.outWei, params.decimalsOut),
      isPrimary: !params.useV2Primary && pathKeyTokens(rq.path) === pathKeyTokens(params.bestV1Path),
    });
  }

  raw.sort((a, b) => (a.expectedOutWei > b.expectedOutWei ? -1 : a.expectedOutWei < b.expectedOutWei ? 1 : 0));
  return raw.slice(0, MAX_RANKED_ROUTES_UI).map((r, i) => ({ ...r, rank: i + 1 }));
}

async function readDecimals(provider: Provider, token: string): Promise<number> {
  try {
    const c = new Contract(token, ERC20_DECIMALS_ABI, provider);
    const d = await c.decimals.staticCall();
    return Number(d);
  } catch {
    return 18;
  }
}

/** Tránh gọi `decimals()` trùng địa chỉ (nhiều hop / token lặp). */
async function readDecimalsCached(
  provider: Provider,
  cache: Map<string, number>,
  token: string,
): Promise<number> {
  const k = getAddress(token).toLowerCase();
  const hit = cache.get(k);
  if (hit != null) return hit;
  const d = await readDecimals(provider, token);
  cache.set(k, d);
  return d;
}

function mirrorMaxPagesFromEnv(): number {
  const raw = import.meta.env.VITE_AGGREGATOR_MIRROR_MAX_PAGES;
  const n = raw != null && String(raw).trim() !== "" ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 60) return Math.floor(n);
  return 6;
}

/** Mục tiêu: quote + route hiển thị trong ~6s (có thể chỉnh env). */
function quoteUiBudgetMs(): number {
  const raw = import.meta.env.VITE_AGGREGATOR_QUOTE_BUDGET_MS;
  const n = raw != null && String(raw).trim() !== "" ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 3000 && n <= 30000) return Math.floor(n);
  return 6000;
}

function mirrorFetchTimeoutMs(): number {
  const raw = import.meta.env.VITE_AGGREGATOR_MIRROR_MAX_WAIT_MS;
  const n = raw != null && String(raw).trim() !== "" ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 600 && n <= 15000) return Math.floor(n);
  return 2800;
}

function v2QuoterTimeoutMs(): number {
  const raw = import.meta.env.VITE_AGGREGATOR_V2_QUOTE_MAX_WAIT_MS;
  const n = raw != null && String(raw).trim() !== "" ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1200 && n <= 15000) return Math.floor(n);
  return 3200;
}

/** Bỏ qua scan bridge USDC↔WHBAR sau bao nhiêu ms từ đầu quote (tiết kiệm RPC). */
const BRIDGE_DISCOVERY_SKIP_AFTER_MS = 3000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const id = setTimeout(() => resolve(fallback), ms);
    p.then((v) => {
      clearTimeout(id);
      resolve(v);
    }).catch(() => {
      clearTimeout(id);
      resolve(fallback);
    });
  });
}

async function buildMergedPathCandidates(params: {
  network: AggregatorNetwork;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  whbar: `0x${string}` | undefined;
  usdc: `0x${string}` | undefined;
  /** Bắt buộc để lọc bridge token (giao điện + getReserves). */
  provider?: Provider;
  /** `Date.now()` lúc bắt đầu quote — bỏ bridge discovery nếu đã trễ (ưu tiên <6s UI). */
  quoteT0?: number;
}): Promise<{
  paths: `0x${string}`[][];
  usedMirror: boolean;
  mirrorEdgeCount: number;
  /** Bridge token (địa chỉ) đủ thanh khoản USDC–X và WHBAR–X — từ Mirror + factory. */
  viableBridgeTokens: string[];
}> {
  const staticPaths = buildSaucerAggregatorPathShapes({
    network: params.network,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    whbar: params.whbar,
    usdc: params.usdc,
  });
  const factory = getSaucerswapV1FactoryAddress(params.network);
  const mirrorBase = getMirrorRestBase(params.network);
  const cacheKey = params.network;

  let usedMirror = false;
  let mirrorEdgeCount = 0;
  let adj: AdjacencyGraph | null = loadCachedAdjacency(cacheKey);

  if ((!adj || adj.size === 0) && factory) {
    try {
      adj = await withTimeout(
        fetchPairAdjacencyFromMirror({
          mirrorBase,
          factoryIdOrAddress: factory,
          maxPages: mirrorMaxPagesFromEnv(),
        }),
        mirrorFetchTimeoutMs(),
        new Map() as AdjacencyGraph,
      );
      mirrorEdgeCount = [...adj.values()].reduce((n, s) => n + s.size, 0) / 2;
      if (adj.size > 0) {
        saveCachedAdjacency(cacheKey, adj);
        usedMirror = true;
      }
    } catch {
      adj = new Map();
    }
  } else if (adj && adj.size > 0) {
    usedMirror = true;
    mirrorEdgeCount = [...adj.values()].reduce((n, s) => n + s.size, 0) / 2;
  }

  const graphPathsRaw =
    adj && adj.size > 0
      ? findPathsBfs(adj, params.tokenIn, params.tokenOut, AGGREGATOR_MAX_HOPS)
      : [];
  const graphPaths = graphPathsRaw.slice(0, MAX_BFS_PATHS_FOR_QUOTE);

  let viableBridgeTokens: string[] = [];

  const merged: `0x${string}`[][] = [];
  const seen = new Set<string>();
  const push = (p: `0x${string}`[]) => {
    const k = p.map((x) => x.toLowerCase()).join("|");
    if (seen.has(k)) return;
    seen.add(k);
    merged.push(p);
  };

  for (const p of graphPaths) push(p);

  const tin = params.tokenIn.toLowerCase();
  const tout = params.tokenOut.toLowerCase();
  const uc = params.usdc?.toLowerCase();
  const wc = params.whbar?.toLowerCase();

  const skipBridge =
    params.quoteT0 != null && Date.now() - params.quoteT0 >= BRIDGE_DISCOVERY_SKIP_AFTER_MS;

  if (adj && adj.size > 0 && factory && params.usdc && params.whbar && params.provider && !skipBridge) {
    try {
      const { bridges } = await discoverViableUsdcWhbarBridges({
        adj,
        usdc: params.usdc,
        whbar: params.whbar,
        factory,
        provider: params.provider,
      });
      viableBridgeTokens = bridges;
      for (const b of bridges) {
        const br = getAddress(b) as `0x${string}`;
        if (uc && wc && tin === uc && tout === wc) push([params.usdc, br, params.whbar]);
        if (uc && wc && tin === wc && tout === uc) push([params.whbar, br, params.usdc]);
      }
    } catch {
      /* RPC / factory — vẫn thử path tĩnh + BFS */
    }
  }

  for (const p of staticPaths) push(p);

  return { paths: merged, usedMirror, mirrorEdgeCount, viableBridgeTokens };
}

export type V2RealQuote = {
  result: AggregatorQuoteResult;
  path: `0x${string}`[];
  adapterData: `0x${string}`;
  expectedOutWei: bigint;
};

/**
 * Try SaucerSwap V1–style router quote on-chain. Returns `null` if router unset or all paths revert.
 */
export async function tryV2RouterRealQuote(params: {
  network: AggregatorNetwork;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  whbar?: `0x${string}`;
  usdc?: `0x${string}`;
  amountInHuman: string;
  slippageBps: number;
  /** Gọi ngay khi đã có danh sách route + giá chính — **trước** multi-route / hybrid split (nhiều RPC). */
  onPartial?: (result: AggregatorQuoteResult) => void;
}): Promise<V2RealQuote | null> {
  const routerAddr = getV2RouterAddress(params.network);
  if (!routerAddr) return null;

  const provider = createHashioProvider(params.network === "mainnet" ? "mainnet" : "testnet");
  const decCache = new Map<string, number>();
  /** Luôn đọc `decimals()` của token in — UI mặc định 18 sẽ sai với WHBAR (thường 8 trên Hedera). */
  const decimalsInResolved = await readDecimalsCached(provider, decCache, params.tokenIn);
  const amountInWei = parseUnits(params.amountInHuman || "0", decimalsInResolved);
  if (amountInWei <= 0n) return null;

  const quoteT0 = Date.now();
  const budgetMs = quoteUiBudgetMs();
  const overSplitBudget = () => Date.now() - quoteT0 >= budgetMs - 600;

  /** Song song: đồ thị Mirror (có **timeout**) + `decimals` token out. */
  const [{ paths, usedMirror, mirrorEdgeCount, viableBridgeTokens }, decimalsOut] = await Promise.all([
    buildMergedPathCandidates({
      network: params.network,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      whbar: params.whbar,
      usdc: params.usdc,
      provider,
      quoteT0,
    }),
    readDecimalsCached(provider, decCache, params.tokenOut),
  ]);
  const router = new Contract(routerAddr, ROUTER_ABI, provider);

  type PathQuote = { path: `0x${string}`[]; amounts: bigint[]; outWei: bigint };

  const rankV1Paths = async (): Promise<PathQuote[]> => {
    const ranked: PathQuote[] = [];
    for (let i = 0; i < paths.length; i += V1_GET_AMOUNTS_OUT_BATCH) {
      if (Date.now() - quoteT0 >= budgetMs - 1800) break;
      const chunk = paths.slice(i, i + V1_GET_AMOUNTS_OUT_BATCH);
      const batch = await Promise.all(
        chunk.map(async (path) => {
          try {
            const amounts = (await router.getAmountsOut.staticCall(amountInWei, path)) as bigint[];
            if (!amounts.length) return null;
            const outWei = amounts[amounts.length - 1];
            if (outWei === 0n) return null;
            return { path, amounts, outWei };
          } catch {
            return null;
          }
        }),
      );
      for (const b of batch) if (b) ranked.push(b);
    }
    ranked.sort((a, b) => (a.outWei > b.outWei ? -1 : a.outWei < b.outWei ? 1 : 0));
    return ranked;
  };

  /** V1 `getAmountsOut` và Quoter V2 độc lập — V2 có **timeout** để không vượt ngân sách UI (~6s). */
  const v2Configured = Boolean(getSaucerswapV2QuoterAddress(params.network));
  const v2TimeoutFallback: SaucerV2QuoteAttempt = {
    best: null,
    lastError: "Quoter V2: timeout (UI time budget).",
  };
  const [ranked, v2res] = await Promise.all([
    rankV1Paths(),
    v2Configured
      ? withTimeout(
          tryBestSaucerswapV2Quote({
            network: params.network,
            provider,
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amountInWei,
            whbar: params.whbar,
            usdc: params.usdc,
          }),
          v2QuoterTimeoutMs(),
          v2TimeoutFallback,
        )
      : Promise.resolve(null),
  ]);

  if (!ranked.length) return null;

  const best = ranked[0];

  const v1OutWei = best.amounts[best.amounts.length - 1];

  const v2best = v2res?.best ?? null;
  /** Chọn venue đơn theo **output**: chỉ CLMM khi V2 > V1 (cùng full `amountIn`). */
  const useV2Primary = Boolean(v2best && v2best.outWei > v1OutWei);

  let venueSplitV1V2: AggregatorQuoteResult["venueSplitV1V2"] = undefined;
  let multiRouteSplit: AggregatorQuoteResult["multiRouteSplit"] = undefined;

  const bps = BigInt(Math.min(Math.max(params.slippageBps, 1), 5000));

  let expectedOutWei: bigint;
  let minOutWei: bigint;
  let minOutHuman: string;
  let adapterData: `0x${string}`;
  let hops: HopPreview[];
  let saucerswapV2Reference: AggregatorQuoteResult["saucerswapV2Reference"];
  let saucerswapV2Error: AggregatorQuoteResult["saucerswapV2Error"];
  let swapExecution: AggregatorQuoteResult["swapExecution"];
  let v1AmmFallback: AggregatorQuoteResult["v1AmmFallback"];
  let routerDisplay: string;

  if (useV2Primary && v2best) {
    expectedOutWei = v2best.outWei;
    minOutWei = (expectedOutWei * (10000n - bps)) / 10000n;
    minOutHuman = formatUnits(minOutWei, decimalsOut);
    adapterData = AbiCoder.defaultAbiCoder().encode(["bytes"], [v2best.pathPacked]) as `0x${string}`;
    hops = buildV2HopPreviews(v2best);
    swapExecution = "v2_clmm";
    routerDisplay = getSaucerswapV2SwapRouterAddress(params.network) ?? "";
    v1AmmFallback = {
      expectedOutHuman: formatUnits(v1OutWei, decimalsOut),
      expectedOutWei: v1OutWei,
    };
    saucerswapV2Reference = undefined;
    saucerswapV2Error = undefined;
  } else {
    expectedOutWei = v1OutWei;
    minOutWei = (expectedOutWei * (10000n - bps)) / 10000n;
    minOutHuman = formatUnits(minOutWei, decimalsOut);
    adapterData = AbiCoder.defaultAbiCoder().encode(["address[]"], [best.path]) as `0x${string}`;
    swapExecution = "v1_amm";
    routerDisplay = routerAddr;
    v1AmmFallback = undefined;
    hops = [];
    {
      const hopCount = best.path.length - 1;
      const decPairs =
        hopCount > 0
          ? await Promise.all(
              Array.from({ length: hopCount }, (_, i) =>
                Promise.all([
                  readDecimalsCached(provider, decCache, best.path[i]),
                  readDecimalsCached(provider, decCache, best.path[i + 1]),
                ]),
              ),
            )
          : [];
      for (let i = 0; i < hopCount; i++) {
        const [dIn, dOut] = decPairs[i];
        const aIn = best.amounts[i];
        const aOut = best.amounts[i + 1];
        const hint = `~1 : ${formatUnits(aOut, dOut)} / ${formatUnits(aIn, dIn)} (wei-normalized)`;
        hops.push({
          step: i + 1,
          tokenIn: shortAddr(best.path[i]),
          tokenOut: shortAddr(best.path[i + 1]),
          venueLabel: `Router V1 · hop ${i + 1} (getAmountsOut) — min receive / Zenit swap`,
          rateHint: hint,
        });
      }
    }
    if (v2best && v2best.outWei > 0n && v1OutWei > 0n) {
      const diff = v2best.outWei - v1OutWei;
      const premiumVsV1Bps = Number((diff * 10000n) / v1OutWei);
      saucerswapV2Reference = {
        expectedOutWei: v2best.outWei,
        expectedOutHuman: formatUnits(v2best.outWei, decimalsOut),
        feeTiers: v2best.feeTiers,
        pathKind: v2best.pathKind,
        premiumVsV1Bps: Number.isFinite(premiumVsV1Bps) ? premiumVsV1Bps : 0,
      };
    } else {
      saucerswapV2Reference = undefined;
    }
    saucerswapV2Error = v2res?.lastError;
  }

  const tin = params.tokenInSymbol.trim().toUpperCase();
  const tout = params.tokenOutSymbol.trim().toUpperCase();

  const pathTokenAddresses: `0x${string}`[] | undefined =
    useV2Primary && v2best
      ? [...v2best.pathTokens]
      : best.path.length >= 2
        ? [...best.path]
        : undefined;

  const rankedRoutes = buildRankedRoutesForUi({
    rankedV1: ranked.map((r) => ({ path: r.path, outWei: r.outWei })),
    v2best,
    useV2Primary,
    bestV1Path: best.path,
    decimalsOut,
  });

  const buildNotes = (
    ms: AggregatorQuoteResult["multiRouteSplit"],
    vs: AggregatorQuoteResult["venueSplitV1V2"],
  ) =>
    [
      useV2Primary
        ? `Swap execution: SaucerSwap V2 CLMM (SwapRouter exactInput) — adapterData = abi.encode(bytes path). Requires Exchange.setAdapter(bytes32("saucerswap_v2"), UniswapV3SwapRouterAdapter, true). Single venue because V2 > V1 (output).`
        : "Route from SaucerSwap V1 Router (getAmountsOut) — largest amountOut among valid paths (V1 ≥ V2 or no CLMM pool).",
      useV2Primary && v1AmmFallback
        ? `V1 AMM comparison (not used for swap): ~${v1AmmFallback.expectedOutHuman} ${tout}.`
        : "",
      !useV2Primary && saucerswapV2Reference
        ? `V2 reference (QuoterV2, ${saucerswapV2Reference.pathKind}, fee ${saucerswapV2Reference.feeTiers.join("/")}): ~${saucerswapV2Reference.expectedOutHuman} ${tout}.`
        : "",
      saucerswapV2Error ? `Quoter V2: ${saucerswapV2Error}` : "",
      ms
        ? `Multi-route V1+V1 (split): ${ms.expectedOutHuman} ${tout} — +~${ms.improvementBps} bps vs single V1 path; single-tx execution still uses the best single route.`
        : "",
      vs
        ? `Hybrid V1+V2 (quote): ${vs.expectedOutHuman} ${tout} — +~${vs.improvementBpsVsBestSingle} bps vs max(single V1, single V2); two txs if executing both venues.`
        : "",
      usedMirror
        ? `V1 pool graph: edges from Mirror (PairCreated, 7-day window, ~${mirrorEdgeCount} undirected edges). Older pools may be missing — use an indexer for full history.`
        : "Mirror graph empty or disabled — using WHBAR/USDC bridge paths + direct tries only.",
      viableBridgeTokens.length
        ? `USDC↔WHBAR bridge (pool intersection + getReserves>0): ${viableBridgeTokens.map((a) => `${a.slice(0, 8)}…`).join(", ")}.`
        : "No USDC↔WHBAR bridge found via intersection + liquidity (missing provider or empty graph).",
      useV2Primary
        ? "Deploy UniswapV3SwapRouterAdapter (SwapRouter + QuoterV2) — see contracts/adapters/UniswapV3SwapRouterAdapter.sol."
        : "Swap V1: UniswapV2LikeAdapter + V1 router. Thin pools → high slippage even on valid paths.",
      "CEX prices (Binance, …) can differ from the DEX due to liquidity, fees, spread — multi-route only optimizes within the same on-chain router.",
    ].filter(Boolean);

  /** Hiển thị route + giá chính trước — split hybrid / multi-route tính sau (nhiều RPC). */
  params.onPartial?.({
    network: params.network,
    tokenIn: tin,
    tokenOut: tout,
    amountInHuman: params.amountInHuman,
    inDecimals: decimalsInResolved,
    outDecimals: decimalsOut,
    expectedOutHuman: formatUnits(expectedOutWei, decimalsOut),
    minOutHuman,
    priceImpactPercent: 0,
    hops,
    pathTokenAddresses,
    rankedRoutes,
    suggestSplit: false,
    multiRouteSplit: undefined,
    venueSplitV1V2: undefined,
    quoteRefinementPending: true,
    htsRoutingNote: HTS_ROUTING_NOTE_SHORT,
    swapExecution,
    v1AmmFallback,
    saucerswapV2Reference,
    saucerswapV2Error,
    notes: buildNotes(undefined, undefined),
    quoteSource: "router_v2",
    routerAddress: routerDisplay,
    encodedPath: adapterData,
    expectedOutWei,
  });

  /** Split V1 + V2 — bỏ qua nếu sắp hết ngân sách thời gian (ưu tiên hiển thị route đã có). */
  if (!overSplitBudget() && v2best && v2best.outWei > 0n && best.path.length >= 2) {
    const bestSingleVenue = v1OutWei > v2best.outWei ? v1OutWei : v2best.outWei;
    let bestCombo = 0n;
    let bestW = 5000;
    for (const wBps of SPLIT_WEIGHT_BPS_GRID) {
      if (Date.now() - quoteT0 >= budgetMs - 450) break;
      const inV1 = (amountInWei * BigInt(wBps)) / 10000n;
      const inV2 = amountInWei - inV1;
      if (inV1 === 0n || inV2 === 0n) continue;
      try {
        const outV1 = (
          (await router.getAmountsOut.staticCall(inV1, best.path)) as bigint[]
        )[best.path.length - 1];
        const outV2 = await quoteV2ExactInputForPackedPath({
          network: params.network,
          provider,
          pathPacked: v2best.pathPacked,
          amountInWei: inV2,
        });
        if (outV2 == null) continue;
        const total = outV1 + outV2;
        if (total > bestCombo) {
          bestCombo = total;
          bestW = wBps;
        }
      } catch {
        /* path hoặc quoter revert với chunk này */
      }
    }
    if (bestCombo > bestSingleVenue && bestCombo > 0n) {
      const improvementBps = Number((bestCombo - bestSingleVenue) * 10000n / bestSingleVenue);
      venueSplitV1V2 = {
        expectedOutWei: bestCombo,
        expectedOutHuman: formatUnits(bestCombo, decimalsOut),
        splitBpsToV1: bestW,
        v1Path: [...best.path],
        v2PathPacked: v2best.pathPacked,
        v2PathTokens: [...v2best.pathTokens],
        v2FeeTiers: [...v2best.feeTiers],
        improvementBpsVsBestSingle: Number.isFinite(improvementBps) ? improvementBps : 0,
      };
    }
  }

  if (!overSplitBudget() && !useV2Primary) {
    const topForSplit = ranked.slice(0, TOP_PATHS_FOR_SPLIT);
    if (topForSplit.length >= 2) {
      let bestSplitTotal = 0n;
      let bestSplitW = 5000;
      let bestI = 0;
      let bestJ = 1;
      for (let i = 0; i < topForSplit.length; i++) {
        if (Date.now() - quoteT0 >= budgetMs - 400) break;
        for (let j = i + 1; j < topForSplit.length; j++) {
          const pathA = topForSplit[i].path;
          const pathB = topForSplit[j].path;
          const keyA = pathA.map((x) => x.toLowerCase()).join("|");
          const keyB = pathB.map((x) => x.toLowerCase()).join("|");
          if (keyA === keyB) continue;
          for (const wBps of SPLIT_WEIGHT_BPS_GRID) {
            if (Date.now() - quoteT0 >= budgetMs - 400) break;
            const inA = (amountInWei * BigInt(wBps)) / 10000n;
            const inB = amountInWei - inA;
            if (inA === 0n || inB === 0n) continue;
            try {
              const outA = (
                (await router.getAmountsOut.staticCall(inA, pathA)) as bigint[]
              )[pathA.length - 1];
              const outB = (
                (await router.getAmountsOut.staticCall(inB, pathB)) as bigint[]
              )[pathB.length - 1];
              const total = outA + outB;
              if (total > bestSplitTotal) {
                bestSplitTotal = total;
                bestSplitW = wBps;
                bestI = i;
                bestJ = j;
              }
            } catch {
              /* một trong hai chunk revert */
            }
          }
        }
      }
      const singleOut = best.outWei;
      if (bestSplitTotal > singleOut && bestSplitTotal > 0n) {
        const improvementBps = Number((bestSplitTotal - singleOut) * 10000n / singleOut);
        multiRouteSplit = {
          expectedOutWei: bestSplitTotal,
          expectedOutHuman: formatUnits(bestSplitTotal, decimalsOut),
          splitBpsToPathA: bestSplitW,
          pathA: topForSplit[bestI].path,
          pathB: topForSplit[bestJ].path,
          improvementBps: Number.isFinite(improvementBps) ? improvementBps : 0,
        };
      }
    }
  }

  const result: AggregatorQuoteResult = {
    network: params.network,
    tokenIn: tin,
    tokenOut: tout,
    amountInHuman: params.amountInHuman,
    inDecimals: decimalsInResolved,
    outDecimals: decimalsOut,
    expectedOutHuman: formatUnits(expectedOutWei, decimalsOut),
    minOutHuman,
    priceImpactPercent: 0,
    hops,
    pathTokenAddresses,
    rankedRoutes,
    suggestSplit: Boolean(multiRouteSplit || venueSplitV1V2),
    multiRouteSplit,
    venueSplitV1V2,
    quoteRefinementPending: false,
    htsRoutingNote: HTS_ROUTING_NOTE_SHORT,
    swapExecution,
    v1AmmFallback,
    saucerswapV2Reference,
    saucerswapV2Error,
    notes: buildNotes(multiRouteSplit, venueSplitV1V2),
    quoteSource: "router_v2",
    routerAddress: routerDisplay,
    encodedPath: adapterData,
    expectedOutWei,
  };

  return {
    result,
    path: useV2Primary && v2best ? v2best.pathTokens : best.path,
    adapterData,
    expectedOutWei,
  };
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function buildV2HopPreviews(v2: SaucerV2QuoteBest): HopPreview[] {
  const hops: HopPreview[] = [];
  const tokens = v2.pathTokens;
  for (let i = 0; i < v2.feeTiers.length; i++) {
    hops.push({
      step: i + 1,
      tokenIn: shortAddr(tokens[i]),
      tokenOut: shortAddr(tokens[i + 1]),
      venueLabel: `SaucerSwap V2 CLMM · fee ${v2.feeTiers[i]}`,
      rateHint: `${v2.pathKind} · exactInput path`,
    });
  }
  return hops;
}
