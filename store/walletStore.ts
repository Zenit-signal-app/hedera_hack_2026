import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ─── Per-chain connection record ───────────────────────────────────────────────
export interface ChainConnection {
	walletId: string;
	walletName: string;
	address: string;
}

export interface ChainTokenBalance {
	symbol: string;
	name: string;
	logo: string;
	balance: string; // human-readable amount
	decimals: number;
}

interface WalletState {
	error: string | null;
	accessToken: string;
	/** Keyed by ChainId ("solana" | "polkadot" | "hedera") */
	chainConnections: Record<string, ChainConnection>;
	activeChain: string | null;
	/** Cached balances per chain, keyed by ChainId */
	chainBalances: Record<string, ChainTokenBalance[]>;
	/** Timestamp of last balance fetch per chain */
	chainBalancesFetchedAt: Record<string, number>;
}

interface WalletActions {
	setError: (error: string | null) => void;
	setAccessToken: (key: string) => void;
	setChainConnection: (chainId: string, connection: ChainConnection) => void;
	removeChainConnection: (chainId: string) => void;
	setActiveChain: (chainId: string | null) => void;
	setChainBalances: (chainId: string, balances: ChainTokenBalance[]) => void;
}

const initialState: WalletState = {
	error: null,
	accessToken: "",
	chainConnections: {},
	activeChain: "solana",
	chainBalances: {},
	chainBalancesFetchedAt: {},
};

export const useWalletStore = create<WalletState & WalletActions>()(
	persist(
		(set, get) => ({
			...initialState,

			setAccessToken: (key) => set({ accessToken: key }),
			setError: (error) => set({ error }),

			// ── Multi-chain ────────────────────────────────────────────────────
			setChainConnection: (chainId, connection) =>
				set((state) => ({
					chainConnections: {
						...state.chainConnections,
						[chainId]: connection,
					},
				})),

			removeChainConnection: (chainId) =>
				set((state) => {
					const next = { ...state.chainConnections };
					delete next[chainId];
					const nextBalances = { ...state.chainBalances };
					delete nextBalances[chainId];
					const nextFetched = { ...state.chainBalancesFetchedAt };
					delete nextFetched[chainId];
					return {
						chainConnections: next,
						chainBalances: nextBalances,
						chainBalancesFetchedAt: nextFetched,
						activeChain:
							state.activeChain === chainId ? null : state.activeChain,
					};
				}),

			setActiveChain: (chainId) => set({ activeChain: chainId }),

			setChainBalances: (chainId, balances) =>
				set((state) => ({
					chainBalances: { ...state.chainBalances, [chainId]: balances },
					chainBalancesFetchedAt: { ...state.chainBalancesFetchedAt, [chainId]: Date.now() },
				})),
		}),
		{
			name: "wallet-storage",
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({
				accessToken: state.accessToken,
				chainConnections: state.chainConnections,
				activeChain: state.activeChain,
				chainBalances: state.chainBalances,
				chainBalancesFetchedAt: state.chainBalancesFetchedAt,
			}),
		}
	)
);
