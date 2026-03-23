/**
 * SaucerSwap **V2** (Uniswap V3–style) — QuoterV2 `quoteExactInput` / `quoteExactInputSingle`.
 * Trước khi gọi Quoter, lọc qua **V2 Factory `getPool`** để tránh hàng loạt `eth_call` revert (ethers báo "execution reverted / require(false)").
 * @see https://docs.saucerswap.finance/v/developer/saucerswap-v2/swap-operations/swap-quote
 */
import { Contract, getAddress, Interface, solidityPacked, ZeroAddress, type Provider } from "ethers";

import {
  getMirrorRestBase,
  getSaucerswapV2FactoryAddress,
  getSaucerswapV2QuoterAddress,
  type AggregatorNetwork,
} from "@/config/aggregator";
import { buildSaucerAggregatorPathShapes } from "@/lib/saucerPathFinder";

const QUOTER_V2_ABI = [
  "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
] as const;

const V2_FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
] as const;

const QUOTER_INTERFACE = new Interface([...QUOTER_V2_ABI]);

/**
 * Fee tier (uint24) — Uniswap V3 / SaucerSwap V2 CLMM.
 * Docs thường liệt kê: 0,01% (100), 0,05% (500), **0,15% (1500)**, 0,30% (3000), 1% (10000).
 * Thiếu tier đúng với pool thực tế → Quoter `quoteExactInput`/`Single` revert (pool không tồn tại cho fee đó).
 */
const FEE_TIERS_DIRECT: readonly number[] = [100, 500, 1500, 3000, 10000];
/** 2 cạnh CLMM: bỏ 100 (hiếm) để giảm 5²→4² RPC. */
const FEE_TIERS_MULTI_2: readonly number[] = [500, 1500, 3000, 10000];
/** ≥3 cạnh: chỉ tier phổ biến (bỏ 1500) → 3³ thay vì 4³ mỗi shape. */
const FEE_TIERS_MULTI_3PLUS: readonly number[] = [500, 3000, 10000];
/** Path ≥4 hop: 2 tier/hop → 2⁴ tổ hợp. */
const FEE_TIERS_DEEP: readonly number[] = [500, 3000];

/** Giới hạn số shape multi-hop V2 (sau khi bỏ duplicate direct) — tránh hàng nghìn eth_call. */
const MAX_V2_MULTIHOP_SHAPES = 14;

export type SaucerV2QuoteBest = {
  outWei: bigint;
  feeTiers: number[];
  pathPacked: `0x${string}`;
  pathKind: string;
  pathTokens: `0x${string}`[];
};

export type SaucerV2QuoteAttempt = {
  best: SaucerV2QuoteBest | null;
  /** Thông báo ngắn, không dump JSON-RPC. */
  lastError?: string;
};

/** Chuẩn hóa lỗi hiển thị UI — tránh log dài `transaction={...}` từ ethers. */
export function humanizeSaucerV2QuoteFailure(raw?: string): string {
  const hint =
    "Gợi ý: địa chỉ WHBAR/USDC đúng mainnet; thử các fee 500/1500/3000/10000 (pool CLMM có thể chỉ tồn tại ở một tier); RPC Hashio/relay.";
  if (!raw || !raw.trim()) {
    return `No V2 quote (no CLMM pool found for pair/fees tried). ${hint}`;
  }
  const r = raw.toLowerCase();
  if (
    r.includes("execution reverted") ||
    r.includes("require(false)") ||
    r.includes("call_exception") ||
    r.includes("revert") && r.includes("no data")
  ) {
    return `Quoter V2: gọi contract bị revert (thường khi không có pool V2 cho fee đó, hoặc thanh khoản 0). Đã giảm gọi nhờ Factory.getPool. ${hint}`;
  }
  if (r.includes("network") || r.includes("failed to fetch") || r.includes("timeout")) {
    return `Lỗi mạng / RPC khi gọi Hedera. ${hint}`;
  }
  const short = raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
  return `Quoter V2: ${short}`;
}

function pathKindLabel(tokens: `0x${string}`[], whbar?: string, usdc?: string): string {
  const w = whbar?.toLowerCase();
  const u = usdc?.toLowerCase();
  const addrs = tokens.map((t) => t.toLowerCase());
  if (tokens.length <= 2) return "direct";
  const mids = addrs.slice(1, -1);
  const hasW = w && mids.includes(w);
  const hasU = u && mids.includes(u);
  if (hasW && hasU) return "via_whbar_usdc";
  if (hasW) return "via_whbar";
  if (hasU) return "via_usdc";
  return `${tokens.length - 1}_hop`;
}

