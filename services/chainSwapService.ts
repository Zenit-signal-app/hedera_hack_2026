/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ChainId } from "@/lib/constant";

// ─── Shared Types ──────────────────────────────────────────────────────────────

export interface SwapToken {
	id: string; // mint address (Solana), asset id (Polkadot), token id (Hedera)
	symbol: string;
	name: string;
	logo: string;
	decimals: number;
	price: number; // USD price
}

export interface SwapQuoteResult {
	amountIn: string;       // smallest unit
	amountOut: string;       // smallest unit
	minAmountOut: string;   // smallest unit
	priceImpact: number;    // percentage
	fee: string;            // human-readable, e.g. "0.000005 SOL"
	feeRaw: string;         // raw smallest-unit amount
	feeToken: string;       // symbol of the fee token
	feeDecimals: number;    // decimals for fee token
	feeUsd: string;         // fee in USD, e.g. "$0.01"
	route: string;          // description like "Jupiter V6" or "HydrationDEX"
	/** Raw data needed to execute the swap (chain-specific) */
	rawQuote: any;
}

export interface SwapExecuteResult {
	txHash: string;
	explorerUrl: string;
}

// ─── Explorer URLs ─────────────────────────────────────────────────────────────

/** Format a fee number to a human-readable string, trimming trailing zeros */
function formatFee(value: number): string {
	if (value === 0) return "0";
	if (value < 0.000001) return value.toExponential(2);
	return value.toFixed(8).replace(/\.?0+$/, "");
}

const EXPLORER_BASE: Record<string, string> = {
	solana: "https://solscan.io/tx/",
	polkadot: "https://polkadot.subscan.io/extrinsic/",
	hedera: "https://hashscan.io/mainnet/transaction/",
};

export function getExplorerUrl(chainId: string, txHash: string): string {
	return `${EXPLORER_BASE[chainId] ?? ""}${txHash}`;
}

// ─── Jupiter (Solana) ──────────────────────────────────────────────────────────

const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_API = "https://quote-api.jup.ag/v6/swap";

async function getJupiterQuote(
	inputMint: string,
	outputMint: string,
	amount: string, // lamports / smallest unit
	slippageBps: number
): Promise<SwapQuoteResult> {
	const params = new URLSearchParams({
		inputMint,
		outputMint,
		amount,
		slippageBps: slippageBps.toString(),
	});

	const resp = await fetch(`${JUPITER_QUOTE_API}?${params}`);
	if (!resp.ok) {
		const err = await resp.json().catch(() => ({}));
		throw new Error(err?.error || "Failed to fetch Jupiter quote");
	}
	const data = await resp.json();

	const inAmount = data.inAmount ?? amount;
	const outAmount = data.outAmount ?? "0";
	const otherAmountThreshold = data.otherAmountThreshold ?? outAmount;
	const priceImpactPct = parseFloat(data.priceImpactPct ?? "0");

	// Sum fees across all route hops
	const totalFeeLamports = (data.routePlan ?? []).reduce(
		(sum: number, step: any) => sum + Number(step?.swapInfo?.feeAmount ?? 0),
		0
	);
	// Jupiter fees are in input token's smallest unit (lamports for SOL = 9 decimals)
	const feeDecimals = 9; // SOL decimals
	const feeHuman = totalFeeLamports / Math.pow(10, feeDecimals);

	return {
		amountIn: inAmount,
		amountOut: outAmount,
		minAmountOut: otherAmountThreshold,
		priceImpact: priceImpactPct,
		fee: `${formatFee(feeHuman)} SOL`,
		feeRaw: totalFeeLamports.toString(),
		feeToken: "SOL",
		feeDecimals,
		feeUsd: "",
		route: "Jupiter V6",
		rawQuote: data,
	};
}

async function executeJupiterSwap(
	rawQuote: any,
	userPublicKey: string
): Promise<SwapExecuteResult> {
	// 1. Get the serialized transaction from Jupiter
	const swapResp = await fetch(JUPITER_SWAP_API, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			quoteResponse: rawQuote,
			userPublicKey,
			wrapAndUnwrapSol: true,
		}),
	});

	if (!swapResp.ok) {
		throw new Error("Failed to get Jupiter swap transaction");
	}

	const { swapTransaction } = await swapResp.json();

	// 2. Deserialize, sign via Phantom/Solflare, and send
	const provider = (window as any).solana;
	if (!provider?.signTransaction) {
		throw new Error("Solana wallet not found. Please connect your wallet.");
	}

	// Decode the base64 transaction
	const { VersionedTransaction, Connection } = await import(
		"@solana/web3.js"
	);
	const txBuf = Buffer.from(swapTransaction, "base64");
	const transaction = VersionedTransaction.deserialize(txBuf);

	const signed = await provider.signTransaction(transaction);

	const connection = new Connection(
		"https://api.mainnet-beta.solana.com",
		"confirmed"
	);
	const txHash = await connection.sendRawTransaction(signed.serialize(), {
		skipPreflight: true,
		maxRetries: 3,
	});

	// Wait for confirmation
	await connection.confirmTransaction(txHash, "confirmed");

	return {
		txHash,
		explorerUrl: getExplorerUrl("solana", txHash),
	};
}

