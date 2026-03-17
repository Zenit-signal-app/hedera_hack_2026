/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef } from "react";
import { useWalletStore, ChainTokenBalance } from "@/store/walletStore";
import { DEFAULT_CHAIN_TOKENS, NETWORK_CONFIG, type ChainId } from "@/lib/constant";

// Cache TTL: don't re-fetch within 60 seconds
const BALANCE_TTL_MS = 60_000;

// ─── Solana balance fetching ──────────────────────────────────────────────────

const SOLANA_RPC = NETWORK_CONFIG.solana.rpc;

async function fetchSolanaBalances(address: string): Promise<ChainTokenBalance[]> {
	const defaults = DEFAULT_CHAIN_TOKENS.solana;
	const results: ChainTokenBalance[] = [];

	// 1. Fetch native SOL balance
	try {
		const resp = await fetch(SOLANA_RPC, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "getBalance",
				params: [address],
			}),
		});
		const data = await resp.json();
		const lamports = data?.result?.value ?? 0;
		const solDef = defaults.find((t) => t.symbol === "SOL")!;
		results.push({
			symbol: "SOL",
			name: solDef.name,
			logo: solDef.logo,
			decimals: solDef.decimals,
			balance: (lamports / 1e9).toString(),
		});
	} catch {
		const solDef = defaults.find((t) => t.symbol === "SOL")!;
		results.push({ symbol: "SOL", name: solDef.name, logo: solDef.logo, decimals: solDef.decimals, balance: "0" });
	}

	// 2. Fetch SPL token accounts
	const splTokens = defaults.filter((t) => t.mintAddress);
	try {
		const resp = await fetch(SOLANA_RPC, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "getTokenAccountsByOwner",
				params: [
					address,
					{ programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
					{ encoding: "jsonParsed" },
				],
			}),
		});
		const data = await resp.json();
		const accounts: any[] = data?.result?.value ?? [];

		for (const tokenDef of splTokens) {
			const acct = accounts.find(
				(a: any) => a.account?.data?.parsed?.info?.mint === tokenDef.mintAddress
			);
			const amount = acct?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString ?? "0";
			results.push({
				symbol: tokenDef.symbol,
				name: tokenDef.name,
				logo: tokenDef.logo,
				decimals: tokenDef.decimals,
				balance: amount,
			});
		}
	} catch {
		for (const tokenDef of splTokens) {
			results.push({
				symbol: tokenDef.symbol,
				name: tokenDef.name,
				logo: tokenDef.logo,
				decimals: tokenDef.decimals,
				balance: "0",
			});
		}
	}

	return results;
}

// ─── Polkadot balance fetching ────────────────────────────────────────────────

async function fetchPolkadotBalances(address: string): Promise<ChainTokenBalance[]> {
	const defaults = DEFAULT_CHAIN_TOKENS.polkadot;
	const results: ChainTokenBalance[] = [];

	// Fetch native DOT balance via Polkadot public RPC
	try {
		const resp = await fetch(NETWORK_CONFIG.polkadot.rpc_http, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "system_account",
				params: [address],
			}),
		});
		const data = await resp.json();
		const free = data?.result?.data?.free;
		const dotDef = defaults.find((t) => t.symbol === "DOT")!;
		if (free) {
			// free is hex string of planck (1 DOT = 10^10 planck)
			const planck = typeof free === "string" ? BigInt(free) : BigInt(0);
			const dotAmount = Number(planck) / 1e10;
			results.push({
				symbol: "DOT",
				name: dotDef.name,
				logo: dotDef.logo,
				decimals: dotDef.decimals,
				balance: dotAmount.toString(),
			});
		} else {
			results.push({ symbol: "DOT", name: dotDef.name, logo: dotDef.logo, decimals: dotDef.decimals, balance: "0" });
		}
	} catch {
		const dotDef = defaults.find((t) => t.symbol === "DOT")!;
		results.push({ symbol: "DOT", name: dotDef.name, logo: dotDef.logo, decimals: dotDef.decimals, balance: "0" });
	}

	// USDC & USDT on Polkadot Asset Hub — show 0 for now (no simple public API)
	for (const tokenDef of defaults.filter((t) => t.symbol !== "DOT")) {
		results.push({
			symbol: tokenDef.symbol,
			name: tokenDef.name,
			logo: tokenDef.logo,
			decimals: tokenDef.decimals,
			balance: "0",
		});
	}

	return results;
}

