import api from "@/axios/axiosInstance";
import { TrendAnalysisParams, TrendAnalysisResponse } from "@/types";
import { TokenPriceData } from "@/types/token";
import { ApiResponse, PaginationParams, TopTrader } from "@/types/transaction";

const BASE_ANALYSIS_API = "/tokens";

export interface TokensParams {
	query?: string;
	limit: number;
	offset: number;
	chain?: string;
}


export const getListToken = async (
	params: TokensParams
): Promise<{ page: number; tokens: TokenPriceData[]; total: number }> => {
	try {
		const response = await api.get(BASE_ANALYSIS_API, { params });
		return response.data;
	} catch (error) {
		console.error("Lỗi khi gọi API Swap:", error);
		throw error;
	}
};

const BASE_TRANSACTION_URL = "/swaps";

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

const BASE_TOPTRADERS_URL = "/toptraders";

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

// API lấy danh sách pairs từ /analysis/charting/pairs
const BASE_CHARTING_PAIRS_URL = "/analysis/charting/pairs";

export interface ChartingPairsParams {
	query?: string;
	limit?: number;
	offset?: number;
}

export const getChartingPairs = async (
	params?: ChartingPairsParams
): Promise<{ page: number; tokens: TokenPriceData[]; total: number }> => {
	try {
		const response = await api.get(BASE_CHARTING_PAIRS_URL, { params });
		return response.data;
	} catch (error) {
		console.error(error);
		throw error;
	}
};

export const getTrendAnalysisServer = async (timeframe: string = '1d'): Promise<TrendAnalysisResponse> => {
  const res = await fetch(`https://api.seerbot.io/analysis/trend?timeframe=${timeframe}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    next: { revalidate: 60 }
  });

  if (!res.ok) {
    throw new Error('Failed to fetch trends');
  }

  return res.json();
};