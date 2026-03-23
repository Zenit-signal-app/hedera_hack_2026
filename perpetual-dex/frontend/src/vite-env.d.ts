/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PERP_DEX_ADDRESS?: string;
  readonly VITE_DEX_ADDRESS?: string;
  readonly VITE_TOKEN_ADDRESS?: string;
  readonly VITE_REWARD_ADDRESS?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  /** Onramper hosted widget (https://buy.onramper.com) — optional */
  readonly VITE_ONRAMPER_API_KEY?: string;
  readonly VITE_STAKING_ADDRESS?: string;
  /**
   * Hedera EVM chain for wagmi + HashPack WalletConnect: `testnet` (296) | `mainnet` (295).
   * Align with `VITE_AGGREGATOR_NETWORK` when using on-chain quotes.
   */
  readonly VITE_HEDERA_EVM_NETWORK?: string;
  /** Optional RPC overrides (defaults: Hashio testnet/mainnet) */
  readonly VITE_HEDERA_TESTNET_RPC_URL?: string;
  readonly VITE_HEDERA_MAINNET_RPC_URL?: string;
  /** Mirror REST base, e.g. `https://mainnet.mirrornode.hedera.com` — overrides network default */
  readonly VITE_HEDERA_MIRROR_REST?: string;
  /** Aggregator UI target: `testnet` | `mainnet` (quote mock; chain 296 / 295) */
  readonly VITE_AGGREGATOR_NETWORK?: string;
  /** Mirror REST: số trang tối đa khi lấy PairCreated (1–60). Mặc định 6 — tăng nếu cần đủ pool cũ. */
  readonly VITE_AGGREGATOR_MIRROR_MAX_PAGES?: string;
  /** Thời gian tối đa chờ Mirror (ms) trước khi bỏ qua đồ thị — mặc định 2800. */
  readonly VITE_AGGREGATOR_MIRROR_MAX_WAIT_MS?: string;
  /** Ngân sách mục tiêu cho toàn bộ quote + route UI (ms) — mặc định 6000. */
  readonly VITE_AGGREGATOR_QUOTE_BUDGET_MS?: string;
  /** Timeout gọi Quoter V2 CLMM (ms) — mặc định 3200. */
  readonly VITE_AGGREGATOR_V2_QUOTE_MAX_WAIT_MS?: string;
  /** `1`/`true`: nếu router thật fail vẫn fallback mock (demo). Mặc định: báo lỗi rõ. */
  readonly VITE_AGGREGATOR_ALLOW_MOCK_ON_ROUTER_FAIL?: string;
  /** Deployed `Exchange` or `QuoteAggregator` (EVM) for on-chain `quote` */
  readonly VITE_AGGREGATOR_QUOTE_CONTRACT?: string;
  /** Deployed `Exchange` only — required for on-chain **swap** (approve + `swap`). */
  readonly VITE_AGGREGATOR_EXCHANGE_CONTRACT?: string;
  /**
   * `0` / `false`: tắt swap native HBAR qua SaucerSwap V1 `swapExactETHForTokens*` + msg.value.
   * Mặc định bật — dùng wrap WHBAR + Exchange khi tắt.
   */
  readonly VITE_AGGREGATOR_USE_SAUCE_NATIVE_HBAR_SWAP?: string;
  /** `supporting` — `swapExactETHForTokensSupportingFeeOnTransferTokens`. Mặc định: `swapExactETHForTokens`. */
  readonly VITE_AGGREGATOR_HBAR_TO_TOKEN_SWAP_FN?: string;
  /** `Exchange.setAdapter` id cho UniswapV2LikeAdapter (V1) — mặc định `saucerswap`; khớp on-chain quote khi `swapExecution === 'v1_amm'`. */
  readonly VITE_AGGREGATOR_V1_ADAPTER_ID?: string;
  /**
   * Router Uniswap V2–style (`getAmountsOut`) — mặc định SaucerSwap V1 RouterV3 mainnet.
   * Alias: `VITE_SAUCERSWAP_V1_ROUTER_MAINNET`.
   */
  readonly VITE_AGGREGATOR_V2_ROUTER_MAINNET?: string;
  readonly VITE_AGGREGATOR_V2_ROUTER_TESTNET?: string;
  readonly VITE_SAUCERSWAP_V1_ROUTER_MAINNET?: string;
  /** SaucerSwap V2 QuoterV2 mainnet — quote CLMM (mặc định entity 0.0.3949424). */
  readonly VITE_SAUCERSWAP_V2_QUOTER_MAINNET?: string;
  /** SaucerSwap V2 QuoterV2 testnet (mặc định entity 0.0.1390002). */
  readonly VITE_SAUCERSWAP_V2_QUOTER_TESTNET?: string;
  /** SaucerSwap V2 Factory mainnet — getPool (mặc định entity 0.0.3946833). */
  readonly VITE_SAUCERSWAP_V2_FACTORY_MAINNET?: string;
  readonly VITE_SAUCERSWAP_V2_FACTORY_TESTNET?: string;
  /** SaucerSwap V2 SwapRouter mainnet — `exactInput` (mặc định entity 0.0.3949434). */
  readonly VITE_SAUCERSWAP_V2_SWAP_ROUTER_MAINNET?: string;
  readonly VITE_SAUCERSWAP_V2_SWAP_ROUTER_TESTNET?: string;
  /** SaucerSwap V1 Factory — Mirror `PairCreated` (entity 0.0.1062784). */
  readonly VITE_SAUCERSWAP_V1_FACTORY_EVM_MAINNET?: string;
  readonly VITE_SAUCERSWAP_V1_FACTORY_EVM_TESTNET?: string;
  /** @deprecated Dùng `VITE_SAUCERSWAP_V1_FACTORY_EVM_*` */
  readonly VITE_HELISWAP_FACTORY_EVM_MAINNET?: string;
  readonly VITE_HELISWAP_FACTORY_EVM_TESTNET?: string;
  /** Optional: backend stats JSON. Example: `https://api.example.com/v1/aggregator/stats` */
  readonly VITE_AGGREGATOR_STATS_URL?: string;
  /** Optional ERC-20 (HTS facade) addresses for aggregator quotes — testnet */
  readonly VITE_AGGREGATOR_TOKEN_USDC?: string;
  readonly VITE_AGGREGATOR_TOKEN_WHBAR?: string;
  /** Optional — mainnet token overrides */
  readonly VITE_AGGREGATOR_TOKEN_USDC_MAINNET?: string;
  readonly VITE_AGGREGATOR_TOKEN_WHBAR_MAINNET?: string;
  /** SAUCE / xSAUCE (optional — mainnet có mặc định entity trong `resolveTokenAddressForAggregator`) */
  readonly VITE_AGGREGATOR_TOKEN_SAUCE?: string;
  readonly VITE_AGGREGATOR_TOKEN_SAUCE_MAINNET?: string;
  readonly VITE_AGGREGATOR_TOKEN_XSAUCE?: string;
  readonly VITE_AGGREGATOR_TOKEN_XSAUCE_MAINNET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
