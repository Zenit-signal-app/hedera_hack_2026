import { getListToken } from "@/services/analysisServices";
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
	const [total, setTotal] = useState(0); // Tổng số bản ghi từ Server
	const [isLoading, setIsLoading] = useState(false);

	const { updateListToken } = useTokenStore();

	// 1. Tính toán logic canLoadMore
	// Chỉ load tiếp khi chưa loading VÀ số lượng hiện tại nhỏ hơn tổng số
	const canLoadMore = !isLoading && total > 0 && tokens.length < total;

	const fetchData = useCallback(
		async (currentOffset: number) => {
			// Lưu ý: Không check isLoading ở đây để tránh dependency loop trong useCallback
			// Việc check isLoading sẽ được thực hiện ở hàm gọi (loadMore) hoặc useEffect

			setIsLoading(true);

			try {
				const data = await getListToken({
					query,
					limit: INITIAL_LIMIT,
					offset: currentOffset,
				});

				// Giả sử API trả về { tokens: Token[], total: number }
				// Nếu API trả về tên khác (ví dụ totalRecords), hãy sửa lại ở đây
				const newTokens = data.tokens || [];
				const totalRecords = data.total || 0;

				setTokens((prev) =>
					currentOffset === 0 ? newTokens : [...prev, ...newTokens]
				);

				// Cập nhật vào Store (Zustand)
				updateListToken(newTokens);

				// Cập nhật tổng số bản ghi (QUAN TRỌNG để tính canLoadMore)
				setTotal(totalRecords);

				// Tính toán offset cho lần sau
				setOffset(currentOffset + INITIAL_LIMIT);
			} catch (e) {
				console.error("Failed to fetch tokens", e);
			} finally {
				setIsLoading(false);
			}
		},
		[query, updateListToken] // Dependencies tối thiểu
	);

	// 2. Reset và Fetch lần đầu khi Query thay đổi
	useEffect(() => {
		setTokens([]);
		setOffset(0);
		setTotal(0);
		// Gọi offset 0
		fetchData(0);
	}, [query, fetchData]);

	const loadMore = useCallback(() => {
		if (canLoadMore) {
			fetchData(offset);
		}
	}, [canLoadMore, offset, fetchData]);

	return { tokens, isLoading, canLoadMore, loadMore };
};
