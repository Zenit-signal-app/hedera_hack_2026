/* eslint-disable @typescript-eslint/no-explicit-any */

import { NETWORK_CONFIG, type ChainId } from "@/lib/constant";

export interface VaultConfig {
	vault_address: string;
	pool_id: string;
	min_deposit: number; // minimum deposit in native token's smallest unit
}

// ─── Solana Deposit ────────────────────────────────────────────────────────────

async function depositSolana(
	vaultAddress: string,
	amountLamports: number,
	_contributorAddress: string,
): Promise<{ txHash: string; fee: number }> {
	const provider = (window as any).solana;
	if (!provider?.signTransaction) {
		throw new Error(
			"Solana wallet not found. Please connect Phantom or Solflare.",
		);
	}

	const { Connection, PublicKey, SystemProgram, Transaction } =
		await import("@solana/web3.js");

	const connection = new Connection(
		NETWORK_CONFIG.solana.rpc,
		"confirmed",
	);

	const fromPubkey = new PublicKey(_contributorAddress);
	const toPubkey = new PublicKey(vaultAddress);

	const transaction = new Transaction().add(
		SystemProgram.transfer({
			fromPubkey,
			toPubkey,
			lamports: amountLamports,
		}),
	);

	transaction.recentBlockhash = (
		await connection.getLatestBlockhash()
	).blockhash;
	transaction.feePayer = fromPubkey;

	const signed = await provider.signTransaction(transaction);
	const txHash = await connection.sendRawTransaction(signed.serialize(), {
		skipPreflight: false,
		maxRetries: 3,
	});

	await connection.confirmTransaction(txHash, "confirmed");

	// Estimate fee from the transaction message
	const feeResult = await connection.getFeeForMessage(
		transaction.compileMessage(),
		"confirmed",
	);
	const fee = feeResult?.value ?? 5000; // default 5000 lamports

	return { txHash, fee };
}

async function estimateFeeSolana(
	vaultAddress: string,
	amountLamports: number,
	contributorAddress: string,
): Promise<number> {
	const { Connection, PublicKey, SystemProgram, Transaction } =
		await import("@solana/web3.js");

	const connection = new Connection(
		NETWORK_CONFIG.solana.rpc,
		"confirmed",
	);

	const fromPubkey = new PublicKey(contributorAddress);
	const toPubkey = new PublicKey(vaultAddress);

	const transaction = new Transaction().add(
		SystemProgram.transfer({
			fromPubkey,
			toPubkey,
			lamports: amountLamports,
		}),
	);

	transaction.recentBlockhash = (
		await connection.getLatestBlockhash()
	).blockhash;
	transaction.feePayer = fromPubkey;

	const feeResult = await connection.getFeeForMessage(
		transaction.compileMessage(),
		"confirmed",
	);

	return feeResult?.value ?? 5000;
}

// ─── Polkadot Deposit ──────────────────────────────────────────────────────────

async function depositPolkadot(
	vaultAddress: string,
	amountPlanck: number,
	contributorAddress: string,
): Promise<{ txHash: string; fee: number }> {
	const web3 = window.injectedWeb3;
	if (!web3) throw new Error("No Polkadot wallet extension found");

	const extensionIds = Object.keys(web3).filter((k) =>
		["polkadot-js", "talisman", "subwallet-js"].includes(k),
	);
	if (extensionIds.length === 0) {
		throw new Error("No supported Polkadot wallet extension installed");
	}

	const injected = await web3[extensionIds[0]].enable("Zenit");
	const signer = injected.signer;
	if (!signer?.signPayload) {
		throw new Error("Wallet extension does not support signing");
	}

	const { ApiPromise, WsProvider } = await import("@polkadot/api");
	const wsProvider = new WsProvider(NETWORK_CONFIG.polkadot.rpc);
	const api = await ApiPromise.create({ provider: wsProvider });

	try {
		const transfer = api.tx.balances.transferKeepAlive(
			vaultAddress,
			amountPlanck,
		);

		// Get fee estimate
		const paymentInfo = await transfer.paymentInfo(contributorAddress);
		const fee = Number(paymentInfo.partialFee);

		// Sign and send
		const txHash = await new Promise<string>((resolve, reject) => {
			transfer
				.signAndSend(
					contributorAddress,
					{ signer: signer as any },
					({ status, dispatchError }: any) => {
						if (dispatchError) {
							reject(new Error(dispatchError.toString()));
						}
						if (status.isInBlock || status.isFinalized) {
							resolve(
								status.isInBlock
									? status.asInBlock.toHex()
									: status.asFinalized.toHex(),
							);
						}
					},
				)
				.catch(reject);
		});

		return { txHash, fee };
	} finally {
		await api.disconnect();
	}
}

