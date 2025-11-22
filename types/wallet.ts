// types/wallet.ts

import { Cardano } from "@cardano-sdk/core";

export interface WalletApi {
	getNetworkId(): Promise<number>;
	getUsedAddresses(): Promise<string[]>;
	getBalance(): Promise<string>;
	signTx(tx: string): Promise<string>;
	getUnusedAddresses(): Promise<string[]>;
  on(eventName: 'accountChange' | 'networkChange' | string, callback: () => void): void; 

  off(eventName: 'accountChange' | 'networkChange' | string, callback: () => void): void;
}

export interface WalletInfo {
	id: string;
	name: string;
	icon: string;
}

// Danh sách các ví phổ biến trên Cardano
export const SUPPORTED_WALLETS: WalletInfo[] = [
	{ id: "eternl", name: "Eternl", icon: "/icons/eternl.svg" },
	{ id: "vespr", name: "Vespr", icon: "/icons/vespr.svg" },
	{ id: "lace", name: "Lace", icon: "/icons/lace.svg" },
	{ id: "okx", name: "OKX", icon: "/icons/okx.svg" },
	{ id: "typhon", name: "Typhon", icon: "/icons/typhon.svg" },
	{ id: "tokeo", name: "Tokeo", icon: "/icons/tokeo.svg" },
	{ id: "flint", name: "Flint", icon: "/icons/flint.svg" },
	{ id: "nami", name: "Nami", icon: "/icons/nami.svg" },
	{ id: "yoroi", name: "Yoroi", icon: "/icons/yoroi.svg" },
];

declare global {
	interface Window {
		cardano?: {
			[key: string]: {
				name: string;
				icon: string;
				apiVersion: string;
				enable(): Promise<WalletApi>;
				isEnabled(): Promise<boolean>;
			};
		};
	}
}
