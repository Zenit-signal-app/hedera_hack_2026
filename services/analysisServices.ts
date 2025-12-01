import api from "@/axios/axiosInstance";
import { ApiResponse, PaginationParams, TopTrader } from "@/types/transaction";

const BASE_ANALYSIS_API = "/analysis/tokens";

interface TokensParams {
	query?: string;
	limit: number;
	offset: number;
}
export type Token = {
	id: string;
	name: string;
	symbol: string;
	logo_url: string;
};

export const getListToken = async (
	params: TokensParams
): Promise<{ page: number; tokens: Token[]; total: number }> => {
	try {
		const response = await api.get(BASE_ANALYSIS_API, { params });
		return response.data;
	} catch (error) {
		console.error("Lỗi khi gọi API Swap:", error);
		throw error;
	}
};

const BASE_TRANSACTION_URL = "/analysis/swaps";

export const fetchTransactions = async (
	params: PaginationParams
): Promise<ApiResponse> => {
	try {
		const response = await api.get(BASE_TRANSACTION_URL, { params });
		return response.data as ApiResponse;
	} catch (error) {
		console.error("Lỗi khi gọi API Transactions:", error);
		throw error;
	}
};

const BASE_TOPTRADERS_URL = "/analysis/toptraders";

type TopTraderResponse = {
	total: number,
	page: number,
	traders: TopTrader[]
}
export const fetchTopTraders = async (
	params: PaginationParams
): Promise<TopTraderResponse> => {
	try {
		const response = await api.get(BASE_TOPTRADERS_URL, { params });
		return response.data as TopTraderResponse;
	} catch (error) {
		console.error("Lỗi khi gọi API Transactions:", error);
		throw error;
	}
};
