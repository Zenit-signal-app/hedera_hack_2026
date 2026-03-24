/**
 * Gọi trực tiếp SaucerSwap V1 RouterV3 (HBAR native ↔ token) theo docs:
 * - HBAR→Token: `swapExactETHForTokens*` + **msg.value** (weibars / 18 decimals).
 * - Token→HBAR: `swapExactTokensForETH*` — path kết thúc WHBAR, router unwrap native.
 * @see https://docs.saucerswap.finance/v/developer/saucerswap-v1/swap-operations/swap-hbar-for-tokens
 */
import { AbiCoder } from "ethers";

import type { AggregatorNetwork } from "@/config/aggregator";
import { getV2RouterAddress } from "@/config/aggregator";
import type { AggregatorQuoteResult } from "@/lib/aggregatorQuote";

/** Địa chỉ 0x0 — coi như “native HBAR” trong path phải dùng WHBAR (SaucerSwap). */
export const NATIVE_HBAR_EVM_PLACEHOLDER = "0x0000000000000000000000000000000000000000" as const;

export function isNativeHbarPlaceholder(addr: string | undefined): boolean {
  if (!addr) return false;
  return addr.toLowerCase() === NATIVE_HBAR_EVM_PLACEHOLDER.toLowerCase();
}

export function isSaucerNativeHbarDirectSwapEnabled(): boolean {
  return import.meta.env.VITE_AGGREGATOR_USE_SAUCE_NATIVE_HBAR_SWAP?.trim() !== "0";
}

/**
 * HBAR → token qua router: mặc định `swapExactETHForTokens` (chuẩn Uniswap).
 * Một số token HTS cần `supporting` — set `VITE_AGGREGATOR_HBAR_TO_TOKEN_SWAP_FN=supporting`.
 */
export function getSaucerSwapHbarToTokenFunctionName():
  | "swapExactETHForTokens"
  | "swapExactETHForTokensSupportingFeeOnTransferTokens" {
  const v = import.meta.env.VITE_AGGREGATOR_HBAR_TO_TOKEN_SWAP_FN?.trim().toLowerCase();
  if (v === "supporting" || v === "fee" || v === "fot") {
    return "swapExactETHForTokensSupportingFeeOnTransferTokens";
  }
  return "swapExactETHForTokens";
}

/** Giải mã `encodedPath` = abi.encode(address[]) từ quote V1. */
export function decodeV1RouterAddressPath(encodedPath: `0x${string}` | undefined): `0x${string}`[] | null {
  if (!encodedPath || encodedPath === "0x" || encodedPath.length < 10) return null;
  try {
    const decoded = AbiCoder.defaultAbiCoder().decode(["address[]"], encodedPath);
    const path = decoded[0] as unknown as `0x${string}`[];
    return path?.length >= 2 ? path : null;
  } catch {
    return null;
  }
}

export function canUseSaucerV1NativeHbarInSwap(params: {
  tokenInSymbol: string;
  quote: AggregatorQuoteResult | null;
  network: AggregatorNetwork;
  whbarAddr: `0x${string}` | undefined;
  resolvedIn: `0x${string}` | undefined;
}): boolean {
  if (!isSaucerNativeHbarDirectSwapEnabled()) return false;
  if (params.tokenInSymbol.trim().toUpperCase() !== "HBAR") return false;
  const q = params.quote;
  if (!q || q.swapExecution !== "v1_amm" || q.quoteSource !== "router_v2") return false;
  if (!getV2RouterAddress(params.network)) return false;
  if (!params.whbarAddr || !params.resolvedIn) return false;
  return params.resolvedIn.toLowerCase() === params.whbarAddr.toLowerCase();
}

export function canUseSaucerV1TokenToHbarSwap(params: {
  tokenOutSymbol: string;
  quote: AggregatorQuoteResult | null;
  network: AggregatorNetwork;
  whbarAddr: `0x${string}` | undefined;
  resolvedOut: `0x${string}` | undefined;
}): boolean {
  if (!isSaucerNativeHbarDirectSwapEnabled()) return false;
  if (params.tokenOutSymbol.trim().toUpperCase() !== "HBAR") return false;
  const q = params.quote;
  if (!q || q.swapExecution !== "v1_amm" || q.quoteSource !== "router_v2") return false;
  if (!getV2RouterAddress(params.network)) return false;
  if (!params.whbarAddr || !params.resolvedOut) return false;
  return params.resolvedOut.toLowerCase() === params.whbarAddr.toLowerCase();
}
