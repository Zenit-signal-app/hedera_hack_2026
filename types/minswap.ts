import { SwapQuote } from "@/hooks/useSwapLogic";
import { Utxo } from ".";

export interface MinswapEstimate {
  amount: string; // Số lượng vào
  token_in: string; // Token ID vào
  token_out: string; // Token ID ra
  slippage: number; // Độ trượt giá (ví dụ: 0.01)
  include_protocols?: string[]; // Ví dụ: ["MinswapV2"]
  exclude_protocols?: string[];
  allow_multi_hops?: boolean;
  partner?: string; // Tùy chọn
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