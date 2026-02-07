import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface VaultSocketState {
	enabled: boolean;
	txId: string | null;
	setEnabled: (enabled: boolean) => void;
	setTxId: (txId: string | null) => void;
	clearTxId: () => void;
}

export const useVaultSocketStore = create<VaultSocketState>()(
	persist(
		(set) => ({
			enabled: false,
			txId: null,
			setEnabled: (enabled) => set({ enabled }),
			setTxId: (txId) => set({ txId }),
			clearTxId: () => set({ txId: null }),
		}),
		{
			name: "vault-socket-storage",
			storage: createJSONStorage(() => localStorage),
		},
	),
);
