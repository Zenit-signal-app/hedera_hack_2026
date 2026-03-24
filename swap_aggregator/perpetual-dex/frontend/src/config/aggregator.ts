/**
 * Liquidity aggregator — Hedera EVM (Mainnet 295 / Testnet 296).
 *
 * Kiến trúc Zenit: `Exchange` (meta-router) + từng `IAdapter` per venue; địa chỉ venue là stub cho đến khi P1+ nối pool/router.
 */

import { ethers } from "ethers";

export const HEDERA_EVM_MAINNET_CHAIN_ID = 295;
export const HEDERA_EVM_TESTNET_CHAIN_ID = 296;

export type AggregatorNetwork = "mainnet" | "testnet";

export type DexVenueStub = {
  id: string;
  name: string;
  /** Future: router / factory address */
  routerPlaceholder?: `0x${string}`;
  supported: boolean;
  /** Gợi ý id adapter (bytes32 string) — khớp `Exchange.setAdapter` khi deploy */
  adapterIdHint?: string;
};

/**
 * Venue mặc định: **SaucerSwap** — UI quote **V2 (CLMM / QuoterV2)** cho giá; **V1** (`getAmountsOut`) cho min receive / adapter swap.
 * Không liệt kê HeliSwap — protocol đã ngừng hoạt động.
 */
export const AGGREGATOR_VENUES: readonly DexVenueStub[] = [
  {
    id: "saucerswap",
    name: "SaucerSwap — V2 (CLMM) + V1 (swap)",
    supported: true,
    routerPlaceholder: "0x00000000000000000000000000000000002e7a5d",
    /** `Exchange.setAdapter` phải trỏ tới `UniswapV3SwapRouterAdapter` (deploy) — bytes32 ≤31 ký tự. */
    adapterIdHint: "saucerswap_v2",
  },
  {
    id: "pangolin",
    name: "Pangolin",
    supported: false,
    adapterIdHint: "pangolin",
  },
] as const;

/**
 * Mạng mặc định cho cấu hình aggregator (env).
 * **Trang `/aggregate` trong app** cố định chỉ dùng mainnet — xem `LiquidityAggregator`.
 */
export function getAggregatorTargetNetwork(): AggregatorNetwork {
  const v = (import.meta.env.VITE_AGGREGATOR_NETWORK as string | undefined)?.trim().toLowerCase();
  if (v === "mainnet" || v === "testnet") {
    return v;
  }
  const evm = (import.meta.env.VITE_HEDERA_EVM_NETWORK as string | undefined)?.trim().toLowerCase();
  return evm === "mainnet" ? "mainnet" : "testnet";
}

const ADDR = (v: string | undefined): `0x${string}` | undefined => {
  const t = v?.trim();
  if (t && /^0x[a-fA-F0-9]{40}$/.test(t)) return t as `0x${string}`;
  return undefined;
};

/** Deployed `Exchange` or `QuoteAggregator` for `quote()` eth_call. */
export function getQuoteContractAddress(): `0x${string}` | undefined {
  return ADDR(import.meta.env.VITE_AGGREGATOR_QUOTE_CONTRACT);
}

/** Deployed `Exchange` — required for on-chain **swap** (not `QuoteAggregator`, chỉ có `quote`). */
export function getExchangeContractAddress(): `0x${string}` | undefined {
  return ADDR(import.meta.env.VITE_AGGREGATOR_EXCHANGE_CONTRACT);
}

/** Optional REST URL for dashboard stats (your backend). */
export function getAggregatorStatsUrl(): string | undefined {
  const u = import.meta.env.VITE_AGGREGATOR_STATS_URL?.trim();
  return u || undefined;
}

/** `bytes32` adapter id registered on `Exchange.setAdapter` (must match on-chain). */
export function encodeAdapterId(label: string): `0x${string}` {
  return ethers.encodeBytes32String(label.slice(0, 31)) as `0x${string}`;
}

/**
 * Resolve common token symbols to env-configured HTS/ERC-20 facade addresses.
 */
export function resolveTokenAddressForAggregator(symbol: string, network: AggregatorNetwork): `0x${string}` | undefined {
  const s = symbol.trim().toUpperCase();
  if (s === "USDC" || s === "ZUSDC") {
    return network === "mainnet"
      ? ADDR(import.meta.env.VITE_AGGREGATOR_TOKEN_USDC_MAINNET) ?? ADDR(import.meta.env.VITE_AGGREGATOR_TOKEN_USDC)
      : ADDR(import.meta.env.VITE_AGGREGATOR_TOKEN_USDC);
  }
  if (s === "HBAR" || s === "WHBAR") {
    return network === "mainnet"
      ? ADDR(import.meta.env.VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET) ?? ADDR(import.meta.env.VITE_AGGREGATOR_TOKEN_WHBAR)
      : ADDR(import.meta.env.VITE_AGGREGATOR_TOKEN_WHBAR);
  }
  /** SAUCE / XSAUCE — env hoặc entity mainnet từ [SaucerSwap deployments](https://docs.saucerswap.finance/developerx/contract-deployments). */
  if (s === "SAUCE") {
    const env =
      network === "mainnet"
        ? ADDR(import.meta.env.VITE_AGGREGATOR_TOKEN_SAUCE_MAINNET) ?? ADDR(import.meta.env.VITE_AGGREGATOR_TOKEN_SAUCE)
        : ADDR(import.meta.env.VITE_AGGREGATOR_TOKEN_SAUCE);
    if (env) return env;
    return network === "mainnet" ? hederaEntityNumToEvmAddress(731861) : undefined;
  }
  if (s === "XSAUCE") {
    const env =
      network === "mainnet"
        ? ADDR(import.meta.env.VITE_AGGREGATOR_TOKEN_XSAUCE_MAINNET) ?? ADDR(import.meta.env.VITE_AGGREGATOR_TOKEN_XSAUCE)
        : ADDR(import.meta.env.VITE_AGGREGATOR_TOKEN_XSAUCE);
    if (env) return env;
    return network === "mainnet" ? hederaEntityNumToEvmAddress(1460200) : undefined;
  }
  return undefined;
}

