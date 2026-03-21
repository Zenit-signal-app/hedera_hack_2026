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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
