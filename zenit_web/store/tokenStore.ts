/* eslint-disable @typescript-eslint/no-explicit-any */
import { TokenPriceData } from "@/types/token";
import { SwapQuoteResult } from "@/services/chainSwapService";
import { create } from "zustand";

interface MarketState {
	listToken: TokenPriceData[];
	token: TokenPriceData;
	quoteToken: TokenPriceData;
	estimateDetail: SwapQuoteResult | null;
}

interface MarketActions {
	updateListToken: (updates: TokenPriceData[]) => void;
	handleSelectToken: (token: TokenPriceData) => void;
	handleSetEstimateDetail: (detail: SwapQuoteResult | null) => void;
	handleSelectQuoteToken: (quote: TokenPriceData) => void;
	setDefaultsForChain: (chainId: string) => void;
}

// ─── Per-chain default tokens ──────────────────────────────────────────────────

export const INITIAL_SOL: TokenPriceData = {
	chain: "solana",
	coin: "SOL",
	image: "/images/solana.png",
	price: 0,
	priceChange: 0,
	priceChangePercent: 0,
	quoteVolume: 0,
	symbol: "SOLUSDT",
	time: 0,
	time_readable: "",
	volume: 0,
};

export const INITIAL_USDC: TokenPriceData = {
	chain: "solana",
	coin: "USDC",
	image: "/images/usdc.png",
	price: 1,
	priceChange: 0,
	priceChangePercent: 0,
	quoteVolume: 0,
	symbol: "USDCUSDT",
	time: 0,
	time_readable: "",
	volume: 0,
};

export const INITIAL_DOT: TokenPriceData = {
	chain: "polkadot",
	coin: "DOT",
	image: "/images/polkadot.png",
	price: 0,
	priceChange: 0,
	priceChangePercent: 0,
	quoteVolume: 0,
	symbol: "DOTUSDT",
	time: 0,
	time_readable: "",
	volume: 0,
};

export const INITIAL_DOT_USDC: TokenPriceData = {
	chain: "polkadot",
	coin: "USDC",
	image: "/images/usdc.png",
	price: 1,
	priceChange: 0,
	priceChangePercent: 0,
	quoteVolume: 0,
	symbol: "USDCUSDT",
	time: 0,
	time_readable: "",
	volume: 0,
};

export const INITIAL_HBAR: TokenPriceData = {
	chain: "hedera",
	coin: "HBAR",
	image: "/images/hedera.png",
	price: 0,
	priceChange: 0,
	priceChangePercent: 0,
	quoteVolume: 0,
	symbol: "HBARUSDT",
	time: 0,
	time_readable: "",
	volume: 0,
};

export const INITIAL_HBAR_USDC: TokenPriceData = {
	chain: "hedera",
	coin: "USDC",
	image: "/images/usdc.png",
	price: 1,
	priceChange: 0,
	priceChangePercent: 0,
	quoteVolume: 0,
	symbol: "USDCUSDT",
	time: 0,
	time_readable: "",
	volume: 0,
};

export const CHAIN_DEFAULT_TOKENS: Record<string, { token: TokenPriceData; quoteToken: TokenPriceData }> = {
	solana: { token: INITIAL_SOL, quoteToken: INITIAL_USDC },
	polkadot: { token: INITIAL_DOT, quoteToken: INITIAL_DOT_USDC },
	hedera: { token: INITIAL_HBAR, quoteToken: INITIAL_HBAR_USDC },
};

export const getDefaultToken = (chainId: string): TokenPriceData =>
	CHAIN_DEFAULT_TOKENS[chainId]?.token ?? INITIAL_SOL;

export const getDefaultQuoteToken = (chainId: string): TokenPriceData =>
	CHAIN_DEFAULT_TOKENS[chainId]?.quoteToken ?? INITIAL_USDC;

export const useTokenStore = create<MarketState & MarketActions>((set) => ({
	listToken: [],
	token: INITIAL_SOL,
	quoteToken: INITIAL_USDC,
	estimateDetail: null,
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
	setDefaultsForChain: (chainId) => {
		const defaults = CHAIN_DEFAULT_TOKENS[chainId];
		if (defaults) {
			set({ token: defaults.token, quoteToken: defaults.quoteToken, listToken: [], estimateDetail: null });
		}
	},
}));
