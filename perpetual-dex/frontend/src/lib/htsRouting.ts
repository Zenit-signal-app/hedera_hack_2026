/**
 * Native HTS routing (như một số flow trên app SaucerSwap) ≠ routing EVM trong Zenit.
 * Repo chỉ quote/execute qua ERC-20 facade + router — xem docs/AGGREGATOR_HTS.md.
 */

/** Một dòng gắn vào kết quả quote (router_v2). */
export const HTS_ROUTING_NOTE_SHORT =
  "The SaucerSwap app may optimize further via native HTS — Zenit currently routes only on Hedera EVM (V1 + QuoterV2 CLMM).";

/** Expanded panel title on the Aggregate UI. */
export const HTS_ROUTING_PANEL_TITLE = "Native HTS vs EVM routing (Zenit)";

/** Short bullets for <details>. */
export const HTS_ROUTING_PANEL_BULLETS: readonly string[] = [
  "Zenit quotes and swaps via Hedera EVM (SaucerSwap V1/V2 routers, adapters on the Exchange contract).",
  "Pure HTS routing (associate, 0.0.x entities, batch SDK, …) like some Hedera apps is not included unless you add integration (API/indexer/dedicated adapter).",
  "Details and roadmap: docs/AGGREGATOR_HTS.md in the perpetual-dex repo.",
];
