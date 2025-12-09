/* eslint-disable @typescript-eslint/no-explicit-any */
import { MinswapEstimate } from "@/types/minswap";
import { TokenPriceData } from "@/types/token";
import { create } from "zustand";


interface MarketState {
	listToken: TokenPriceData[];
	token: TokenPriceData;
	quoteAsset: "USDM" | "ADA";
	estimateDetail: MinswapEstimate | null;
	quoteToken: TokenPriceData;
}

interface MarketActions {
	updateListToken: (updates: TokenPriceData[]) => void;
	handleSelectToken: (token: TokenPriceData) => void;
	handleSelectQuoteAsset: (quote: "USDM" | "ADA") => void;
	handleSetEstimateDetail: (detail: MinswapEstimate) => void;
	handleSelectQuoteToken: (quote: TokenPriceData) => void;
}

export const INITIAL_ADA = {
	id: "lovelace",
	name: "Cardano",
	symbol: "ADA",
	logo_url: "/images/ada.png",
	price: 2.275426,
	change_24h: 0.038026,
	low_24h: 2.236817,
	high_24h: 2.288063,
	volume_24h: 4548.25782,
	market_cap: 102394187052.0219,
};

export const INITIAL_USDM = {
	id: "c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d",
	name: "USDM",
	symbol: "USDM",
	logo_url:
		"https://asset-logos.minswap.org/c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d",
	price: 1,
	change_24h: 0,
	low_24h: 0.983032,
	high_24h: 1.005553,
	volume_24h: 1998.859582,
	market_cap: 32340721.681006,
};
export const useTokenStore = create<MarketState & MarketActions>((set) => ({
	listToken: [],
	token: INITIAL_ADA,
	quoteToken: INITIAL_USDM,
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
		set((state) => ({
			...state,
			quoteAsset,
		}));
	},
	handleSelectQuoteToken: (quoteToken) => {
		set((state) => ({
			...state,
			quoteToken,
		}));
	},
	handleSetEstimateDetail: (detail) => {
		set((state) => ({
			...state,
			estimateDetail: detail,
		}));
	},
}));