function packV2EncodedPath(tokens: `0x${string}`[], fees: number[]): `0x${string}` {
  if (tokens.length < 2 || fees.length !== tokens.length - 1) {
    throw new Error("packV2EncodedPath: token/fee length mismatch");
  }
  const types: string[] = ["address", "uint24"];
  const vals: Array<string | bigint> = [getAddress(tokens[0]), BigInt(fees[0])];
  for (let i = 1; i < tokens.length - 1; i++) {
    types.push("address", "uint24");
    vals.push(getAddress(tokens[i]), BigInt(fees[i]));
  }
  types.push("address");
  vals.push(getAddress(tokens[tokens.length - 1]));
  return solidityPacked(types, vals) as `0x${string}`;
}

function feeCombinations(hopCount: number, tiers: readonly number[]): number[][] {
  if (hopCount <= 0) return [[]];
  const out: number[][] = [];
  const rest = feeCombinations(hopCount - 1, tiers);
  for (const f of tiers) {
    for (const r of rest) {
      out.push([f, ...r]);
    }
  }
  return out;
}

function tiersForPath(numHops: number): readonly number[] {
  if (numHops === 1) return FEE_TIERS_DIRECT;
  if (numHops === 2) return FEE_TIERS_MULTI_2;
  if (numHops === 3) return FEE_TIERS_MULTI_3PLUS;
  return FEE_TIERS_DEEP;
}

