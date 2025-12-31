import { getChartingPairs, getListToken } from "@/services/analysisServices";
import { useTokenStore } from "@/store/tokenStore";
import { TokenPriceData } from "@/types/token";
import { useState, useEffect, useCallback } from "react";

const INITIAL_LIMIT = 10;

interface TokenHookResult {
	tokens: TokenPriceData[];
	isLoading: boolean;
	canLoadMore: boolean;
	loadMore: () => void;
}
export const useTokenLoadMore = (query?: string): TokenHookResult => {
	const [tokens, setTokens] = useState<TokenPriceData[]>([]);
	const [offset, setOffset] = useState(0);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(false);

	const { updateListToken } = useTokenStore();

	const canLoadMore = !isLoading && total > 0 && tokens.length < total;

	const fetchData = useCallback(
		async (currentOffset: number) => {
			setIsLoading(true);

			try {
				const data = await getListToken({
					query,
					limit: INITIAL_LIMIT,
					offset: currentOffset,
				});

				const newTokens = data.tokens || [];
				const totalRecords = data.total || 0;

				setTokens((prev) =>
					currentOffset === 0 ? newTokens : [...prev, ...newTokens]
				);

				updateListToken(newTokens);

				setTotal(totalRecords);

				setOffset(currentOffset + INITIAL_LIMIT);
			} catch (e) {
				console.error("Failed to fetch tokens", e);
			} finally {
				setIsLoading(false);
			}
		},
		[query, updateListToken]
	);

	useEffect(() => {
		setTokens([]);
		setOffset(0);
		setTotal(0);
		fetchData(0);
	}, [query, fetchData]);

	const loadMore = useCallback(() => {
		if (canLoadMore) {
			fetchData(offset);
		}
	}, [canLoadMore, offset, fetchData]);

	return { tokens, isLoading, canLoadMore, loadMore };
};
