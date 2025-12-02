import { SwapQuote } from "@/hooks/useSwapLogic";

export interface MinswapEstimate {
  amount: string; // Số lượng vào
  token_in: string; // Token ID vào
  token_out: string; // Token ID ra
  slippage: number; // Độ trượt giá (ví dụ: 0.01)
  include_protocols?: string[]; // Ví dụ: ["MinswapV2"]
  exclude_protocols?: string[];
  allow_multi_hops?: boolean;
  partner?: string; // Tùy chọn
  // ... có thể có các trường khác từ API Quote
}

export interface BuildTxBody {
    sender: string; 
    min_amount_out: string; 
    estimate: SwapQuote; // ✨ Estimate là toàn bộ đối tượng SwapQuote
    inputs_to_choose: string[]; 
    amount_in_decimal: boolean; 
}


export interface MinswapAssetDetails {
    token_id: string; // PolicyID + AssetName Hex
    logo: string;     // URL Logo
    ticker: string;   // Ví dụ: MIN, SNEK
    is_verified: boolean;
    price_by_ada: number; // Giá trị tính theo ADA
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