// ─── Polkadot (HydraDX / Hydration) ───────────────────────────────────────────

const HYDRADX_API = "https://app.hydration.net/api";

/**
 * HydraDX asset IDs for common tokens on the Hydration parachain.
 * Native DOT on Hydration is asset 5, HDX is 0, USDT is 10, USDC is 22, etc.
 * If the user passes a numeric string we use it directly; otherwise we map known symbols.
 */
const HYDRADX_ASSET_MAP: Record<string, number> = {
	DOT: 5,
	HDX: 0,
	USDT: 10,
	USDC: 22,
	WETH: 20,
	WBTC: 19,
	DAI: 2,
};

function resolveHydraAssetId(tokenIdOrSymbol: string): number {
	// If already numeric, use directly
	if (/^\d+$/.test(tokenIdOrSymbol)) return Number(tokenIdOrSymbol);
	const mapped = HYDRADX_ASSET_MAP[tokenIdOrSymbol.toUpperCase()];
	if (mapped !== undefined) return mapped;
	throw new Error(`Unknown HydraDX asset: ${tokenIdOrSymbol}. Provide a numeric asset ID or known symbol.`);
}

async function getPolkadotQuote(
	inputId: string,
	outputId: string,
	amount: string,
	slippageBps: number
): Promise<SwapQuoteResult> {
	const assetIn = resolveHydraAssetId(inputId);
	const assetOut = resolveHydraAssetId(outputId);

	// Use Hydration Router API to get best route + quote
	const params = new URLSearchParams({
		assetIn: assetIn.toString(),
		assetOut: assetOut.toString(),
		amount,
	});

	const resp = await fetch(`${HYDRADX_API}/router?${params}`);
	if (!resp.ok) {
		const err = await resp.json().catch(() => ({}));
		throw new Error(err?.error || "Failed to fetch HydraDX quote");
	}
	const data = await resp.json();

	const amountOut = data.amountOut ?? "0";
	const minAmountOut = Math.floor(
		Number(amountOut) * (1 - slippageBps / 10000)
	).toString();

	// Hydration tradeFee is in input asset's smallest unit (DOT = 10 decimals)
	const feeRaw = data.tradeFee ?? "0";
	const feeDecimals = 10; // DOT decimals
	const feeHuman = Number(feeRaw) / Math.pow(10, feeDecimals);

	return {
		amountIn: amount,
		amountOut,
		minAmountOut,
		priceImpact: parseFloat(data.priceImpact ?? "0"),
		fee: `${formatFee(feeHuman)} DOT`,
		feeRaw,
		feeToken: "DOT",
		feeDecimals,
		feeUsd: "",
		route: "Hydration DEX",
		rawQuote: {
			...data,
			assetIn,
			assetOut,
			amount,
			slippageBps,
		},
	};
}

async function executePolkadotSwap(
	rawQuote: any,
	userAddress: string
): Promise<SwapExecuteResult> {
	// Get the Polkadot.js / Talisman / SubWallet extension signer
	const web3 = window.injectedWeb3;
	if (!web3) throw new Error("No Polkadot wallet extension found");

	// Find the first available extension
	const extensionIds = Object.keys(web3).filter((k) =>
		["polkadot-js", "talisman", "subwallet-js"].includes(k)
	);
	if (extensionIds.length === 0) {
		throw new Error("No supported Polkadot wallet extension installed");
	}

	const injected = await web3[extensionIds[0]].enable("Zenit");
	const signer = injected.signer;
	if (!signer?.signPayload) {
		throw new Error("Wallet extension does not support signing");
	}

	// Build the swap extrinsic via Hydration API
	const swapResp = await fetch(`${HYDRADX_API}/swap`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			assetIn: rawQuote.assetIn,
			assetOut: rawQuote.assetOut,
			amount: rawQuote.amount,
			minAmountOut: Math.floor(
				Number(rawQuote.amountOut) * (1 - rawQuote.slippageBps / 10000)
			).toString(),
			address: userAddress,
			routes: rawQuote.routes ?? rawQuote.route,
		}),
	});

	if (!swapResp.ok) {
		throw new Error("Failed to build HydraDX swap transaction");
	}

	const { payload, txHash: prebuiltHash } = await swapResp.json();

	if (payload) {
		// Sign with extension
		const { signature } = await signer.signPayload(payload);

		// Submit signed extrinsic
		const submitResp = await fetch(`${HYDRADX_API}/submit`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ payload, signature }),
		});

		if (!submitResp.ok) {
			throw new Error("Failed to submit signed Polkadot transaction");
		}

		const submitData = await submitResp.json();
		const txHash = submitData.txHash ?? submitData.hash ?? prebuiltHash;

		return {
			txHash,
			explorerUrl: getExplorerUrl("polkadot", txHash),
		};
	}

	// Fallback: if API returned txHash directly (dry-run / pre-signed)
	return {
		txHash: prebuiltHash,
		explorerUrl: getExplorerUrl("polkadot", prebuiltHash),
	};
}

