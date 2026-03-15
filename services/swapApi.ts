/**
 * Legacy Minswap swap API — no longer used by the multi-chain swap flow.
 * Kept for reference. The active swap service is chainSwapService.ts.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import api from "@/axios/axiosInstance";
import {
	MinswapBalanceItem,
	MinswapTokensInfoResponse,
	MinswapWalletBalanceResponse,
} from "@/types/minswap";

/** Legacy quote type used by the old Minswap integration */
type SwapQuote = any;

const MINSWAP_API_BASE = "https://agg-api.minswap.org/aggregator";

const TOKEN_INFO_TTL_MS = 30_000;
const WALLET_BALANCE_TTL_MS = 60_000; // Increased from 15s to 60s since balance is now persisted
const tokenInfoCache = new Map<
	string,
	{ data: MinswapTokensInfoResponse; expiresAt: number }
>();
const tokenInfoInflight = new Map<
	string,
	Promise<MinswapTokensInfoResponse>
>();
const walletBalanceCache = new Map<
	string,
	{ data: MinswapBalanceItem[]; expiresAt: number }
>();
const walletBalanceInflight = new Map<
	string,
	Promise<MinswapBalanceItem[]>
>();

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
	amount: string;
	token_in: string;
	token_out: string;
	slippage: number;
}): Promise<SwapQuote> => {
	const requestBody = {
		...params,
		amount_in_decimal: true,
		allow_multi_hops: true,
	};

	const response = await api.post(
		`${MINSWAP_API_BASE}/estimate`,
		requestBody
	);

	if (!response.data || !response.data.token_in) {
		// Kiểm tra data hợp lệ
		throw new Error("Lỗi khi lấy tỷ giá swap (Estimate).");
	}

	return response.data as SwapQuote;
};

export const fetchMinswapBalance = async (
	walletAddress: string
): Promise<MinswapBalanceItem[]> => {
	const cacheKey = walletAddress;
	const cached = walletBalanceCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.data;
	}

	const inflight = walletBalanceInflight.get(cacheKey);
	if (inflight) {
		return inflight;
	}

	const request = (async () => {
		const response = await api.get(`${MINSWAP_API_BASE}/wallet`, {
			params: {
				address: walletAddress,
			},
		});

		if (!response.data || !response.data.balance) {
			throw new Error(
				"Không nhận được dữ liệu số dư hợp lệ từ Minswap."
			);
		}

		const data: MinswapWalletBalanceResponse = response.data;
		const nativeTokens = data.balance;
		walletBalanceCache.set(cacheKey, {
			data: nativeTokens,
			expiresAt: Date.now() + WALLET_BALANCE_TTL_MS,
		});
		return nativeTokens;
	})();

	walletBalanceInflight.set(cacheKey, request);

	try {
		return await request;
	} finally {
		walletBalanceInflight.delete(cacheKey);
	}
};

type ParamsTokenInfo = {
	query: string;
	only_verified: boolean;
	assets: string[];
};

export const fetchMinswapTokenInfo = async (
	params: ParamsTokenInfo
): Promise<MinswapTokensInfoResponse> => {
	const cacheKey = `${params.query}|${params.only_verified}|${
		params.assets?.join(",") || ""
	}`;
	const cached = tokenInfoCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.data;
	}

	const inflight = tokenInfoInflight.get(cacheKey);
	if (inflight) {
		return inflight;
	}

	const request = (async () => {
		const response = await api.post(`${MINSWAP_API_BASE}/tokens`, params);
		if (!response.data) {
			throw new Error(
				"Không nhận được dữ liệu token từ Minswap."
			);
		}

		const data = response.data as MinswapTokensInfoResponse;
		tokenInfoCache.set(cacheKey, {
			data,
			expiresAt: Date.now() + TOKEN_INFO_TTL_MS,
		});
		return data;
	})();

	tokenInfoInflight.set(cacheKey, request);

	try {
		return await request;
	} finally {
		tokenInfoInflight.delete(cacheKey);
	}
};
