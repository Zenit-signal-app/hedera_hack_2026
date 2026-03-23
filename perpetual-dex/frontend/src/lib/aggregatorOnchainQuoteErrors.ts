/**
 * Chuẩn hoá lỗi `eth_call` tới QuoteAggregator / Exchange.quote — tránh dump JSON-RPC dài trên UI.
 * Selector custom error Solidity = 4 byte đầu của `keccak256("ErrorName(...)")`.
 */
import { id } from "ethers";

import type { AggregatorQuoteResult } from "@/lib/aggregatorQuote";

/** 0x + 8 hex (4 byte) */
function selectorOf(sig: string): string {
  return id(sig).slice(0, 10).toLowerCase();
}

const _KNOWN: Record<string, string> = {
  [selectorOf("QuoterCallFailed()")]:
    "Exchange.quote (saucerswap_v2 adapter): QuoterV2 reverted — often wrong fee tier (try 100/500/1500/3000/10000), packed path, or RPC. UI price may still come from off-chain quote (V1/V2 routers). 0xdb8fe633 = QuoterCallFailed on the Zenit adapter, not the Quoter function selector.",
  [selectorOf("InvalidPath()")]:
    "Adapter: invalid `adapterData` — V2 path too short or end tokens do not match `tokenIn`/`tokenOut`.",
  [selectorOf("OnlyExchange()")]:
    "Only Exchange may call the adapter (unexpected for `quote`).",
  [selectorOf("InvalidFeeBps()")]: "Invalid adapter fee (bps).",
  [selectorOf("AdapterNotActive(bytes32)")]:
    "Adapter not `setAdapter` or `active = false` — check `saucerswap` / `saucerswap_v2` id on the Exchange contract.",
  [selectorOf("InvalidAddress()")]: "Invalid address parameter (swap/quote).",
  [selectorOf("InvalidAmount()")]: "amountIn is zero or invalid.",
  [selectorOf("Expired()")]: "Deadline passed (usually swap, not static quote).",
  [selectorOf("SwapTooSmall(uint256,uint256)")]: "amountOut below minAmountOut (swap, not static quote).",
  [selectorOf("PathTooShort()")]: "V3 path too short (path library).",
};

export const KNOWN_ONCHAIN_QUOTE_ERROR_SELECTORS = _KNOWN;

/** Selector 4 byte của `QuoterCallFailed()` (adapter Zenit). */
export const QUOTER_CALL_FAILED_ERROR_SELECTOR = selectorOf("QuoterCallFailed()");

function revertSelectorFromError(err: unknown): string | null {
  const data = extractRevertData(err);
  if (data && data.length >= 10) return data.slice(0, 10).toLowerCase();
  return null;
}

export function isQuoterCallFailedRevert(err: unknown): boolean {
  return revertSelectorFromError(err) === QUOTER_CALL_FAILED_ERROR_SELECTOR;
}

/**
 * Có giá khả dụng từ router off-chain (không phụ thuộc chỉ `expectedOutWei` — tránh lệch serialize / edge case).
 */
function hasUsableOffChainPrice(q: AggregatorQuoteResult): boolean {
  if (q.expectedOutWei != null) return true;
  const h = q.expectedOutHuman;
  return typeof h === "string" && h.trim().length > 0;
}

/**
 * Khi đã có giá off-chain (`router_v2` hoặc `mock`), **không** hiển thị ô lỗi on-chain — chỉ ghi chú xám (`onchainSoftNote`).
 * On-chain `Exchange.quote` là tuỳ chọn; revert không chặn tỷ giá hiển thị.
 */
export function shouldSuppressOnchainQuoteErrorUi(
  _err: unknown,
  offChainQuote: AggregatorQuoteResult | undefined,
): boolean {
  if (!offChainQuote) return false;
  if (offChainQuote.quoteSource !== "router_v2" && offChainQuote.quoteSource !== "mock") return false;
  return hasUsableOffChainPrice(offChainQuote);
}

function extractRevertData(err: unknown): string | null {
  const tryData = (x: unknown): string | null => {
    if (typeof x === "string" && x.startsWith("0x")) {
      /** `0x` only = bare revert; custom errors need ≥4 bytes → length ≥ 10 */
      if (x.length === 2 || x.length >= 10) return x;
    }
    return null;
  };
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const fromObj =
      tryData(e.data) ??
      tryData((e as { error?: { data?: unknown } }).error?.data) ??
      tryData((e as { info?: { error?: { data?: unknown } } }).info?.error?.data) ??
      tryData((e as { payload?: { data?: unknown } }).payload?.data);
    if (fromObj) return fromObj;
  }
  const msg = err instanceof Error ? err.message : String(err);
  /** Khớp cả `data="0x"` (revert không reason). */
  const m = msg.match(/data="(0x[a-fA-F0-9]*)"/);
  if (m?.[1]) return m[1];
  return null;
}

/** Revert không payload (require(false), panic, hoặc pool/router revert nội bộ). */
export function isBareRevert(err: unknown): boolean {
  const data = extractRevertData(err);
  if (data === "0x") return true;
  const msg = err instanceof Error ? err.message : String(err);
  if (/no data present|require\s*\(\s*false\s*\)|data="0x"/i.test(msg)) return true;
  return false;
}

/** Cắt bỏ khối `transaction={...}` từ ethers để log gọn. */
export function shortenEthersErrorMessage(msg: string): string {
  return msg
    .replace(/\s*transaction=\{[^}]*\}\s*/g, " ")
    .replace(/\s*invocation=\{[^}]*\}\s*/g, " ")
    .replace(/\s*revert=\{[^}]*\}\s*/g, " ")
    .replace(/\s*code=\w+\s*version=[\d.]+\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
}

/**
 * Trả về thông báo ngắn cho UI; kèm selector hex nếu không khớp whitelist (để debug).
 */
export function humanizeOnchainQuoteError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const data = extractRevertData(err);
  if (data === "0x") {
    return (
      "On-chain quote reverted with no data (data=0x). Common causes: (1) adapter not setAdapter / wrong bytes32 id, " +
      "(2) adapter router has no pool for path (getAmountsOut reverts), (3) wrong VITE_AGGREGATOR_QUOTE_CONTRACT, " +
      "(4) Hashio RPC. Off-chain router price (if any) can still be used to view the rate."
    );
  }
  if (data && data.length >= 10) {
    const sel = data.slice(0, 10).toLowerCase();
    const hint = _KNOWN[sel];
    if (hint) {
      /** Không lặp mã selector trong chuỗi QuoterCallFailed (đã nhắc 0xdb8fe633). */
      if (sel === selectorOf("QuoterCallFailed()")) return hint;
      return `${hint} (selector ${sel})`;
    }
    return `Revert on-chain (custom error ${sel}). ${shortenEthersErrorMessage(raw)}`;
  }
  return shortenEthersErrorMessage(raw) || "On-chain quote failed.";
}
