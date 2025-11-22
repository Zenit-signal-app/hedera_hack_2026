import { create } from "zustand";
import { WalletApi, WalletInfo } from "../types/wallet";

// 1. Định nghĩa State
interface WalletState {
	// Trạng thái kết nối
	isConnected: boolean;
	activeWallet: WalletApi | null;
	currentWalletId: string | null;
	error: string | null;

	// Thông tin ví
	availableWallets: WalletInfo[];
	networkId: number | null;
	usedAddress: string | null;
	balance: string | null;
	isWalletInfoLoading: boolean;
}

// 2. Định nghĩa Actions (Sẽ được gọi từ hook)
interface WalletActions {
	// Hàm cập nhật trạng thái chung
	setWallets: (wallets: WalletInfo[]) => void;
	setConnected: (api: WalletApi, id: string) => void;
	setDisconnected: () => void;
	setError: (error: string | null) => void;
	setWalletInfoLoading: (loading: boolean) => void;

	// Hàm cập nhật thông tin ví
	setWalletInfo: (info: {
		networkId: number | null;
		usedAddress: string | null;
		balance: string | null;
	}) => void;
}

// 3. Tạo Store
const initialState: Omit<WalletState, "availableWallets"> = {
	isConnected: false,
	activeWallet: null,
	currentWalletId: null,
	error: null,
	networkId: null,
	usedAddress: null,
	balance: null,
	isWalletInfoLoading: false,
};

export const useWalletStore = create<WalletState & WalletActions>((set) => ({
	// State
	...initialState,
	availableWallets: [], // Khởi tạo mảng rỗng

	// Actions
	setWallets: (wallets) => set({ availableWallets: wallets }),
	setError: (error) => set({ error }),
	setWalletInfoLoading: (loading) => set({ isWalletInfoLoading: loading }),

	setConnected: (api, id) => {
		set({
			isConnected: true,
			activeWallet: api,
			currentWalletId: id,
			error: null,
		});
	},

	setDisconnected: () => {
		set({
			...initialState,
			availableWallets: useWalletStore.getState().availableWallets, // Giữ lại danh sách ví đã cài đặt
		});
	},

	setWalletInfo: ({ networkId, usedAddress, balance }) => {
		set({
			networkId,
			usedAddress,
			balance,
		});
	},
}));
