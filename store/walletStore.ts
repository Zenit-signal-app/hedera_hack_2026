import { create } from "zustand";
import { WalletApi, WalletInfo } from "../types/wallet";
import { persist, createJSONStorage } from "zustand/middleware";
interface WalletState {
	isConnected: boolean;
	activeWallet: WalletApi | null;
	currentWalletId: string | null;
	error: string | null;

	availableWallets: WalletInfo[];
	networkId: number | null;
	usedAddress: string | null;
	balance: string | null;
	isWalletInfoLoading: boolean;
}
interface WalletActions {
	setWallets: (wallets: WalletInfo[]) => void;
	setConnected: (api: WalletApi, id: string) => void;
	setDisconnected: () => void;
	setError: (error: string | null) => void;
	setWalletInfoLoading: (loading: boolean) => void;

	setWalletInfo: (info: {
		networkId: number | null;
		usedAddress: string | null;
		balance: string | null;
	}) => void;
	accessToken: string;
	setAccessToken: (key: string) => void;
}

// 3. Tạo Store
const initialState: Omit<WalletState, "availableWallets"> &
	Pick<WalletActions, "accessToken"> = {
	isConnected: false,
	activeWallet: null,
	currentWalletId: null,
	error: null,
	networkId: null,
	usedAddress: null,
	balance: null,
	isWalletInfoLoading: false,
	accessToken: "",
};

export const useWalletStore = create<WalletState & WalletActions>()(
	persist(
		(set, get) => ({
			...initialState,
			availableWallets: [],

			setAccessToken: (key) => set({ accessToken: key }),
			setWallets: (wallets) => set({ availableWallets: wallets }),
			setError: (error) => set({ error }),
			setWalletInfoLoading: (loading) =>
				set({ isWalletInfoLoading: loading }),

			setConnected: (api, id) => {
				set({
					isConnected: true,
					activeWallet: api,
					currentWalletId: id,
					error: null,
				});
			},

			setDisconnected: () => {
				set((state) => ({
					...initialState,
					availableWallets: state.availableWallets,
					accessToken: "",
				}));
			},

			setWalletInfo: ({ networkId, usedAddress, balance }) => {
				set({ networkId, usedAddress, balance });
			},
		}),
		{
			name: "wallet-storage",
			storage: createJSONStorage(() => localStorage),

			partialize: (state) => ({
				accessToken: state.accessToken,
			}),
		}
	)
);
