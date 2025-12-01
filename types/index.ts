import { Cardano } from "@cardano-sdk/core";

type SwapDirection = "sell" | "buy";

export interface TokenData {
	type: SwapDirection;
	value: string;
	usdValue: string;
	token: string;
	balance: string;
	iconUrl: string;
}

export type Utxo = Cardano.Utxo;
