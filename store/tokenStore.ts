/* eslint-disable @typescript-eslint/no-explicit-any */
import { MinswapEstimate } from "@/types/minswap";
import { create } from "zustand";

interface TokenPriceData {
	id: string;
	name: string;
	symbol: string;
	logo_url: string;
}
interface MarketState {
	listToken: TokenPriceData[];
	token: TokenPriceData;
	quoteAsset: "USDM" | "ADA"
	estimateDetail: MinswapEstimate | null
}

interface MarketActions {
	updateListToken: (updates: TokenPriceData[]) => void;
	handleSelectToken: (token: TokenPriceData) => void;
	handleSelectQuoteAsset: (quote: "USDM" | "ADA") => void;
	handleSetEstimateDetail: (detail: MinswapEstimate) => void
}

// Tạo Store
export const useTokenStore = create<MarketState & MarketActions>((set) => ({
	listToken: [],
	token: {
		id: "c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d",
		logo_url:
			"https://asset-logos.minswap.org/c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d",
		name: "ADA",
		symbol: "USDM",
	},
	estimateDetail: null,
	quoteAsset: "USDM",
	updateListToken: (updates) => {
		set((state) => ({
			listToken: [...state.listToken, ...updates],
		}));
	},
	handleSelectToken: (updates) => {
		set(() => ({
			token: updates,
		}));
	},
	handleSelectQuoteAsset: (quoteAsset) => {
		set(() => ({
			quoteAsset,
		}));
	},
	handleSetEstimateDetail: (detail) => {
		set((state) => ({
			...state,
			estimateDetail: detail,
			
		}));
	},
}));
