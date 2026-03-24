import { fetchTopTraders } from "@/services/analysisServices";
import {
  PaginationParams,
  TopTrader,
} from "@/types/transaction";
import { useState, useEffect, useCallback } from "react";

const INITIAL_LIMIT = 10;

interface HookResult {
  data: TopTrader[];
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

export const useFetchTopTraders = (pair?: string): HookResult => {
  const [data, setData] = useState<TopTrader[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(INITIAL_LIMIT);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const fetchData = useCallback(
    async (currentPage: number, currentLimit: number, currentPair?: string) => {
      setIsLoading(true);
      try {
        const params: PaginationParams = {
          page: currentPage + 1,
          limit: currentLimit,
          pair: currentPair,
        };

        const result = await fetchTopTraders(params);

        setData(result.traders);
        setTotalRecords(result.total);
        setTotalPages(Math.ceil(result.total / INITIAL_LIMIT));
      } catch (e) {
        setData([]);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setPageIndex(0); // Reset về trang đầu khi đổi pair
    fetchData(0, pageSize, pair);
  }, [pair, fetchData]);

  useEffect(() => {
    fetchData(pageIndex, pageSize, pair);
  }, [pageIndex, pageSize, fetchData]);

  const refetch = useCallback(() => {
    fetchData(pageIndex, pageSize, pair);
  }, [pageIndex, pageSize, pair, fetchData]);

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
