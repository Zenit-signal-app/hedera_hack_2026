import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface VaultSocketState {
	txId: string | null;
	setTxId: (txId: string | null) => void;
	clearTxId: () => void;
}

export const useVaultSocketStore = create<VaultSocketState>()(
	persist(
		(set) => ({
			txId: null,
			setTxId: (txId) => set({ txId }),
			clearTxId: () => set({ txId: null }),
		}),
		{
			name: "vault-socket-storage",
			storage: createJSONStorage(() => localStorage),
		},
	),
);
