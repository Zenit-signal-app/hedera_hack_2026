/**
 * Quy trình 3 bước (Pool Discovery → Bridge intersection → Liquidity):
 * 1) Danh mục pool từ Mirror (PairCreated trên Factory) — xem `mirrorPoolGraph.ts`.
 * 2) Tập láng giềng USDC vs WHBAR → giao điểm = bridge token khả dĩ.
 * 3) Kiểm tra `factory.getPair` + `pair.getReserves()` — cả hai reserve > 0.
 */
import { Contract, getAddress, ZeroAddress, type Provider } from "ethers";

import type { AdjacencyGraph } from "@/lib/mirrorPoolGraph";

/** Biến đồ thị vô hướng thành danh sách cặp (token0, token1) duy nhất. */
export function adjacencyToUndirectedPairs(adj: AdjacencyGraph): Array<{ token0: string; token1: string }> {
  const seen = new Set<string>();
  const out: Array<{ token0: string; token1: string }> = [];
  for (const [a, neighbors] of adj) {
    for (const b of neighbors) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ token0: getAddress(a), token1: getAddress(b) });
    }
  }
  return out;
}

/**
 * Set_A = token láng giềng USDC (trừ cặp USDC–WHBAR trực tiếp không thêm WHBAR như “bridge”).
 * Set_B = token láng giềng WHBAR.
 * Giao điểm = token có pool USDC–X và pool WHBAR–X.
 */
export function findBridgeTokensByIntersection(
  pairs: Array<{ token0: string; token1: string }>,
  usdc: string,
  whbar: string,
): string[] {
  const u = usdc.toLowerCase();
  const w = whbar.toLowerCase();
  const setA = new Set<string>();
  const setB = new Set<string>();

  for (const p of pairs) {
    const t0 = p.token0.toLowerCase();
    const t1 = p.token1.toLowerCase();

    if (t0 === u && t1 !== w) setA.add(t1);
    else if (t1 === u && t0 !== w) setA.add(t0);

    if (t0 === w && t1 !== u) setB.add(t1);
    else if (t1 === w && t0 !== u) setB.add(t0);
  }

  return [...setA].filter((t) => setB.has(t) && t !== u && t !== w);
}

const FACTORY_ABI = ["function getPair(address tokenA, address tokenB) external view returns (address pair)"] as const;

const PAIR_ABI = [
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
] as const;

export async function getPairFromFactory(
  factory: string,
  tokenA: string,
  tokenB: string,
  provider: Provider,
): Promise<string | null> {
  const f = new Contract(factory, FACTORY_ABI, provider);
  try {
    const p = (await f.getPair.staticCall(tokenA, tokenB)) as string;
    if (!p || p === ZeroAddress) return null;
    return getAddress(p);
  } catch {
    return null;
  }
}

export async function pairHasNonZeroReserves(pairAddress: string, provider: Provider): Promise<boolean> {
  const pair = new Contract(pairAddress, PAIR_ABI, provider);
  try {
    const [r0, r1] = (await pair.getReserves.staticCall()) as [bigint, bigint, number];
    return r0 > 0n && r1 > 0n;
  } catch {
    return false;
  }
}

export type BridgeLiquidityResult = {
  bridge: string;
  usdcPair: string | null;
  whbarPair: string | null;
  usdcLiquidityOk: boolean;
  whbarLiquidityOk: boolean;
  /** Cả hai nhánh USDC–bridge và WHBAR–bridge đều có reserve > 0. */
  isViable: boolean;
};

export async function filterBridgesByLiquidity(
  provider: Provider,
  factory: string,
  bridges: string[],
  usdc: string,
  whbar: string,
): Promise<BridgeLiquidityResult[]> {
  const results: BridgeLiquidityResult[] = [];
  for (const bridge of bridges) {
    const br = getAddress(bridge);
    const usdcPair = await getPairFromFactory(factory, usdc, br, provider);
    const whbarPair = await getPairFromFactory(factory, whbar, br, provider);
    const usdcLiquidityOk = usdcPair ? await pairHasNonZeroReserves(usdcPair, provider) : false;
    const whbarLiquidityOk = whbarPair ? await pairHasNonZeroReserves(whbarPair, provider) : false;
    results.push({
      bridge: br,
      usdcPair,
      whbarPair,
      usdcLiquidityOk,
      whbarLiquidityOk,
      isViable: usdcLiquidityOk && whbarLiquidityOk,
    });
  }
  return results;
}

/**
 * Chạy đủ bước 2+3 khi đã có đồ thị pool (từ Mirror).
 */
export async function discoverViableUsdcWhbarBridges(params: {
  adj: AdjacencyGraph;
  usdc: string;
  whbar: string;
  factory: string;
  provider: Provider;
}): Promise<{ bridges: string[]; liquidity: BridgeLiquidityResult[] }> {
  const pairs = adjacencyToUndirectedPairs(params.adj);
  const raw = findBridgeTokensByIntersection(pairs, params.usdc, params.whbar);
  const liquidity = await filterBridgesByLiquidity(
    params.provider,
    params.factory,
    raw,
    params.usdc,
    params.whbar,
  );
  const bridges = liquidity.filter((x) => x.isViable).map((x) => x.bridge);
  return { bridges, liquidity };
}
