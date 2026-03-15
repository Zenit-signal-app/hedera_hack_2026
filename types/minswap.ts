/**
 * Legacy Minswap types — no longer used by the swap flow.
 * Kept for reference only.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MinswapEstimate {
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
  min_amount_out: string;
  total_lp_fee: string;
  total_dex_fee: string;
  deposits: string;
  avg_price_impact: number;
  paths: any[][];
  aggregator_fee: string;
  aggregator_fee_percent: number;
  amount_in_decimal: boolean;
}

export interface MinswapAssetDetails {
  token_id: string;
  logo: string;
  ticker: string;
  is_verified: boolean;
  price_by_ada: number;
  project_name: string;
  decimals: number;
}

export interface MinswapBalanceItem {
  asset: MinswapAssetDetails;
  amount: string;
}

export interface MinswapWalletBalanceResponse {
  wallet: string;
  ada: string;
  minimum_lovelace: string;
  balance: MinswapBalanceItem[];
  amount_in_decimal: boolean;
}

export interface MinswapTokensInfoResponse {
  tokens: MinswapAssetDetails[];
  search_after: any[];
}