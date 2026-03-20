// Contract addresses - zUSDC as trading + reward token on Polkadot EVM Testnet
export const CONTRACTS = {
  DEX: ((import.meta.env.VITE_PERP_DEX_ADDRESS ?? import.meta.env.VITE_DEX_ADDRESS) as `0x${string}`) || "0xfDb613715EAc5a908Dc50d6c517a4044F243a71b",
  TOKEN: (import.meta.env.VITE_TOKEN_ADDRESS as `0x${string}`) || "0x277E42B9454fB36A7Eaa52D4cE332bEF71dd017a",
  REWARD: (import.meta.env.VITE_REWARD_ADDRESS as `0x${string}`) || "0x6fAbdA09fa1FB9e3087Db3De8D3b71E26bE15CA0",
} as const;

/** Keeper service base URL for TP/SL registration. Must be reachable from the browser. */
export const KEEPER_URL =
  (import.meta.env.VITE_KEEPER_URL as string) || "http://localhost:3100";
