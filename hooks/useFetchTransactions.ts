import { fetchTransactions } from "@/services/analysisServices";
import {
	ApiResponse,
	PaginationParams,
	Transaction,
} from "@/types/transaction";
import { useState, useEffect, useCallback } from "react";

const INITIAL_LIMIT = 20;

interface HookResult {
	data: Transaction[];
	isLoading: boolean;
	pagination: {
		pageIndex: number; // Tương đương với page - 1
		pageSize: number; // Limit
		totalPages: number;
		totalRecords: number; // Total
	};
	setPageIndex: (page: number) => void;
	setPageSize: (size: number) => void;
	refetch: () => void;
}

export const useFetchTransactions = (): HookResult => {
	const [data, setData] = useState<Transaction[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [pageIndex, setPageIndex] = useState(0); // 0-indexed page
	const [pageSize, setPageSize] = useState(INITIAL_LIMIT);
	const [totalRecords, setTotalRecords] = useState(0);
	const [totalPages, setTotalPages] = useState(0);

	// 1. Hàm chính để fetch dữ liệu
	const fetchData = useCallback(
		async (currentPage: number, currentLimit: number) => {
			setIsLoading(true);
			try {
				// API yêu cầu page là 1-indexed, nên ta cộng 1
				const params: PaginationParams = {
					page: currentPage + 1,
					limit: currentLimit,
				};

				const result: ApiResponse = await fetchTransactions(params);

				setData(result.transactions);
				setTotalRecords(result.total);
				setTotalPages(result.totalPages);
			} catch (e) {
				console.error("Failed to load transaction data:", e);
				setData([]);
			} finally {
				setIsLoading(false);
			}
		},
		[]
	);

	// 2. useEffect để kích hoạt fetch data khi params thay đổi
	useEffect(() => {
		fetchData(pageIndex, pageSize);
	}, [pageIndex, pageSize, fetchData]);

	// 3. Hàm refetch thủ công
	const refetch = useCallback(() => {
		fetchData(pageIndex, pageSize);
	}, [pageIndex, pageSize, fetchData]);

	// 4. Các hàm điều khiển pagination
	const handleSetPageIndex = useCallback((page: number) => {
		setPageIndex(page);
	}, []);

	const handleSetPageSize = useCallback((size: number) => {
		setPageSize(size);
		setPageIndex(0); // Reset về trang 1 khi thay đổi size
	}, []);

	return {
		data,
		isLoading,
		pagination: {
			pageIndex,
			pageSize,
			totalPages,
			totalRecords,
		},
		setPageIndex: handleSetPageIndex,
		setPageSize: handleSetPageSize,
		refetch,
	};
};
