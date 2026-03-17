/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useState } from "react";
import { useWalletStore } from "@/store/walletStore";
import type { ChainId } from "@/lib/constant";

export type ConnectChainResult =
	| { ok: true; address: string }
	| { ok: false; error: string };

const SOLANA_WALLET_WINDOW_MAP: Record<string, string> = {
	phantom: "phantom",
	solflare: "solflare",
	backpack: "backpack",
	torus: "torusSolana",
	coin98: "coin98",
	coinbase: "coinbaseSolana",
	trust: "trustwallet",
	mathwallet: "solana",
	tokenpocket: "tokenpocket",
	bitkeep: "bitkeep",
	nightly: "nightly",
	clover: "clover_solana",
	xdefi: "xfi",
	onto: "onto",
	huobi: "itoken",
	hyperpay: "hyperpay",
	particle: "particle",
	salmon: "salmon",
	solong: "solong",
	spot: "spotSolana",
	nufi: "nufiSolana",
};

const POLKADOT_INJECTED_MAP: Record<string, string> = {
	"polkadot-js": "polkadot-js",
	talisman: "talisman",
	"subwallet-js": "subwallet-js",
	"nova-wallet": "nova",
	"manta-wallet": "manta-wallet-js",
	polkagate: "polkagate",
	"fearless-wallet": "fearless-wallet",
	enkrypt: "enkrypt",
	"aleph-zero-signer": "aleph-zero-signer",
};

export function getInstalledWalletIds(chainId: ChainId): string[] {
	if (typeof window === "undefined") return [];

	switch (chainId) {
		case "solana": {
			const ids: string[] = [];
			if (window.phantom?.solana?.isPhantom) ids.push("phantom");
			if ((window as any).solflare?.isSolflare) ids.push("solflare");
			if ((window as any).backpack?.isBackpack) ids.push("backpack");
			for (const [id, prop] of Object.entries(SOLANA_WALLET_WINDOW_MAP)) {
				if (!ids.includes(id) && (window as any)[prop]) ids.push(id);
			}
			return ids;
		}
		case "polkadot": {
			if (!window.injectedWeb3) return [];
			const allKeys = Object.keys(window.injectedWeb3);
			const ids: string[] = [];
			for (const [walletId, injectedKey] of Object.entries(POLKADOT_INJECTED_MAP)) {
				if (allKeys.includes(injectedKey)) ids.push(walletId);
			}
			return ids;
		}
		case "hedera": {
			const ids: string[] = [];
			if (window.hashconnect) ids.push("hashpack");
			if (window.bladewallet) ids.push("blade");
			// MetaMask with Hedera Snap
			if (window.ethereum?.isMetaMask) ids.push("metamask-hedera");
			return ids;
		}
		default:
			return [];
	}
}

// ─── Connect per wallet id ────────────────────────────────────────────────────

async function connectSolana(walletId: string): Promise<string> {
	switch (walletId) {
		case "phantom": {
			const provider = window.phantom?.solana;
			if (!provider) throw new Error("Phantom not installed");
			const resp = await provider.connect();
			return resp.publicKey.toString();
		}
		case "solflare": {
			const sf = (window as any).solflare;
			if (!sf) throw new Error("Solflare not installed");
			await sf.connect();
			if (!sf.publicKey) throw new Error("Solflare: no public key");
			return sf.publicKey.toString();
		}
		case "backpack": {
			const bp = (window as any).backpack;
			if (!bp) throw new Error("Backpack not installed");
			const resp = await bp.connect();
			return resp.publicKey.toString();
		}
		default: {
			// Generic Solana wallet connection via window property
			const prop = SOLANA_WALLET_WINDOW_MAP[walletId];
			const provider = prop ? (window as any)[prop]?.solana ?? (window as any)[prop] : null;
			if (!provider) throw new Error(`${walletId} not installed`);
			const resp = await provider.connect();
			const pubkey = resp?.publicKey ?? provider.publicKey;
			if (!pubkey) throw new Error(`${walletId}: no public key`);
			return pubkey.toString();
		}
	}
}

async function connectPolkadot(walletId: string): Promise<string> {
	const web3 = window.injectedWeb3;
	const injectedKey = POLKADOT_INJECTED_MAP[walletId] ?? walletId;
	if (!web3 || !web3[injectedKey]) {
		throw new Error(`${walletId} extension not found`);
	}
	const injected = await web3[injectedKey].enable("Zenit");
	const accounts = await injected.accounts.get();
	if (!accounts.length) throw new Error("No accounts found in extension");
	return accounts[0].address;
}

async function connectHedera(walletId: string): Promise<string> {
	switch (walletId) {
		case "blade": {
			const blade = window.bladewallet;
			if (!blade) throw new Error("Blade wallet not installed");
			const result = await blade.enable();
			return result.accountId;
		}
		case "metamask-hedera": {
			const eth = window.ethereum;
			if (!eth?.isMetaMask) throw new Error("MetaMask not installed");
			const accounts = (await eth.request({
				method: "eth_requestAccounts",
			})) as string[];
			if (!accounts.length) throw new Error("No accounts returned");
			return accounts[0];
		}
		case "hashpack":
			// HashPack uses a pairing-based protocol; open their site as fallback
			throw new Error(
				"HashPack requires the HashPack extension and pairing flow. Please install HashPack and refresh."
			);
		default:
			throw new Error(`Unknown Hedera wallet: ${walletId}`);
	}
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useChainWalletConnect() {
	const { setChainConnection, setActiveChain, removeChainConnection, activeChain } = useWalletStore();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const connect = useCallback(
		async (
			chainId: ChainId,
			walletId: string,
			walletName: string
		): Promise<ConnectChainResult> => {
			setIsLoading(true);
			setError(null);
			try {
				let address = "";
				switch (chainId) {
					case "solana":
						address = await connectSolana(walletId);
						break;
					case "polkadot":
						address = await connectPolkadot(walletId);
						break;
					case "hedera":
						address = await connectHedera(walletId);
						break;
				}
				setChainConnection(chainId, { walletId, walletName, address });
				setActiveChain(chainId);
				return { ok: true, address };
			} catch (e: any) {
				const msg: string = e?.message ?? "Unknown error";
				setError(msg);
				return { ok: false, error: msg };
			} finally {
				setIsLoading(false);
			}
		},
		[setChainConnection, setActiveChain]
	);

	/** Disconnect the currently active chain wallet (or a specific chain if provided). */
	const disconnect = useCallback(
		(chainId?: ChainId) => {
			const target = chainId ?? (activeChain as ChainId | null);
			if (!target) return;

			// Best-effort browser-extension disconnect (errors are non-fatal)
			try {
				if (target === "solana") {
					window.phantom?.solana?.disconnect().catch(() => {});
					(window as any).solflare?.disconnect?.().catch(() => {});
					(window as any).backpack?.disconnect?.().catch(() => {});
				}
			} catch {
				// ignore
			}

			removeChainConnection(target);
		},
		[activeChain, removeChainConnection]
	);

	return { connect, disconnect, isLoading, error };
}
