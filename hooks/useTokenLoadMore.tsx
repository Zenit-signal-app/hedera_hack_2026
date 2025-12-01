import { getListToken, Token } from "@/services/analysisServices";
import { useTokenStore } from "@/store/tokenStore";
import { useState, useEffect, useCallback } from "react";

const INITIAL_LIMIT = 10;

interface TokenHookResult {
	tokens: Token[];
	isLoading: boolean;
	// canLoadMore: boolean;
	// loadMore: () => void;
}

export const useTokenLoadMore = (query?: string): TokenHookResult => {
	const [tokens, setTokens] = useState<Token[]>([]);
	const [offset, setOffset] = useState(0);
	// const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const { updateListToken } = useTokenStore();

	const fetchData = useCallback(
		async (currentOffset: number) => {
			if (isLoading) return;

			setIsLoading(true);

			try {
				const data = await getListToken({
					query,
					limit: INITIAL_LIMIT,
					offset: currentOffset,
				});

				setTokens((prev) =>
					currentOffset === 0
						? data.tokens
						: [...prev, ...data.tokens]
				);

				updateListToken(data.tokens);
				// setTotal(data.length + 5);

				if (currentOffset !== 0) {
					setOffset(currentOffset + INITIAL_LIMIT);
				} else {
					setOffset(INITIAL_LIMIT);
				}
			} catch (e) {
				console.error("Failed to fetch tokens", e);
			} finally {
				setIsLoading(false);
			}
		},
		[query]
	);

	useEffect(() => {
		setTokens([]);
		setOffset(0);
		// setTotal(0);
		fetchData(0);
	}, [query, fetchData]);

	// const loadMore = useCallback(() => {
	// 	if (canLoadMore) {
	// 		fetchData(offset);
	// 	}
	// }, [canLoadMore, offset, fetchData]);

	return { tokens, isLoading };
};