async function estimateFeePolkadot(
	vaultAddress: string,
	amountPlanck: number,
	contributorAddress: string,
): Promise<number> {
	const { ApiPromise, WsProvider } = await import("@polkadot/api");
	const wsProvider = new WsProvider(NETWORK_CONFIG.polkadot.rpc);
	const api = await ApiPromise.create({ provider: wsProvider });

	try {
		const transfer = api.tx.balances.transferKeepAlive(
			vaultAddress,
			amountPlanck,
		);
		const paymentInfo = await transfer.paymentInfo(contributorAddress);
		return Number(paymentInfo.partialFee);
	} finally {
		await api.disconnect();
	}
}

// ─── Hedera Deposit ────────────────────────────────────────────────────────────

async function depositHedera(
	vaultAddress: string,
	amountTinybar: number,
	contributorAddress: string,
): Promise<{ txHash: string; fee: number }> {
	const eth = window.ethereum;
	const blade = window.bladewallet;

	if (blade) {
		const bladeSession = await blade.enable();
		if (!bladeSession?.accountId) {
			throw new Error("Blade wallet: failed to get account");
		}

		// Use Hedera REST API to submit transfer
		const transferResp = await fetch(
			`${NETWORK_CONFIG.hedera.rpc}/api/v1/transactions`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					transactionType: "CRYPTOTRANSFER",
					transfers: [
						{ account: contributorAddress, amount: -amountTinybar },
						{ account: vaultAddress, amount: amountTinybar },
					],
				}),
			},
		);

		if (!transferResp.ok) {
			throw new Error("Failed to submit Hedera transfer");
		}

		const result = await transferResp.json();
		const txHash = result.transactionId ?? result.txHash ?? "";
		// Hedera standard fee is typically ~0.0001 HBAR = 10000 tinybar
		const fee = 10000;

		return { txHash, fee };
	}

	if (eth?.isMetaMask) {
		// MetaMask with Hedera — EVM-compatible transfer
		const txHash = (await eth.request({
			method: "eth_sendTransaction",
			params: [
				{
					from: contributorAddress,
					to: vaultAddress,
					value: "0x" + amountTinybar.toString(16),
				},
			],
		})) as string;

		const fee = 10000; // ~0.0001 HBAR
		return { txHash, fee };
	}

	throw new Error(
		"No supported Hedera wallet found. Please connect Blade or MetaMask.",
	);
}

async function estimateFeeHedera(
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_vaultAddress: string,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_amountTinybar: number,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_contributorAddress: string,
): Promise<number> {
	// Hedera has predictable fees: ~0.0001 HBAR for crypto transfer
	return 10000; // tinybar
}

// ─── Unified API ───────────────────────────────────────────────────────────────

export async function depositToVault(
	chainId: ChainId,
	vaultAddress: string,
	amount: number, // smallest unit of the chain's native token
	contributorAddress: string,
): Promise<{ txHash: string; fee: number }> {
	switch (chainId) {
		case "solana":
			return depositSolana(vaultAddress, amount, contributorAddress);
		case "polkadot":
			return depositPolkadot(vaultAddress, amount, contributorAddress);
		case "hedera":
			return depositHedera(vaultAddress, amount, contributorAddress);
		default:
			throw new Error(`Unsupported chain: ${chainId}`);
	}
}

export async function estimateDepositFee(
	chainId: ChainId,
	vaultAddress: string,
	amount: number,
	contributorAddress: string,
): Promise<number> {
	switch (chainId) {
		case "solana":
			return estimateFeeSolana(vaultAddress, amount, contributorAddress);
		case "polkadot":
			return estimateFeePolkadot(
				vaultAddress,
				amount,
				contributorAddress,
			);
		case "hedera":
			return estimateFeeHedera(vaultAddress, amount, contributorAddress);
		default:
			throw new Error(`Unsupported chain: ${chainId}`);
	}
}

// ─── Chain-specific unit helpers ───────────────────────────────────────────────

/** Native token decimals per chain */
export const CHAIN_DECIMALS: Record<ChainId, number> = {
	solana: 9, // lamports
	polkadot: 10, // planck
	hedera: 8, // tinybar
};

export const CHAIN_NATIVE_SYMBOL: Record<ChainId, string> = {
	solana: "SOL",
	polkadot: "DOT",
	hedera: "HBAR",
};

export function toSmallestUnit(amount: number, chainId: ChainId): number {
	return Math.floor(amount * Math.pow(10, CHAIN_DECIMALS[chainId]));
}

export function fromSmallestUnit(amount: number, chainId: ChainId): number {
	return amount / Math.pow(10, CHAIN_DECIMALS[chainId]);
}
