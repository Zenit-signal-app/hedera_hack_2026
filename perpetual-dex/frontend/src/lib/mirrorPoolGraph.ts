/**
 * Hedera Mirror Node — index cạnh pool từ sự kiện Uniswap V2 `PairCreated` trên Factory,
 * xây đồ thị token ↔ token và **BFS** tìm path (tối đa N hop).
 * Trọng số (phí pool / trượt giá) không gắn vào cạnh ở bước BFS — `v2RouterQuote` so sánh path bằng `getAmountsOut`.
 *
 * API: GET `/api/v1/contracts/{factory}/results/logs` — khi lọc `topic0` cần khoảng `timestamp` ≤ 7 ngày.
 * @see https://docs.hedera.com/api-reference/contracts/list-contract-logs-from-a-contract-on-the-network
 */
import { getAddress, id } from "ethers";

/** topic0 = keccak256("PairCreated(address,address,address,uint256)") — Uniswap V2 Factory */
export const PAIR_CREATED_TOPIC0_V2 = id("PairCreated(address,address,address,uint256)");

/** Factory SaucerSwap V1 mainnet — Mirror path chấp nhận `0.0.x` hoặc EVM address. */
const SAUCERSWAP_V1_FACTORY_ENTITY_MAINNET = "0.0.1062784";