// ─── Hedera (SaucerSwap) ──────────────────────────────────────────────────────

const SAUCERSWAP_API = "https://api.saucerswap.finance";

/**
 * SaucerSwap uses Hedera token IDs like "0.0.1456986" for HBAR (WHBAR),
 * "0.0.456858" for USDC, etc.
 */
const HEDERA_TOKEN_MAP: Record<string, string> = {
	HBAR: "0.0.1456986",   // WHBAR on SaucerSwap
	WHBAR: "0.0.1456986",
	USDC: "0.0.456858",
	USDT: "0.0.634409",
	SAUCE: "0.0.731861",
	HBARX: "0.0.834116",
	DAI: "0.0.456858",
};

function resolveHederaTokenId(tokenIdOrSymbol: string): string {
	// If already looks like a Hedera ID (0.0.xxxxx), use directly
	if (/^\d+\.\d+\.\d+$/.test(tokenIdOrSymbol)) return tokenIdOrSymbol;
	const mapped = HEDERA_TOKEN_MAP[tokenIdOrSymbol.toUpperCase()];
	if (mapped) return mapped;
	throw new Error(`Unknown Hedera token: ${tokenIdOrSymbol}. Provide a Hedera token ID (0.0.xxxxx) or known symbol.`);
}

async function getHederaQuote(
	inputId: string,
	outputId: string,
	amount: string,
	slippageBps: number
): Promise<SwapQuoteResult> {
	const tokenIn = resolveHederaTokenId(inputId);
	const tokenOut = resolveHederaTokenId(outputId);

	// SaucerSwap V2 quote API
	const params = new URLSearchParams({
		tokenIn,
		tokenOut,
		amountIn: amount,
	});

	const resp = await fetch(`${SAUCERSWAP_API}/v2/swap/quote?${params}`);
	if (!resp.ok) {
		const err = await resp.json().catch(() => ({}));
		throw new Error(err?.message || "Failed to fetch SaucerSwap quote");
	}
	const data = await resp.json();

	const amountOut = data.amountOut ?? "0";
	const minAmountOut = Math.floor(
		Number(amountOut) * (1 - slippageBps / 10000)
	).toString();

	// SaucerSwap fee is in input token's smallest unit (HBAR = 8 decimals)
	const feeRaw = data.fee ?? "0";
	const feeDecimals = 8; // HBAR decimals
	const feeHuman = Number(feeRaw) / Math.pow(10, feeDecimals);

	return {
		amountIn: amount,
		amountOut,
		minAmountOut,
		priceImpact: parseFloat(data.priceImpact ?? "0"),
		fee: `${formatFee(feeHuman)} HBAR`,
		feeRaw,
		feeToken: "HBAR",
		feeDecimals,
		feeUsd: data.feeUsd ? `$${data.feeUsd}` : "",
		route: "SaucerSwap V2",
		rawQuote: {
			...data,
			tokenIn,
			tokenOut,
			amount,
			slippageBps,
		},
	};
}

