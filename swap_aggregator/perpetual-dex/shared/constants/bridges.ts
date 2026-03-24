/**
 * Whitelist token “mạnh” cho routing (giai đoạn đầu) — ~99% route tối ưu đi qua nhóm này.
 * Địa chỉ mainnet (295): đối chiếu [SaucerSwap deployments](https://docs.saucerswap.finance/developerx/contract-deployments).
 *
 * Lưu ý: trên EVM dùng **WHBAR** (wrapped), không phải HBAR native trực tiếp trong path `address[]`.
 */

/** Hedera entity num (0.0.N) → EVM long-zero address */
export function hederaEntityNumToEvmAddress(num: number): `0x${string}` {
  const hex = BigInt(num).toString(16).padStart(40, "0");
  return `0x${hex}` as `0x${string}`;
}

/** Các ký hiệu ưu tiên khi ghép route / bridge 3-hop */
export const PRIMARY_BRIDGE_SYMBOLS = [
  "WHBAR",
  "USDC",
  "USDT",
  "SAUCE",
  "XSAUCE",
  "HBAR.ℏ",
  "HBAR",
] as const;

export type PrimaryBridgeSymbol = (typeof PRIMARY_BRIDGE_SYMBOLS)[number];

export type BridgeTokenMeta = {
  symbol: string;
  /** Hedera `0.0.x` — tra HashScan / docs */
  entityId?: string;
  /** Facade ERC-20 trên Hedera EVM mainnet (chain 295) */
  mainnetEvmAddress?: `0x${string}`;
  notes?: string;
};

/**
 * Danh sách gốc — bổ sung USDT / token khác khi có địa chỉ chính thức.
 * USDC / WHBAR nên khớp `VITE_AGGREGATOR_TOKEN_*_MAINNET` trong `.env`.
 */
export const BRIDGE_WHITELIST_MAINNET: readonly BridgeTokenMeta[] = [
  {
    symbol: "WHBAR",
    entityId: "0.0.1456986",
    mainnetEvmAddress: hederaEntityNumToEvmAddress(1456986),
    notes: "Wrapped HBAR — dùng trong path router V2-style",
  },
  {
    symbol: "USDC",
    entityId: "0.0.456858",
    mainnetEvmAddress: hederaEntityNumToEvmAddress(456858),
    notes: "USDC (mainnet) — khớp env thường là 0x…6f89a",
  },
  {
    symbol: "USDT",
    entityId: undefined,
    mainnetEvmAddress: undefined,
    notes:
      "Bridge thanh khoản phổ biến trên SaucerSwap — điền địa chỉ EVM mainnet từ docs/pool; dùng trong path USDC→USDT→WHBAR khi có địa chỉ + pool.",
  },
  {
    symbol: "SAUCE",
    entityId: "0.0.731861",
    mainnetEvmAddress: hederaEntityNumToEvmAddress(731861),
    notes: "SaucerSwap governance token — ứng viên bridge 3-hop (scan)",
  },
  {
    symbol: "XSAUCE",
    entityId: "0.0.1460200",
    mainnetEvmAddress: hederaEntityNumToEvmAddress(1460200),
    notes: "xSAUCE (staked SAUCE) — địa chỉ từ [deployments](https://docs.saucerswap.finance/developerx/contract-deployments)",
  },
  {
    symbol: "HBAR.ℏ",
    entityId: undefined,
    mainnetEvmAddress: "0x00000000000000000000000000000000008eC4bc",
    notes:
      "Facade HBAR trên V1 (symbol HBAR.ℏ) — thanh khoản bridge scan cao; **khác** `VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET`; luôn verify `getAmountsOut` USDC→X→WHBAR",
  },
  {
    symbol: "HBAR",
    entityId: undefined,
    mainnetEvmAddress: undefined,
    notes: "Trên path `address[]` thường dùng WHBAR hoặc facade HBAR.ℏ — không nhầm với native",
  },
] as const;

/** Set địa chỉ (lowercase) có trong whitelist — để đánh dấu ứng viên bridge */
export function getWhitelistedAddressesLower(): Set<string> {
  const s = new Set<string>();
  for (const t of BRIDGE_WHITELIST_MAINNET) {
    if (t.mainnetEvmAddress) s.add(t.mainnetEvmAddress.toLowerCase());
  }
  return s;
}
