import { createConfig, http } from "wagmi";
import { fallback } from "viem";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";

import { hederaJsonRpcUrl } from "../lib/hederaDevProxy";

/** `testnet` (default) | `mainnet` — drives wagmi chain, HashPack WC, mirror REST defaults */
export type HederaEvmNetwork = "mainnet" | "testnet";

function readEvmNetwork(): HederaEvmNetwork {
  const v = import.meta.env.VITE_HEDERA_EVM_NETWORK?.trim().toLowerCase();
  return v === "mainnet" ? "mainnet" : "testnet";
}

export const activeEvmNetwork: HederaEvmNetwork = readEvmNetwork();

const TESTNET_RPC = hederaJsonRpcUrl("testnet");
/** Cùng endpoint (dev: proxy); viem fallback vẫn retry khi lỗi mạng tạm. */
const TESTNET_RPC_ALT = TESTNET_RPC;

const MAINNET_RPC = hederaJsonRpcUrl("mainnet");
const MAINNET_RPC_ALT = MAINNET_RPC;

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: {
    default: { http: [TESTNET_RPC, TESTNET_RPC_ALT] },
  },
  blockExplorers: {
    default: {
      name: "HashScan",
      url: "https://hashscan.io/testnet",
    },
  },
});

export const hederaMainnet = defineChain({
  id: 295,
  name: "Hedera Mainnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: {
    default: { http: [MAINNET_RPC, MAINNET_RPC_ALT] },
  },
  blockExplorers: {
    default: {
      name: "HashScan",
      url: "https://hashscan.io/mainnet",
    },
  },
});

/** Active chain for this build (from `VITE_HEDERA_EVM_NETWORK`). */
export const activeChain = activeEvmNetwork === "mainnet" ? hederaMainnet : hederaTestnet;

export const hashscanBaseUrl =
  activeEvmNetwork === "mainnet" ? "https://hashscan.io/mainnet" : "https://hashscan.io/testnet";

// Backward-compatible export name used by existing tests.
export const polkadotEVMTestnet = hederaTestnet;

const testnetTransport = fallback([
  http(TESTNET_RPC, { retryCount: 2 }),
  http(TESTNET_RPC_ALT, { retryCount: 2 }),
]);

const mainnetTransport = fallback([
  http(MAINNET_RPC, { retryCount: 2 }),
  http(MAINNET_RPC_ALT, { retryCount: 2 }),
]);

/** Order: env default first — used as wagmi default chain; second chain enables `switchChain` for /aggregate. */
const orderedChains =
  activeEvmNetwork === "mainnet"
    ? ([hederaMainnet, hederaTestnet] as const)
    : ([hederaTestnet, hederaMainnet] as const);

function detectHashPackProvider(): any | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as any;
  const eth = w?.ethereum;
  const lc = (v: unknown) => String(v ?? "").toLowerCase();
  const isHashpackLike = (p: any): boolean => {
    if (!p) return false;
    if (p.isHashPack || p.isHashpack) return true;
    if (lc(p.providerInfo?.name).includes("hashpack")) return true;
    if (lc(p.providerInfo?.rdns).includes("hashpack")) return true;
    if (lc(p.name).includes("hashpack")) return true;
    if (lc(p.constructor?.name).includes("hashpack")) return true;
    if (lc(p._metamask?.name).includes("hashpack")) return true;
    if (lc(p?.providers?.[0]?.name).includes("hashpack")) return true;
    return false;
  };

  // Case 1: HashPack is the primary injected provider.
  if (eth && isHashpackLike(eth)) return eth;

  // Case 2: Multiple wallets are injected in ethereum.providers.
  const providers = Array.isArray(eth?.providers) ? eth.providers : [];
  const hp = providers.find((p: any) => isHashpackLike(p));
  if (hp) return hp;

  // Case 2b: Heuristic fallback - pick non-EVM-major provider when multiple wallets exist.
  // This mirrors the reference project's extension-priority strategy for HashPack.
  if (providers.length > 1) {
    const likelyHashpack = providers.find((p: any) => {
      const flags = {
        metaMask: Boolean(p?.isMetaMask),
        brave: Boolean(p?.isBraveWallet),
        coinbase: Boolean(p?.isCoinbaseWallet),
        rabby: Boolean(p?.isRabby),
      };
      const knownEvmWallet = flags.metaMask || flags.brave || flags.coinbase || flags.rabby;
      return !knownEvmWallet && typeof p?.request === "function";
    });
    if (likelyHashpack) return likelyHashpack;
  }

  // Case 3: Some HashPack builds expose provider under window.hashpack.ethereum.
  const hpEth = w?.hashpack?.ethereum;
  if (hpEth && (isHashpackLike(hpEth) || typeof hpEth.request === "function")) return hpEth;

  // Case 4: Some builds expose provider under window.hashpack.provider.
  const hpProvider = w?.hashpack?.provider;
  if (hpProvider && (isHashpackLike(hpProvider) || typeof hpProvider.request === "function")) return hpProvider;

  // Case 5: Loose scan of common global namespaces for injected providers.
  const candidates = [
    w?.hedera?.ethereum,
    w?.hedera?.provider,
    w?.hashPack,
    w?.hashPack?.ethereum,
    w?.hashPack?.provider,
    w?.ethereumHashpack,
  ];
  const candidate = candidates.find((p) => p && (isHashpackLike(p) || typeof p.request === "function"));
  if (candidate) return candidate;

  return undefined;
}

export function getHashPackDetectionState(): string {
  if (typeof window === "undefined") return "unknown";
  const w = window as any;
  const eth = w?.ethereum;
  const hasEth = Boolean(eth);
  const providers = Array.isArray(eth?.providers) ? eth.providers : [];
  const hasHashpackNamespace = Boolean(w?.hashpack);
  const provider = detectHashPackProvider();
  if (provider) return "detected";
  if (!hasEth && !hasHashpackNamespace) return "no_injected_provider";
  if (hasEth && providers.length > 1) return "multiple_wallets_no_hashpack_flag";
  if (hasEth) return "ethereum_present_no_hashpack_flag";
  return "unknown";
}

export const config = createConfig({
  chains: orderedChains,
  connectors: [
    injected({
      target() {
        const provider = detectHashPackProvider();
        if (!provider) return undefined;
        return {
          id: "hashpack",
          name: "HashPack",
          provider,
        };
      },
    }),
  ],
  transports: {
    [hederaMainnet.id]: mainnetTransport,
    [hederaTestnet.id]: testnetTransport,
  },
});