async function executeHederaSwap(
	rawQuote: any,
	userAddress: string
): Promise<SwapExecuteResult> {
	// Build the swap transaction via SaucerSwap API
	const swapResp = await fetch(`${SAUCERSWAP_API}/v2/swap/transaction`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			tokenIn: rawQuote.tokenIn,
			tokenOut: rawQuote.tokenOut,
			amountIn: rawQuote.amount,
			amountOutMin: Math.floor(
				Number(rawQuote.amountOut) * (1 - rawQuote.slippageBps / 10000)
			).toString(),
			account: userAddress,
			deadline: Math.floor(Date.now() / 1000) + 300, // 5 min deadline
			path: rawQuote.path ?? rawQuote.route,
		}),
	});

	if (!swapResp.ok) {
		throw new Error("Failed to build SaucerSwap transaction");
	}

	const txData = await swapResp.json();

	// Try signing with available Hedera wallet
	const eth = window.ethereum;
	const blade = window.bladewallet;

	if (blade) {
		// Blade wallet signing
		const bladeSession = await blade.enable();
		if (!bladeSession?.accountId) {
			throw new Error("Blade wallet: failed to get account");
		}

		// Blade wallet handles Hedera native transactions
		// Submit the transaction bytes for signing
		if (txData.transactionBytes) {
			const signResp = await fetch(`${SAUCERSWAP_API}/v2/swap/submit`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					transactionBytes: txData.transactionBytes,
					accountId: bladeSession.accountId,
				}),
			});
			if (!signResp.ok) throw new Error("Failed to submit Hedera transaction");
			const result = await signResp.json();
			return {
				txHash: result.transactionId ?? result.txHash,
				explorerUrl: getExplorerUrl("hedera", result.transactionId ?? result.txHash),
			};
		}
	}

	if (eth?.isMetaMask) {
		// MetaMask with Hedera — uses EVM-compatible contract call
		if (txData.to && txData.data) {
			const txHash = (await eth.request({
				method: "eth_sendTransaction",
				params: [
					{
						from: userAddress,
						to: txData.to,
						data: txData.data,
						value: txData.value ?? "0x0",
						gas: txData.gas,
					},
				],
			})) as string;

			return {
				txHash,
				explorerUrl: getExplorerUrl("hedera", txHash),
			};
		}
	}

	throw new Error(
		"No supported Hedera wallet found for signing. Please connect Blade or MetaMask."
	);
}

// ─── Unified API ───────────────────────────────────────────────────────────────

export async function getSwapQuote(
	chainId: ChainId,
	inputTokenId: string,
	outputTokenId: string,
	amount: string,
	slippageBps = 50 // 0.5%
): Promise<SwapQuoteResult> {
	switch (chainId) {
		case "solana":
			return getJupiterQuote(inputTokenId, outputTokenId, amount, slippageBps);
		case "polkadot":
			return getPolkadotQuote(inputTokenId, outputTokenId, amount, slippageBps);
		case "hedera":
			return getHederaQuote(inputTokenId, outputTokenId, amount, slippageBps);
		default:
			throw new Error(`Unsupported chain: ${chainId}`);
	}
}

export async function executeSwap(
	chainId: ChainId,
	rawQuote: any,
	userAddress: string
): Promise<SwapExecuteResult> {
	switch (chainId) {
		case "solana":
			return executeJupiterSwap(rawQuote, userAddress);
		case "polkadot":
			return executePolkadotSwap(rawQuote, userAddress);
		case "hedera":
			return executeHederaSwap(rawQuote, userAddress);
		default:
			throw new Error(`Unsupported chain: ${chainId}`);
	}
}

// ─── Default tokens per chain (for swap UI) ───────────────────────────────────

export const CHAIN_DEFAULT_SWAP_TOKENS: Record<ChainId, { tokenIn: SwapToken; tokenOut: SwapToken }> = {
	solana: {
		tokenIn: {
			id: "So11111111111111111111111111111111111111112", // Wrapped SOL
			symbol: "SOL",
			name: "Solana",
			logo: "/images/solana.png",
			decimals: 9,
			price: 0,
		},
		tokenOut: {
			id: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
			symbol: "USDC",
			name: "USD Coin",
			logo: "/images/usdc.png",
			decimals: 6,
			price: 1,
		},
	},
	polkadot: {
		tokenIn: {
			id: "5", // DOT asset ID on HydraDX
			symbol: "DOT",
			name: "Polkadot",
			logo: "/images/polkadot.png",
			decimals: 10,
			price: 0,
		},
		tokenOut: {
			id: "22", // USDC asset ID on HydraDX
			symbol: "USDC",
			name: "USD Coin",
			logo: "/images/usdc.png",
			decimals: 6,
			price: 1,
		},
	},
	hedera: {
		tokenIn: {
			id: "0.0.1456986", // WHBAR on SaucerSwap
			symbol: "HBAR",
			name: "Hedera",
			logo: "/images/hedera.png",
			decimals: 8,
			price: 0,
		},
		tokenOut: {
			id: "0.0.456858", // USDC on Hedera
			symbol: "USDC",
			name: "USD Coin",
			logo: "/images/usdc.png",
			decimals: 6,
			price: 1,
		},
	},
};
