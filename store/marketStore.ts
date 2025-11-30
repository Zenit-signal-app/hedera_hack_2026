/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from "zustand";

interface TokenPriceData {
	[key: string]: any;
}

interface MarketState {
	prices: {
		ohlc: Record<string, TokenPriceData>;
		token_info: Record<string, TokenPriceData>;
	};
}

interface MarketActions {
	updatePrices: (
		updates: Record<string, TokenPriceData>,
		type: "ohlc" | "token_info"
	) => void;
}

// Tạo Store
export const useMarketStore = create<MarketState & MarketActions>((set) => ({
	prices: {
		ohlc: {},
		token_info: {},
	},

	updatePrices: (updates, type) => {
		set((state) => ({
			prices: {
				...state.prices,
				[type]: {
					...state.prices[type],
					...updates,
				},
			},
		}));
	},
}));