// ─── Hedera balance fetching ──────────────────────────────────────────────────

async function fetchHederaBalances(address: string): Promise<ChainTokenBalance[]> {
	const defaults = DEFAULT_CHAIN_TOKENS.hedera;
	const results: ChainTokenBalance[] = [];

	try {
		const resp = await fetch(
			`${NETWORK_CONFIG.hedera.rpc}/api/v1/balances?account.id=${address}`
		);
		const data = await resp.json();
		const balanceEntry = data?.balances?.[0];
		const hbarTinybar = balanceEntry?.balance ?? 0;
		const hbarDef = defaults.find((t) => t.symbol === "HBAR")!;
		results.push({
			symbol: "HBAR",
			name: hbarDef.name,
			logo: hbarDef.logo,
			decimals: hbarDef.decimals,
			balance: (hbarTinybar / 1e8).toString(),
		});
	} catch {
		const hbarDef = defaults.find((t) => t.symbol === "HBAR")!;
		results.push({ symbol: "HBAR", name: hbarDef.name, logo: hbarDef.logo, decimals: hbarDef.decimals, balance: "0" });
	}

	// USDC & USDT on Hedera — show 0 for now
	for (const tokenDef of defaults.filter((t) => t.symbol !== "HBAR")) {
		results.push({
			symbol: tokenDef.symbol,
			name: tokenDef.name,
			logo: tokenDef.logo,
			decimals: tokenDef.decimals,
			balance: "0",
		});
	}

	return results;
}

// ─── Main hook ────────────────────────────────────────────────────────────────

async function fetchBalancesForChain(
	chainId: ChainId,
	address: string
): Promise<ChainTokenBalance[]> {
	switch (chainId) {
		case "solana":
			return fetchSolanaBalances(address);
		case "polkadot":
			return fetchPolkadotBalances(address);
		case "hedera":
			return fetchHederaBalances(address);
		default:
			return [];
	}
}

/**
 * Fetches & caches token balances for the active chain.
 * Auto-fetches on mount / chain change if stale. Exposes `refresh()` for manual re-fetch.
 */
export function useChainBalance() {
	const {
		activeChain,
		chainConnections,
		chainBalances,
		chainBalancesFetchedAt,
		setChainBalances,
	} = useWalletStore();

	const fetchingRef = useRef(false);

	const connection = activeChain ? chainConnections[activeChain] : null;
	const balances = activeChain ? chainBalances[activeChain] : undefined;
	const lastFetched = activeChain ? chainBalancesFetchedAt[activeChain] : undefined;
	const isStale = !lastFetched || Date.now() - lastFetched > BALANCE_TTL_MS;

	/** Returns default zero-balance tokens for the chain (used before first fetch) */
	const getDefaultBalances = useCallback(
		(chainId: ChainId): ChainTokenBalance[] => {
			const tokens = DEFAULT_CHAIN_TOKENS[chainId] ?? [];
			return tokens.map((t) => ({
				symbol: t.symbol,
				name: t.name,
				logo: t.logo,
				decimals: t.decimals,
				balance: "0",
			}));
		},
		[]
	);

	const fetchBalances = useCallback(async () => {
		if (!activeChain || !connection || fetchingRef.current) return;
		fetchingRef.current = true;
		try {
			const result = await fetchBalancesForChain(
				activeChain as ChainId,
				connection.address
			);
			setChainBalances(activeChain, result);
		} catch {
			// On error, set default zero balances so UI still renders
			setChainBalances(activeChain, getDefaultBalances(activeChain as ChainId));
		} finally {
			fetchingRef.current = false;
		}
	}, [activeChain, connection, setChainBalances, getDefaultBalances]);

	// Auto-fetch when chain changes or cache is stale
	useEffect(() => {
		if (activeChain && connection && isStale) {
			fetchBalances();
		}
	}, [activeChain, connection, isStale, fetchBalances]);

	// If no cached balances yet, return defaults
	const displayBalances =
		balances ?? (activeChain ? getDefaultBalances(activeChain as ChainId) : []);

	return {
		balances: displayBalances,
		isLoading: fetchingRef.current,
		refresh: fetchBalances,
	};
}