function rewriteMirrorPaginationUrl(nextAbs: string, mirrorBase: string): string {
  if (!mirrorBase.startsWith("/mirror-")) return nextAbs;
  try {
    const u = new URL(nextAbs);
    if (u.hostname.includes("mirrornode.hedera.com")) {
      return `${mirrorBase}${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return nextAbs;
}

export type MirrorLogsJson = {
  logs?: Array<{
    topics?: string[];
    data?: string | null;
  }>;
  links?: { next?: string | null };
};

function topicToAddress(topic: string | undefined): `0x${string}` | null {
  if (!topic || topic.length < 66) return null;
  const h = topic.startsWith("0x") ? topic : `0x${topic}`;
  try {
    return getAddress(`0x${h.slice(-40)}`) as `0x${string}`;
  } catch {
    return null;
  }
}

/** Cạnh vô hướng: token (lowercase) → láng giềng */
export type AdjacencyGraph = Map<string, Set<string>>;

export function addEdge(adj: AdjacencyGraph, a: string, b: string): void {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return;
  if (!adj.has(x)) adj.set(x, new Set());
  if (!adj.has(y)) adj.set(y, new Set());
  adj.get(x)!.add(y);
  adj.get(y)!.add(x);
}

/**
 * Lấy log PairCreated từ factory (phạm vi 7 ngày gần nhất), phân trang.
 * Chỉ index các pool **tạo trong cửa sổ thời gian** — để full lịch sử cần indexer / nhiều cửa sổ.
 */
export async function fetchPairAdjacencyFromMirror(options: {
  mirrorBase: string;
  factoryIdOrAddress: string;
  /** Số trang tối đa (mỗi trang ≤100 log). */
  maxPages?: number;
  /** Unix seconds — mặc định now - 7d .. now */
  timestampGteSec?: number;
  timestampLteSec?: number;
}): Promise<AdjacencyGraph> {
  const { mirrorBase, factoryIdOrAddress, maxPages = 20 } = options;
  const base = mirrorBase.replace(/\/$/, "");
  const endSec = options.timestampLteSec ?? Math.floor(Date.now() / 1000);
  const startSec = options.timestampGteSec ?? endSec - 7 * 24 * 3600;

  const topic0 = PAIR_CREATED_TOPIC0_V2;
  /** Hai `timestamp=` (gte + lte) — dùng URLSearchParams.append (chuỗi tay dễ bị 400). */
  const buildLogsUrl = (factoryPathId: string) => {
    const qs = new URLSearchParams();
    qs.append("limit", "100");
    qs.append("order", "desc");
    qs.append("topic0", topic0);
    qs.append("timestamp", `gte:${startSec}`);
    qs.append("timestamp", `lte:${endSec}`);
    return `${base}/api/v1/contracts/${encodeURIComponent(factoryPathId)}/results/logs?${qs.toString()}`;
  };

  let nextUrl: string | null = buildLogsUrl(factoryIdOrAddress);

  const adj: AdjacencyGraph = new Map();
  let pages = 0;

  while (nextUrl && pages < maxPages) {
    const r = await fetch(nextUrl);
    if (!r.ok) {
      /** Thử entity id mainnet nếu path EVM trả 400 (một số bản Mirror gắt format). */
      if (
        r.status === 400 &&
        pages === 0 &&
        factoryIdOrAddress.toLowerCase().includes("103f80") &&
        !factoryIdOrAddress.includes(".")
      ) {
        nextUrl = buildLogsUrl(SAUCERSWAP_V1_FACTORY_ENTITY_MAINNET);
        const r2 = await fetch(nextUrl);
        if (!r2.ok) {
          if (import.meta.env.DEV) {
            console.debug("[mirrorPoolGraph] Mirror fetch failed:", r2.status, nextUrl);
          }
          break;
        }
        const j2 = (await r2.json()) as MirrorLogsJson;
        for (const log of j2.logs ?? []) {
          const t0 = topicToAddress(log.topics?.[1]);
          const t1 = topicToAddress(log.topics?.[2]);
          if (!t0 || !t1) continue;
          addEdge(adj, t0, t1);
        }
        const next2 = j2.links?.next;
        nextUrl = next2
          ? rewriteMirrorPaginationUrl(
              next2.startsWith("http") ? next2 : `${base}${next2}`,
              base,
            )
          : null;
        pages += 1;
        continue;
      }
      if (import.meta.env.DEV) {
        console.debug("[mirrorPoolGraph] Mirror fetch failed:", r.status, nextUrl);
      }
      break;
    }
    const j = (await r.json()) as MirrorLogsJson;
    for (const log of j.logs ?? []) {
      const t0 = topicToAddress(log.topics?.[1]);
      const t1 = topicToAddress(log.topics?.[2]);
      if (!t0 || !t1) continue;
      addEdge(adj, t0, t1);
    }
    const next = j.links?.next;
    if (!next) break;
    const rawNext = next.startsWith("http") ? next : `${base}${next}`;
    nextUrl = rewriteMirrorPaginationUrl(rawNext, base);
    pages += 1;
  }

  return adj;
}

const CACHE_PREFIX = "zenit:pairAdj:";
const CACHE_TTL_MS = 5 * 60 * 1000;

export function loadCachedAdjacency(network: string): AdjacencyGraph | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + network);
    if (!raw) return null;
    const { ts, entries } = JSON.parse(raw) as { ts: number; entries: [string, string[]][] };
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    const m: AdjacencyGraph = new Map();
    for (const [k, arr] of entries) {
      m.set(k, new Set(arr));
    }
    return m;
  } catch {
    return null;
  }
}

export function saveCachedAdjacency(network: string, adj: AdjacencyGraph): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const entries: [string, string[]][] = [...adj.entries()].map(([k, v]) => [k, [...v]]);
    sessionStorage.setItem(CACHE_PREFIX + network, JSON.stringify({ ts: Date.now(), entries }));
  } catch {
    /* quota */
  }
}

/**
 * BFS tất cả đường đi từ tokenIn → tokenOut, độ dài ≤ maxHops cạnh (số token trên path ≤ maxHops+1).
 */
export function findPathsBfs(
  adj: AdjacencyGraph,
  tokenIn: string,
  tokenOut: string,
  maxHops: number,
): `0x${string}`[][] {
  const start = tokenIn.toLowerCase();
  const end = tokenOut.toLowerCase();
  const out: `0x${string}`[][] = [];
  const queue: string[][] = [[start]];

  while (queue.length > 0) {
    const path = queue.shift()!;
    const cur = path[path.length - 1]!;
    if (cur === end && path.length > 1) {
      out.push(path.map((p) => getAddress(p) as `0x${string}`));
      continue;
    }
    if (path.length > maxHops + 1) continue;
    for (const nb of adj.get(cur) ?? []) {
      if (path.includes(nb)) continue;
      queue.push([...path, nb]);
    }
  }

  return out.sort((a, b) => a.length - b.length);
}
