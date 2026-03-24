/**
 * Map địa chỉ token trên path aggregate → nhãn hiển thị (WHBAR, SAUCE, …).
 */
import { getAddress } from "ethers";

import { BRIDGE_WHITELIST_MAINNET } from "@shared/constants/bridges";

export type AggregatorPathLabelContext = {
  tokenInSymbol: string;
  tokenOutSymbol: string;
  tokenInAddress?: `0x${string}`;
  tokenOutAddress?: `0x${string}`;
  whbar?: `0x${string}`;
  usdc?: `0x${string}`;
};

/** Một địa chỉ → nhãn; không khớp whitelist thì `0xabcd…1234`. */
export function pathTokenLabelsFromAddresses(
  path: readonly `0x${string}`[],
  ctx: AggregatorPathLabelContext,
): string[] {
  const addrToSym = new Map<string, string>();
  const add = (addr?: `0x${string}`, sym?: string) => {
    if (!addr || !sym) return;
    try {
      addrToSym.set(getAddress(addr).toLowerCase(), sym.trim().toUpperCase());
    } catch {
      /* ignore */
    }
  };
  add(ctx.tokenInAddress, ctx.tokenInSymbol);
  add(ctx.tokenOutAddress, ctx.tokenOutSymbol);
  add(ctx.whbar, "WHBAR");
  add(ctx.usdc, "USDC");
  for (const t of BRIDGE_WHITELIST_MAINNET) {
    if (t.mainnetEvmAddress) add(t.mainnetEvmAddress as `0x${string}`, t.symbol);
  }

  return path.map((a) => {
    try {
      const k = getAddress(a).toLowerCase();
      return addrToSym.get(k) ?? `${a.slice(0, 6)}…${a.slice(-4)}`;
    } catch {
      return `${a.slice(0, 6)}…${a.slice(-4)}`;
    }
  });
}
