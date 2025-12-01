import api from "@/axios/axiosInstance";
import { SwapQuote } from "@/hooks/useSwapLogic";
import { BuildTxBody, MinswapBalanceItem, MinswapEstimate, MinswapWalletBalanceResponse } from "@/types/minswap";
import { Cardano } from '@cardano-sdk/core';

const MINSWAP_API_BASE = "https://agg-api.minswap.org/aggregator";

export const fetchQuote = async (
	base_asset: string,
	quote_asset: string,
	amount: string
): Promise<SwapQuote> => {
	const params = new URLSearchParams({
		base_asset,
		quote_asset,
		amount,
	});

	const response = await fetch(
		`${MINSWAP_API_BASE}/quote?${params.toString()}`
	);

	if (!response.ok) {
		const errorData = await response.json();
		throw new Error(errorData.message || "Lỗi khi lấy tỷ giá swap.");
	}

	const data = await response.json();
	return data as SwapQuote;
};
export const fetchEstimate = async (params: { 
    amount: string, 
    token_in: string, 
    token_out: string, 
    slippage: number 
}): Promise<SwapQuote> => { 
    

    const requestBody = {
        ...params,
        amount_in_decimal: true, 
        allow_multi_hops: true,
    };
    
    const response = await api.post(`${MINSWAP_API_BASE}/estimate`, requestBody);
    
    if (!response.data || !response.data.token_in) { // Kiểm tra data hợp lệ
        throw new Error('Lỗi khi lấy tỷ giá swap (Estimate).');
    }
    
    // ⚠️ Trả về toàn bộ data estimate vì nó sẽ được dùng trong Build-Tx
    return response.data as SwapQuote; 
};
export const buildTransaction = async (params: { 
    sender: string, 
    estimate: SwapQuote, 
    inputsToChoose: string[] 
}): Promise<{ cbor: string }> => {
    
    const minAmountOut = params.estimate.min_amount_out; 
    
    const requestBody: BuildTxBody = {
        sender: params.sender,
        min_amount_out: minAmountOut,
        estimate: params.estimate,
        inputs_to_choose: params.inputsToChoose,
        amount_in_decimal: true,
    };
    
    const response = await api.post(`${MINSWAP_API_BASE}/build-tx`, requestBody);
    
    if (!response.data || !response.data.cbor) {
        throw new Error('Lỗi xây dựng giao dịch từ Aggregator.');
    }
    // Trả về CBOR hex string của unsigned transaction
    return { cbor: response.data.cbor }; 
};

export const submitTransaction = async (
	txHex: string,
	witnessSet: string
): Promise<{ txHash: string }> => {
	const response = await fetch(`${MINSWAP_API_BASE}/submit-tx`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			tx_hex: txHex,
			witness_set: witnessSet, // Chữ ký
		}),
	});

	if (!response.ok) {
		const errorData = await response.json();
		throw new Error(errorData.message || "Giao dịch không được gửi.");
	}

	const data = await response.json();
	// Docs trả về txHash (string)
	return { txHash: data.txHash };
};


export const fetchMinswapBalance = async (walletAddress: string): Promise<MinswapBalanceItem[]> => {
    
    const response = await api.get(`${MINSWAP_API_BASE}/wallet`, {
        params: {
            address: walletAddress
        }
    });

    if (!response.data || !response.data.balance) {
        throw new Error('Không nhận được dữ liệu số dư hợp lệ từ Minswap.');
    }
    
    const data: MinswapWalletBalanceResponse = response.data;


    const nativeTokens = data.balance; 
    
    return nativeTokens
};