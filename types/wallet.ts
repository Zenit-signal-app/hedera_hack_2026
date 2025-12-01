/* eslint-disable @typescript-eslint/no-explicit-any */
// types/wallet.ts

import { Cardano } from "@cardano-sdk/core";

export interface WalletApi {
	getNetworkId(): Promise<number>;
	getUsedAddresses(): Promise<string[]>;
	getBalance(): Promise<string>;
	signTx(tx: string): Promise<string>;
	getUnusedAddresses(): Promise<string[]>;
	on(
		eventName: "accountChange" | "networkChange" | string,
		callback: () => void
	): void;
	getUtxos(): Promise<Cardano.Utxo[]>;
	off(
		eventName: "accountChange" | "networkChange" | string,
		callback: () => void
	): void;
}

export interface WalletInfo {
	id: string;
	name: string;
	icon: string;
}


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
		CardanoWasm: any;
	}
}
