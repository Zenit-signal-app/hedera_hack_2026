/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import api from "@/axios/axiosInstance";
import { getServerChainId } from "@/services/chainServices";

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
	walletAddress: string | null | undefined;
	page: number;
	limit: number;
	enabled?: boolean;
	chain_id?: string;
}

export const useFetchUserSwaps = ({
	walletAddress,
	page,
	limit,
	enabled = true,
	chain_id,
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
				const serverChainId = chain_id ? await getServerChainId(chain_id) : undefined;
				const response = await api.get<SwapResponse>("/swaps", {
					params: {
						wallet_address: walletAddress,
						page,
						limit,
						chain_id: serverChainId,
					},
				});

				setSwaps(response.data.data || []);
				setTotal(response.data.total || 0);
			} catch (err: any) {
				setError(err.message || "Failed to fetch swap transactions");
				setSwaps([]);
				setTotal(0);
			} finally {
				setIsLoading(false);
			}
		};

		fetchSwaps();
	}, [walletAddress, page, limit, enabled, chain_id]);

	return {
		swaps,
		total,
		isLoading,
		error,
	};
};
