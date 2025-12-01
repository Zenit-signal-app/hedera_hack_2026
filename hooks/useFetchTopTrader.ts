import { fetchTopTraders } from "@/services/analysisServices";
import {
  ApiResponse,
  PaginationParams,
  TopTrader,
  Transaction,
} from "@/types/transaction";
import { useState, useEffect, useCallback } from "react";

const INITIAL_LIMIT = 20;

interface HookResult {
  data: Transaction[];
  isLoading: boolean;
  pagination: {
    pageIndex: number;
    pageSize: number; 
    totalPages: number;
    totalRecords: number; 
  };
  setPageIndex: (page: number) => void;
  setPageSize: (size: number) => void;
  refetch: () => void;
}

export const useFetchTopTraders = (): HookResult => {
  const [data, setData] = useState<TopTrader[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(INITIAL_LIMIT);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const fetchData = useCallback(
    async (currentPage: number, currentLimit: number) => {
      setIsLoading(true);
      try {
        const params: PaginationParams = {
          page: currentPage + 1,
          limit: currentLimit,
        };

        const result: ApiResponse = await fetchTopTraders(params);

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

  useEffect(() => {
    fetchData(pageIndex, pageSize);
  }, [pageIndex, pageSize, fetchData]);

  const refetch = useCallback(() => {
    fetchData(pageIndex, pageSize);
  }, [pageIndex, pageSize, fetchData]);

  const handleSetPageIndex = useCallback((page: number) => {
    setPageIndex(page);
  }, []);

  const handleSetPageSize = useCallback((size: number) => {
    setPageSize(size);
    setPageIndex(0);
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