export function chainIdForAggregator(network: AggregatorNetwork): number {
  return network === "mainnet" ? HEDERA_EVM_MAINNET_CHAIN_ID : HEDERA_EVM_TESTNET_CHAIN_ID;
}

/** Max hops for route search (future router). */
export const AGGREGATOR_MAX_HOPS = 4;

/** Default slippage in basis points (0.5%). */
export const DEFAULT_SLIPPAGE_BPS = 50;

/**
 * Hedera entity id (shard 0, realm 0) → EVM "long zero" 20-byte address (Mirror / JSON-RPC).
 * @see https://docs.hedera.com/hedera/core-concepts/smart-contracts/compatibility-evm
 */
export function hederaEntityNumToEvmAddress(num: number): `0x${string}` {
  const hex = BigInt(num).toString(16).padStart(40, "0");
  return `0x${hex}` as `0x${string}`;
}

/**
 * SaucerSwap **V1** RouterV3 — `getAmountsOut` (Uniswap V2–style path).
 * Entity `0.0.3045981` — [Contract deployments](https://docs.saucerswap.finance/developerx/contract-deployments).
 * Override: `VITE_AGGREGATOR_V2_ROUTER_MAINNET` hoặc `VITE_SAUCERSWAP_V1_ROUTER_MAINNET`.
 */
export const DEFAULT_SAUCERSWAP_V1_ROUTER_MAINNET: `0x${string}` = hederaEntityNumToEvmAddress(3045981);

/**
 * SaucerSwap **V1** Factory — sự kiện `PairCreated` cho Mirror (đồ thị pool V2).
 * Entity `0.0.1062784`.
 * Ghi đè: `VITE_SAUCERSWAP_V1_FACTORY_EVM_MAINNET` (hoặc biến cũ `VITE_HELISWAP_FACTORY_EVM_MAINNET` vẫn đọc được).
 */
export const DEFAULT_SAUCERSWAP_V1_FACTORY_EVM_MAINNET: `0x${string}` = hederaEntityNumToEvmAddress(1062784);

/**
 * SaucerSwap **V2** QuoterV2 — `quoteExactInput` (Uniswap V3–style path).
 * Entity `0.0.3949424` → EVM `0x…3c4250` — [Contract deployments](https://docs.saucerswap.finance/developerx/contract-deployments).
 * Override: `VITE_SAUCERSWAP_V2_QUOTER_MAINNET`.
 */
export const DEFAULT_SAUCERSWAP_V2_QUOTER_MAINNET: `0x${string}` = hederaEntityNumToEvmAddress(3949424);

/** Testnet — [SaucerSwap docs](https://docs.saucerswap.finance/developerx/contract-deployments)). */
export const DEFAULT_SAUCERSWAP_V2_QUOTER_TESTNET: `0x${string}` = hederaEntityNumToEvmAddress(1390002);

/**
 * SaucerSwap **V2** Factory — `getPool(tokenA, tokenB, fee)` trước khi gọi Quoter (tránh revert vô ích).
 * Entity `0.0.3946833` — [Contract deployments](https://docs.saucerswap.finance/developerx/contract-deployments).
 */
export const DEFAULT_SAUCERSWAP_V2_FACTORY_MAINNET: `0x${string}` = hederaEntityNumToEvmAddress(3946833);

/** Testnet factory — [SaucerSwap deployments](https://docs.saucerswap.finance/developerx/contract-deployments). */
export const DEFAULT_SAUCERSWAP_V2_FACTORY_TESTNET: `0x${string}` = hederaEntityNumToEvmAddress(1197038);

/**
 * SaucerSwap **V2** SwapRouter — `exactInput` (địa chỉ adapter on-chain).
 * Entity `0.0.3949434` — [Contract deployments](https://docs.saucerswap.finance/developerx/contract-deployments).
 */
export const DEFAULT_SAUCERSWAP_V2_SWAP_ROUTER_MAINNET: `0x${string}` = hederaEntityNumToEvmAddress(3949434);