async function mirrorContractCallStatic(
  network: AggregatorNetwork,
  to: `0x${string}`,
  data: `0x${string}`,
): Promise<`0x${string}` | null> {
  const base = getMirrorRestBase(network);
  try {
    const res = await fetch(`${base}/api/v1/contracts/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        block: "latest",
        data,
        to,
        gas: 15_000_000,
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: string };
    return (j.result as `0x${string}`) ?? null;
  } catch {
    return null;
  }
}

function decodeQuoteExactInputSingleResult(data: `0x${string}`): bigint | null {
  try {
    const decoded = QUOTER_INTERFACE.decodeFunctionResult("quoteExactInputSingle", data);
    const amountOut = decoded[0] as bigint;
    return amountOut > 0n ? amountOut : null;
  } catch {
    return null;
  }
}

async function v2PoolExists(
  provider: Provider,
  factoryAddr: `0x${string}`,
  tokenA: string,
  tokenB: string,
  fee: number,
): Promise<boolean> {
  try {
    const f = new Contract(factoryAddr, V2_FACTORY_ABI, provider);
    const pool = (await f.getPool.staticCall(tokenA, tokenB, fee)) as string;
    return Boolean(pool && pool !== ZeroAddress && pool.toLowerCase() !== ZeroAddress.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Multi-hop: kiểm tra từng cạnh path có pool V2 không (đủ điều kiện cần cho quote).
 */
async function pathHasAllV2Pools(
  provider: Provider,
  factoryAddr: `0x${string}`,
  tokens: `0x${string}`[],
  fees: number[],
): Promise<boolean> {
  const checks = await Promise.all(
    fees.map((fee, i) => v2PoolExists(provider, factoryAddr, tokens[i], tokens[i + 1], fee)),
  );
  return checks.every(Boolean);
}

export async function tryBestSaucerswapV2Quote(params: {
  network: AggregatorNetwork;
  provider: Provider;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountInWei: bigint;
  whbar?: `0x${string}`;
  usdc?: `0x${string}`;
}): Promise<SaucerV2QuoteAttempt> {
  const quoterAddr = getSaucerswapV2QuoterAddress(params.network);
  const factoryAddr = getSaucerswapV2FactoryAddress(params.network);

  if (!quoterAddr || params.amountInWei <= 0n) {
    return { best: null, lastError: !quoterAddr ? "Missing V2 Quoter address (config)." : "Invalid amountIn." };
  }

  try {
    getAddress(params.tokenIn);
    getAddress(params.tokenOut);
  } catch {
    return { best: null, lastError: "Địa chỉ token in/out không hợp lệ." };
  }

  const quoter = new Contract(quoterAddr, QUOTER_V2_ABI, params.provider);
  let best: SaucerV2QuoteBest | null = null;
  /** Chỉ giữ 1 lỗi “thật” (không phải mọi lần revert thử fee). */
  let lastRawError: string | undefined;

  const consider = (candidate: SaucerV2QuoteBest | null) => {
    if (!candidate) return;
    if (!best || candidate.outWei > best.outWei) best = candidate;
  };

  const tIn = getAddress(params.tokenIn) as `0x${string}`;
  const tOut = getAddress(params.tokenOut) as `0x${string}`;

  /** 1) Direct: song song hóa getPool + quote (giảm latency so với tuần tự). */
  const directPoolFlags = factoryAddr
    ? await Promise.all(
        FEE_TIERS_DIRECT.map((fee) => v2PoolExists(params.provider, factoryAddr, tIn, tOut, fee)),
      )
    : FEE_TIERS_DIRECT.map(() => true);
  const directQuoteResults = await Promise.all(
    FEE_TIERS_DIRECT.map(async (fee, idx) => {
      if (!directPoolFlags[idx]) return { fee, err: null as string | null, outWei: null as bigint | null };
      const singleParams = {
        tokenIn: tIn,
        tokenOut: tOut,
        amountIn: params.amountInWei,
        fee,
        sqrtPriceLimitX96: 0n,
      };
      try {
        const result = (await quoter.quoteExactInputSingle.staticCall(singleParams)) as {
          amountOut?: bigint;
          0?: bigint;
        };
        const outWei = result.amountOut ?? result[0];
        if (outWei != null && typeof outWei === "bigint" && outWei > 0n) {
          return { fee, err: null, outWei };
        }
        return { fee, err: null, outWei: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { fee, err: msg, outWei: null };
      }
    }),
  );
  for (const r of directQuoteResults) {
    if (r.err) lastRawError = r.err;
    if (r.outWei != null && r.outWei > 0n) {
      const pathPacked = packV2EncodedPath([tIn, tOut], [r.fee]);
      consider({
        outWei: r.outWei,
        feeTiers: [r.fee],
        pathPacked,
        pathKind: "direct",
        pathTokens: [tIn, tOut],
      });
    }
  }

  /** 2) Multi-hop — bỏ path 2 token (đã xử lý ở bước 1), giới hạn số shape. */
  const shapes = buildSaucerAggregatorPathShapes({
    network: params.network,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    whbar: params.whbar,
    usdc: params.usdc,
  }).filter((p) => p.length > 2);
  const shapesLimited = shapes.slice(0, MAX_V2_MULTIHOP_SHAPES);

  for (const tokens of shapesLimited) {
    const normalized = tokens.map((t) => getAddress(t) as `0x${string}`);
    const numHops = normalized.length - 1;
    if (numHops < 1) continue;
    const tierList = tiersForPath(numHops);
    const combos = feeCombinations(numHops, tierList);

    for (const fees of combos) {
      if (factoryAddr) {
        const okPath = await pathHasAllV2Pools(params.provider, factoryAddr, normalized, fees);
        if (!okPath) continue;
      }
      let pathPacked: `0x${string}`;
      try {
        pathPacked = packV2EncodedPath(normalized, fees);
      } catch {
        continue;
      }
      try {
        const result = (await quoter.quoteExactInput.staticCall(pathPacked, params.amountInWei)) as {
          amountOut?: bigint;
          0?: bigint;
        };
        const outWei = result.amountOut ?? result[0];
        if (outWei == null || typeof outWei !== "bigint" || outWei === 0n) continue;
        consider({
          outWei,
          feeTiers: [...fees],
          pathPacked,
          pathKind: pathKindLabel(normalized, params.whbar, params.usdc),
          pathTokens: normalized,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastRawError = msg;
      }
    }
  }

  /** 3) Mirror REST — khi RPC lỗi nhưng mirror còn (ít gặp). */
  if (!best && factoryAddr) {
    for (const fee of [100, 500, 1500, 3000, 10000] as const) {
      const ex = await v2PoolExists(params.provider, factoryAddr, tIn, tOut, fee);
      if (!ex) continue;
      const singleParams = {
        tokenIn: tIn,
        tokenOut: tOut,
        amountIn: params.amountInWei,
        fee,
        sqrtPriceLimitX96: 0n,
      };
      try {
        const data = QUOTER_INTERFACE.encodeFunctionData("quoteExactInputSingle", [singleParams]) as `0x${string}`;
        const raw = await mirrorContractCallStatic(params.network, quoterAddr, data);
        if (!raw) continue;
        const outWei = decodeQuoteExactInputSingleResult(raw);
        if (outWei && outWei > 0n) {
          const pathPacked = packV2EncodedPath([tIn, tOut], [fee]);
          consider({
            outWei,
            feeTiers: [fee],
            pathPacked,
            pathKind: "direct",
            pathTokens: [tIn, tOut],
          });
          break;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastRawError = msg;
      }
    }
  }

  return {
    best,
    lastError: best ? undefined : humanizeSaucerV2QuoteFailure(lastRawError),
  };
}

/**
 * Quote lại **cùng** path CLMM đã chọn (`pathPacked`) với `amountIn` khác (vd. khi tối ưu split V1+V2).
 */
export async function quoteV2ExactInputForPackedPath(params: {
  network: AggregatorNetwork;
  provider: Provider;
  pathPacked: `0x${string}`;
  amountInWei: bigint;
}): Promise<bigint | null> {
  const quoterAddr = getSaucerswapV2QuoterAddress(params.network);
  if (!quoterAddr || params.amountInWei <= 0n) return null;
  const quoter = new Contract(quoterAddr, QUOTER_V2_ABI, params.provider);
  try {
    const result = (await quoter.quoteExactInput.staticCall(params.pathPacked, params.amountInWei)) as {
      amountOut?: bigint;
      0?: bigint;
    };
    const outWei = result.amountOut ?? result[0];
    if (outWei == null || typeof outWei !== "bigint" || outWei === 0n) return null;
    return outWei;
  } catch {
    return null;
  }
}
