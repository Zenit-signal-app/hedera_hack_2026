/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import api from "@/axios/axiosInstance";

export interface SwapTransaction {
	fromToken: {
		tokenInfo: {
			symbol: string;
			name: string;
			decimals: number;
			address: string;
			logo_url: string;
		};
		amount: string;
	};
	toToken: {
		tokenInfo: {
			symbol: string;
			name: string;
			decimals: number;
			address: string;
			logo_url: string;
		};
		amount: string;
	};
	txn: string;
	timestamp: number;
}

export interface SwapResponse {
	data: SwapTransaction[];
	total: number;
	page: number;
}

interface UseFetchUserSwapsParams {
	walletAddress: string | null;
	page: number;
	limit: number;
	enabled?: boolean;
}

export const useFetchUserSwaps = ({
	walletAddress,
	page,
	limit,
	enabled = true,
}: UseFetchUserSwapsParams) => {
	const [swaps, setSwaps] = useState<SwapTransaction[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!enabled || !walletAddress) {
			setSwaps([]);
			setTotal(0);
			return;
		}

		const fetchSwaps = async () => {
			setIsLoading(true);
			setError(null);
			try {
				const response = await api.get<SwapResponse>(
					"/user/swaps",
					{
						params: {
							wallet_address: walletAddress,
							page,
							limit,
						},
					}
				);

				setSwaps(response.data.data || []);
				setTotal(response.data.total || 0);
			} catch (err : any) {
				setError(
					err.message || "Failed to fetch swap transactions"
				);
				setSwaps([]);
				setTotal(0);
			} finally {
				setIsLoading(false);
			}
		};

		fetchSwaps();
	}, [walletAddress, page, limit, enabled]);

	return {
		swaps,
		total,
		isLoading,
		error,
	};
};
