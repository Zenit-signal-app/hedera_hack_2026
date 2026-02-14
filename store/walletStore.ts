import { create } from "zustand";
import { WalletApi, WalletInfo } from "../types/wallet";
import { persist, createJSONStorage } from "zustand/middleware";
import { MinswapBalanceItem } from "@/types/minswap";

interface WalletState {
	isConnected: boolean;
	activeWallet: WalletApi | null;
	currentWalletId: string | null;
	error: string | null;

	availableWallets: WalletInfo[];
	networkId: number | null;
	usedAddress: string | null;
	balance: MinswapBalanceItem[];
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
		balance: MinswapBalanceItem[];
	}) => void;
	updateBalanceAfterSwap: (params: {
		fromTokenId: string;
		toTokenId: string;
		fromAmount: string;
		toAmount: string;
		fromTokenDecimals: number;
		toTokenDecimals: number;
	}) => void;
	accessToken: string;
	setAccessToken: (key: string) => void;
}
const initialBalance: MinswapBalanceItem[] = [];
const initialState: Omit<WalletState, "availableWallets"> &
	Pick<WalletActions, "accessToken"> = {
	isConnected: false,
	activeWallet: null,
	currentWalletId: null,
	error: null,
	networkId: null,
	usedAddress: null,
	balance:initialBalance,
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
				set({ networkId, usedAddress, balance, isWalletInfoLoading: false });
			},

			updateBalanceAfterSwap: ({
				fromTokenId,
				toTokenId,
				fromAmount,
				toAmount,
				fromTokenDecimals,
				toTokenDecimals,
			}) => {
				set((state) => {
					const updatedBalance = [...state.balance];

					const fromTokenIndex = updatedBalance.findIndex(
						(item) => item.asset.token_id === fromTokenId
					);

					if (fromTokenIndex !== -1) {
						const currentAmount = parseFloat(
							updatedBalance[fromTokenIndex].amount
						);
						const subtractAmount = parseFloat(fromAmount);
						const newAmount = Math.max(
							0,
							currentAmount - subtractAmount
						);
						updatedBalance[fromTokenIndex] = {
							...updatedBalance[fromTokenIndex],
							amount: newAmount.toString(),
						};
					}

					const toTokenIndex = updatedBalance.findIndex(
						(item) => item.asset.token_id === toTokenId
					);

					if (toTokenIndex !== -1) {
						const currentAmount = parseFloat(
							updatedBalance[toTokenIndex].amount
						);
						const addAmount = parseFloat(toAmount);
						const newAmount = currentAmount + addAmount;
						updatedBalance[toTokenIndex] = {
							...updatedBalance[toTokenIndex],
							amount: newAmount.toString(),
						};
					}

					return { balance: updatedBalance };
				});
			},
		}),
		{
			name: "wallet-storage",
			storage: createJSONStorage(() => localStorage),

			partialize: (state) => ({
				accessToken: state.accessToken,
				networkId: state.networkId,
				usedAddress: state.usedAddress,
				balance: state.balance,
				currentWalletId: state.currentWalletId,
			}),
		}
	)
);
