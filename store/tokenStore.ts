/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from "zustand";

interface TokenPriceData {
	id: string;
	name: string;
	symbol: string;
	logo_url: string;
}
interface MarketState {
	listToken: TokenPriceData[];
	token: string;
}

interface MarketActions {
	updateListToken: (updates: TokenPriceData[]) => void;
	handleSelectToken: (token: string) => void;
}

// Tạo Store
export const useTokenStore = create<MarketState & MarketActions>((set) => ({
	listToken: [],
	token: "SNEK_ada",
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
}));
