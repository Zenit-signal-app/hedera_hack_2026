import { AGGREGATOR_VENUES, encodeAdapterId } from "@/config/aggregator";
import type { AggregatorQuoteResult } from "@/lib/aggregatorQuote";

/** Không dùng làm bytes32 adapter id — hay nhầm với địa chỉ contract `UniswapV3SwapRouterAdapter`. */
function isLikelyEvmAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim());
}

/**
 * Ô "Adapter id" / env đôi khi dán nhầm **địa chỉ contract** → `encodeBytes32String("0xC720…")` ≠ id đã `setAdapter`.
 */
function sanitizeAdapterLabelInput(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (isLikelyEvmAddress(t)) return "";
  return t;
}

/**
 * `Exchange.setAdapter` cho UniswapV2LikeAdapter (SaucerSwap V1) — khớp `registerV2Adapter` / `.env` `ADAPTER_ID`.
 * Khi quote off-chain là V1 (`swapExecution === 'v1_amm'`) nhưng venue hint là `saucerswap_v2`, on-chain **phải** dùng id này
 * cùng `encodedPath = abi.encode(address[])`, không dùng adapter CLMM.
 */
export function getV1AdapterLabelForExchange(): string {
  const v = sanitizeAdapterLabelInput(import.meta.env.VITE_AGGREGATOR_V1_ADAPTER_ID?.trim() ?? "");
  return v || "saucerswap";
}

/**
 * Chọn `bytes32 adapterId` khớp **`adapterData`** từ quote:
 * - V2 CLMM: `saucerswap_v2` + `abi.encode(bytes path)`
 * - V1 AMM: `saucerswap` (hoặc env) + `abi.encode(address[])`
 */
export function resolveOnchainAdapterBytes32(input: {
  selectedVenueId: string;
  customAdapterLabel: string;
  quote: AggregatorQuoteResult | null;
}): `0x${string}` {
  const venue = AGGREGATOR_VENUES.find((v) => v.id === input.selectedVenueId);
  const defaultHint = venue?.adapterIdHint ?? input.selectedVenueId;
  const custom = sanitizeAdapterLabelInput(input.customAdapterLabel);
  const label = custom || defaultHint;

  if (input.selectedVenueId !== "saucerswap") {
    return encodeAdapterId(label);
  }

  const q = input.quote;
  if (!q || q.quoteSource !== "router_v2") {
    return encodeAdapterId(label);
  }
  /** Nếu thiếu field (version cũ), mặc định V1 — tránh rơi vào `encodeAdapterId` với hint/ô tùy chỉnh sai. */
  const exec = q.swapExecution ?? "v1_amm";
  if (exec === "v2_clmm") {
    return encodeAdapterId("saucerswap_v2");
  }
  if (exec === "v1_amm") {
    return encodeAdapterId(getV1AdapterLabelForExchange());
  }
  return encodeAdapterId(label);
}
