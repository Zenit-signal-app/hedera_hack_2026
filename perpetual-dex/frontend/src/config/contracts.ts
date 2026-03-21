// Contract addresses - zUSDC as trading + reward token on Polkadot EVM Testnet
/** Trim .env values — a leading space after `=` breaks contract calls (wrong 0x…). */
function envAddr(key: string, fallback: `0x${string}`): `0x${string}` {
  const v = (import.meta.env[key] as string | undefined)?.trim();
  if (v && /^0x[0-9a-fA-F]{40}$/.test(v)) return v as `0x${string}`;
  return fallback;
}

function envHederaEntityId(key: string, fallback: string): string {
  const v = (import.meta.env[key] as string | undefined)?.trim();
  return v && /^\d+\.\d+\.\d+$/.test(v) ? v : fallback;
}

const dexFromEnv =
  (import.meta.env.VITE_PERP_DEX_ADDRESS ?? import.meta.env.VITE_DEX_ADDRESS) as string | undefined;
const dexTrimmed = dexFromEnv?.trim();
const DEX_FALLBACK = "0xfDb613715EAc5a908Dc50d6c517a4044F243a71b" as const;

export const CONTRACTS = {
  DEX:
    dexTrimmed && /^0x[0-9a-fA-F]{40}$/.test(dexTrimmed)
      ? (dexTrimmed as `0x${string}`)
      : (DEX_FALLBACK as `0x${string}`),
  TOKEN: envAddr("VITE_TOKEN_ADDRESS", "0x277E42B9454fB36A7Eaa52D4cE332bEF71dd017a"),
  REWARD: envAddr("VITE_REWARD_ADDRESS", "0x6fAbdA09fa1FB9e3087Db3De8D3b71E26bE15CA0"),
  /** ZUSDCStaking — set after `scripts/deployStaking.ts` */
  STAKING: envAddr("VITE_STAKING_ADDRESS", "0x624643357d32130Cbd453A96b837DE907ddaF4F3"),
} as const;

/**
 * Hedera entity id (shard.realm.num) for explorers — mirrors the deployed staking contract.
 * Override with `VITE_STAKING_CONTRACT_ID` in `frontend/.env`.
 */
export const STAKING_CONTRACT_HEDERA_ID = envHederaEntityId("VITE_STAKING_CONTRACT_ID", "0.0.8316032");

/** HashScan (Hedera testnet) link for a contract by EVM address or `0.0.x` id. */
export function hashscanTestnetContract(idOrEvmAddress: string): string {
  return `https://hashscan.io/testnet/contract/${encodeURIComponent(idOrEvmAddress)}`;
}

/** Keeper service base URL for TP/SL registration. Must be reachable from the browser. */
export const KEEPER_URL =
  (import.meta.env.VITE_KEEPER_URL as string) || "http://localhost:3100";