/** @deprecated Dùng `DEFAULT_SAUCERSWAP_V1_ROUTER_MAINNET` */
export const DEFAULT_HELISWAP_V2_ROUTER_MAINNET = DEFAULT_SAUCERSWAP_V1_ROUTER_MAINNET;

/**
 * Uniswap V2–style router cho `getAmountsOut` / `UniswapV2LikeAdapter`.
 * Mainnet mặc định **SaucerSwap V1 RouterV3**; testnet nếu set `VITE_AGGREGATOR_V2_ROUTER_TESTNET`.
 */
export function getV2RouterAddress(network: AggregatorNetwork): `0x${string}` | undefined {
  const envMain =
    import.meta.env.VITE_AGGREGATOR_V2_ROUTER_MAINNET?.trim() ||
    import.meta.env.VITE_SAUCERSWAP_V1_ROUTER_MAINNET?.trim();
  const envTest = import.meta.env.VITE_AGGREGATOR_V2_ROUTER_TESTNET?.trim();
  if (network === "mainnet") {
    return ADDR(envMain) ?? DEFAULT_SAUCERSWAP_V1_ROUTER_MAINNET;
  }
  return ADDR(envTest);
}

export function getSaucerswapV1FactoryAddress(network: AggregatorNetwork): string | undefined {
  const envM =
    import.meta.env.VITE_SAUCERSWAP_V1_FACTORY_EVM_MAINNET?.trim() ||
    import.meta.env.VITE_HELISWAP_FACTORY_EVM_MAINNET?.trim();
  const envT =
    import.meta.env.VITE_SAUCERSWAP_V1_FACTORY_EVM_TESTNET?.trim() ||
    import.meta.env.VITE_HELISWAP_FACTORY_EVM_TESTNET?.trim();
  if (network === "mainnet") {
    return ADDR(envM) ?? DEFAULT_SAUCERSWAP_V1_FACTORY_EVM_MAINNET;
  }
  return ADDR(envT);
}

/** @deprecated Dùng `getSaucerswapV1FactoryAddress` */
export function getHeliswapFactoryAddress(network: AggregatorNetwork): string | undefined {
  return getSaucerswapV1FactoryAddress(network);
}

/**
 * Quoter V2 (CLMM) — quote `quoteExactInput`; khi có pool, UI ưu tiên **SwapRouter V2** + adapter `UniswapV3SwapRouterAdapter` (id `saucerswap_v2`).
 * Mainnet mặc định entity 3949424; testnet không set mặc định.
 */
export function getSaucerswapV2QuoterAddress(network: AggregatorNetwork = "mainnet"): `0x${string}` | undefined {
  const envMain = import.meta.env.VITE_SAUCERSWAP_V2_QUOTER_MAINNET?.trim();
  const envTest = import.meta.env.VITE_SAUCERSWAP_V2_QUOTER_TESTNET?.trim();
  if (network === "mainnet") {
    return ADDR(envMain) ?? DEFAULT_SAUCERSWAP_V2_QUOTER_MAINNET;
  }
  return ADDR(envTest) ?? DEFAULT_SAUCERSWAP_V2_QUOTER_TESTNET;
}

/** Factory V2 — dùng với `getPool` trước khi `quoteExactInput*`. Testnet: có thể set env. */
export function getSaucerswapV2FactoryAddress(network: AggregatorNetwork): `0x${string}` | undefined {
  const envMain = import.meta.env.VITE_SAUCERSWAP_V2_FACTORY_MAINNET?.trim();
  const envTest = import.meta.env.VITE_SAUCERSWAP_V2_FACTORY_TESTNET?.trim();
  if (network === "mainnet") {
    return ADDR(envMain) ?? DEFAULT_SAUCERSWAP_V2_FACTORY_MAINNET;
  }
  return ADDR(envTest) ?? DEFAULT_SAUCERSWAP_V2_FACTORY_TESTNET;
}

/** SwapRouter V2 (exactInput) — mainnet mặc định entity 3949434. */
export function getSaucerswapV2SwapRouterAddress(network: AggregatorNetwork): `0x${string}` | undefined {
  const envMain = import.meta.env.VITE_SAUCERSWAP_V2_SWAP_ROUTER_MAINNET?.trim();
  const envTest = import.meta.env.VITE_SAUCERSWAP_V2_SWAP_ROUTER_TESTNET?.trim();
  if (network === "mainnet") {
    return ADDR(envMain) ?? DEFAULT_SAUCERSWAP_V2_SWAP_ROUTER_MAINNET;
  }
  return ADDR(envTest);
}

/** Mirror REST (PairCreated / logs). Ưu tiên `VITE_HEDERA_MIRROR_REST`. Dev: proxy Vite → tránh CORS. */
export function getMirrorRestBase(network: AggregatorNetwork): string {
  const v = import.meta.env.VITE_HEDERA_MIRROR_REST?.trim();
  if (v) return v.replace(/\/$/, "");
  if (import.meta.env.DEV) {
    return network === "mainnet" ? "/mirror-mainnet" : "/mirror-testnet";
  }
  return network === "mainnet"
    ? "https://mainnet-public.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com";
}
