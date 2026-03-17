/* eslint-disable @typescript-eslint/no-explicit-any */
// types/wallet.ts

declare global {
	interface Window {
		phantom?: {
			solana?: {
				isPhantom: boolean;
				publicKey: { toString(): string } | null;
				connect(opts?: { onlyIfTrusted?: boolean }): Promise<{
					publicKey: { toString(): string };
				}>;
				disconnect(): Promise<void>;
			};
		};
		solflare?: {
			isSolflare: boolean;
			publicKey: { toString(): string } | null;
			connect(): Promise<void>;
			disconnect(): Promise<void>;
		};
		backpack?: {
			isBackpack: boolean;
			publicKey: { toString(): string } | null;
			connect(): Promise<{ publicKey: { toString(): string } }>;
			disconnect(): Promise<void>;
		};

		injectedWeb3?: {
			[extensionId: string]: {
				version: string;
				name: string;
				enable(origin: string): Promise<{
					accounts: {
						get(): Promise<
							Array<{
								address: string;
								name: string;
								type: string;
							}>
						>;
					};
					signer?: {
						signPayload(
							payload: any,
						): Promise<{ signature: string }>;
						signRaw?(raw: {
							address: string;
							data: string;
							type: string;
						}): Promise<{ signature: string }>;
					};
				}>;
			};
		};

		hashconnect?: unknown;
		bladewallet?: {
			enable(): Promise<{ accountId: string }>;
		};
		ethereum?: {
			isMetaMask?: boolean;
			request(args: {
				method: string;
				params?: unknown[];
			}): Promise<unknown>;
		};
	}
}

export interface WalletInfo {
	id: string;
	name: string;
	icon?: string;
	url?: string;
	chainId?: string;
}
