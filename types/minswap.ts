/* eslint-disable @typescript-eslint/no-explicit-any */
import { SwapQuote } from "@/hooks/useSwapLogic";
import { Utxo } from ".";

export interface SwapPathStep {
  pool_id: string;
  protocol: string; // Ví dụ: "MinswapV2", "WingRiders", v.v.
  lp_token: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
  min_amount_out: string;
  lp_fee: string;
  dex_fee: string;
  deposits: string; // Phí đặt cọc (Lovelace)
  price_impact: number; // Ví dụ: 0.1 (10%) hoặc 0.01 (1%)
}
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
  paths: SwapPathStep[][]; 
  
  aggregator_fee: string;
  aggregator_fee_percent: number;
  amount_in_decimal: boolean;
}

export interface BuildTxBody {
    sender: string; 
    min_amount_out: string; 
    estimate: SwapQuote;
    inputs_to_choose: Utxo[]; 
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
    amount: string; // Số lượng token (thường là Lovelace hoặc số lượng nguyên)
}

export interface MinswapWalletBalanceResponse {
    wallet: string; // Địa chỉ ví Bech32
    ada: string; // Số lượng Lovelace (ví dụ: "5000000")
    minimum_lovelace: string;
    balance: MinswapBalanceItem[]; // Danh sách các token khác ADA
    amount_in_decimal: boolean;
}

export interface MinswapTokensInfoResponse {
    tokens: MinswapAssetDetails[],
    search_after: any[]
}