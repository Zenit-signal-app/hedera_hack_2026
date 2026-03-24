/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import api from "@/axios/axiosInstance";

export interface ChartPair {
	symbol: string;
	description?: string;
	exchange?: string;
	full_name?: string;
	type?: string;
	[key: string]: any;
}

interface FetchChartPairsParams {
	query?: string;
	limit?: number;
	chain?: string;
}

export const useFetchChartPairs = () => {
	const [pairs, setPairs] = useState<ChartPair[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	const fetchPairs = useCallback(
		async (params: FetchChartPairsParams = {}) => {
			try {
				setIsLoading(true);
				setError(null);

				const queryParams: any = {
					limit: params.limit || 50,
				};

				if (params.query) {
					queryParams.query = params.query;
				}

				if (params.chain) {
					queryParams.chain = params.chain;
				}

				const response = await api.get(
					"/analysis/charting/pairs",
					{ params: queryParams }
				);

				if (response.data?.data) {
					setPairs(response.data.data);
				} else if (Array.isArray(response.data)) {
					setPairs(response.data);
				}

				return response.data?.data || response.data;
			} catch (err: any) {
				const errorMessage =
					err?.response?.data?.message ||
					err?.message ||
					"Failed to fetch chart pairs";
				setError(errorMessage);
				console.error("Error fetching chart pairs:", err);
				return null;
			} finally {
				setIsLoading(false);
			}
		},
		[]
	);

	// Search with debounce
	const searchPairs = useCallback(
		(query: string, limit: number = 50) => {
			if (searchTimeoutRef.current) {
				clearTimeout(searchTimeoutRef.current);
			}

			if (!query.trim()) {
				fetchPairs({ limit });
				return;
			}

			setIsLoading(true);
			searchTimeoutRef.current = setTimeout(() => {
				fetchPairs({ query: query.trim(), limit });
			}, 300);
		},
		[fetchPairs]
	);

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (searchTimeoutRef.current) {
				clearTimeout(searchTimeoutRef.current);
			}
		};
	}, []);

	return {
		pairs,
		isLoading,
		error,
		fetchPairs,
		searchPairs,
	};
};
