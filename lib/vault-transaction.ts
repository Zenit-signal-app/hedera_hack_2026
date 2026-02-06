/* eslint-disable @typescript-eslint/no-explicit-any */

import { Lucid, Data, Blockfrost, getAddressDetails } from "lucid-cardano";

const DepositDatumSchema = Data.Object({
	contributor_address: Data.Bytes(),
	pool_id: Data.Bytes(),
});

type DepositDatum = Data.Static<typeof DepositDatumSchema>;

export interface VaultConfig {
	vault_address: string;
	pool_id: string;
	min_lovelace: number;
}

const normalizePoolIdHex = (poolId: string): string => {
	if (!poolId) {
		throw new Error("pool_id is required for deposit");
	}

	const hex = poolId.replace(/\./g, "");

	if (!/^[0-9a-fA-F]+$/.test(hex)) {
		throw new Error(`pool_id must be valid hex, got: ${poolId}`);
	}

	return hex;
};

const isValidAddressFormat = (address: string): boolean => {
	if (!address || typeof address !== "string") return false;
	return address.match(/^addr(1|_test1)[a-z0-9]{50,}$/i) !== null;
};

const extractFeeLovelace = (txComplete: any): number => {
	const feeValue =
		txComplete?.fee ??
		txComplete?.txComplete?.body?.()?.fee?.()?.to_str?.();

	if (typeof feeValue === "bigint") {
		return Number(feeValue);
	}

	if (typeof feeValue === "string") {
		const parsed = Number(feeValue);
		if (!Number.isNaN(parsed)) {
			return parsed;
		}
	}

	if (typeof feeValue === "number") {
		return feeValue;
	}

	throw new Error("Unable to read transaction fee");
};

export function buildDepositDatum(
	contributorAddress: string,
	poolId: string,
): string {
	if (contributorAddress.length < 80) {
		throw new Error(
			"Contributor address appears to be a script address, not a wallet address. Wallet addresses are typically 100+ chars.",
		);
	}

	try {
		const addressDetails = getAddressDetails(contributorAddress);

		if (!addressDetails.paymentCredential) {
			throw new Error(
				"Invalid contributor address: missing payment credential",
			);
		}

		const poolIdHex = poolId.split(".")[1];
    
		const datum: DepositDatum = {
			contributor_address: addressDetails.paymentCredential.hash,
			pool_id: poolIdHex,
		};
    
		return Data.to(datum as any, DepositDatumSchema);
	} catch (error: any) {
		throw new Error(
			`Invalid contributor address format: ${error.message || error}`,
		);
	}
}

export async function buildDepositTransaction(
	lucid: Lucid,
	vaultConfig: VaultConfig,
	amountLovelace: number,
	contributorAddress?: string,
) {
	if (amountLovelace < vaultConfig.min_lovelace) {
		throw new Error(
			`Deposit amount (${amountLovelace}) is below minimum required (${vaultConfig.min_lovelace} lovelace)`,
		);
	}

	const vaultAddress = vaultConfig.vault_address.trim().replace(/^"|"$/g, "");

	if (!isValidAddressFormat(vaultAddress)) {
		throw new Error(
			"Vault address format is invalid. Expected Cardano address.",
		);
	}

	if (!contributorAddress || typeof contributorAddress !== "string") {
		throw new Error(
			"Contributor address must be provided and cannot be empty",
		);
	}

	const contributor = contributorAddress.trim();

	if (!contributor.startsWith("addr")) {
		throw new Error(
			"Invalid contributor address: must be a valid Cardano wallet address starting with 'addr'",
		);
	}

	if (contributor === vaultAddress) {
		throw new Error(
			"Contributor address cannot be the same as vault address",
		);
	}

	const datum = buildDepositDatum(contributor, vaultConfig.pool_id);
	console.log("Datum" , datum);
	
	const tx = lucid
		.newTx()
		.payToContract(
			vaultAddress,
			{ inline: datum },
			{ lovelace: BigInt(amountLovelace) },
		);

	const completeTx = await tx.complete();

	return completeTx;
}

export async function estimateDepositFee(
	lucid: Lucid,
	vaultConfig: VaultConfig,
	amountLovelace: number,
	contributorAddress?: string,
): Promise<number> {
	const completeTx = await buildDepositTransaction(
		lucid,
		vaultConfig,
		amountLovelace,
		contributorAddress,
	);

	return extractFeeLovelace(completeTx);
}

export async function depositToVaultContract(
	lucid: Lucid,
	vaultConfig: VaultConfig,
	amountLovelace: number,
	contributorAddress?: string,
): Promise<string> {
	try {
		console.log("vaultConfig", vaultConfig);

		const completeTx = await buildDepositTransaction(
			lucid,
			vaultConfig,
			amountLovelace,
			contributorAddress,
		);

		const signedTx = await completeTx.sign().complete();

		const txHash = await signedTx.submit();

		return txHash;
	} catch (error: any) {
		console.error("Error depositing to vault:", error);
		throw new Error(
			`Failed to deposit to vault: ${error.message || error}`,
		);
	}
}

export async function initializeLucid(
	network: "Mainnet" | "Preview",
	blockfrostApiKey: string,
	walletApi: any,
): Promise<Lucid> {
	const lucid = await Lucid.new(
		new Blockfrost(
			`https://cardano-${network.toLowerCase()}.blockfrost.io/api/v0`,
			blockfrostApiKey,
		),
		network,
	);

	// Select wallet
	lucid.selectWallet(walletApi);

	return lucid;
}

export function adaToLovelace(ada: number): number {
	return Math.floor(ada * 1_000_000);
}

export function lovelaceToAda(lovelace: number): number {
	return lovelace / 1_000_000;
}

export function getPaymentHashFromAddress(address: string): string {
	const details = getAddressDetails(address);
	if (!details.paymentCredential) {
		throw new Error("Invalid address: missing payment credential");
	}
	return details.paymentCredential.hash;
}

export function isSamePaymentCredential(
	address: string,
	contributorPaymentHash: string,
): boolean {
	try {
		return getPaymentHashFromAddress(address) === contributorPaymentHash;
	} catch {
		return false;
	}
}

export async function waitForTransactionConfirmation(
	lucid: Lucid,
	txHash: string,
	maxWaitTime: number = 180_000,
): Promise<boolean> {
	const startTime = Date.now();

	while (Date.now() - startTime < maxWaitTime) {
		try {
			await lucid.awaitTx(txHash);
			return true;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}
	}

	return false;
}
