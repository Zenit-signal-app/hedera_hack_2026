export const NETWORK_ENV = process.env.NEXT_PUBLIC_NETWORK || "mainnet";
export const IS_TESTNET = NETWORK_ENV === "testnet";

export const NETWORK_CONFIG = {
	solana: {
		rpc:
			process.env.NEXT_PUBLIC_SOLANA_RPC ||
			(IS_TESTNET
				? "https://api.devnet.solana.com"
				: "https://api.mainnet-beta.solana.com"),
		explorer: IS_TESTNET
			? "https://solscan.io/tx/"
			: "https://solscan.io/tx/", // For Solana explorer, we will append ?cluster=devnet in the service wrapper
	},
	polkadot: {
		rpc:
			process.env.NEXT_PUBLIC_POLKADOT_RPC ||
			(IS_TESTNET
				? "wss://westend-rpc.polkadot.io"
				: "wss://rpc.polkadot.io"),
		rpc_http:
			process.env.NEXT_PUBLIC_POLKADOT_RPC_HTTP ||
			(IS_TESTNET
				? "https://westend-rpc.polkadot.io"
				: "https://rpc.polkadot.io"),
		explorer: IS_TESTNET
			? "https://westend.subscan.io/extrinsic/"
			: "https://polkadot.subscan.io/extrinsic/",
	},
	hedera: {
		rpc:
			process.env.NEXT_PUBLIC_HEDERA_RPC ||
			(IS_TESTNET
				? "https://testnet.mirrornode.hedera.com"
				: "https://mainnet-public.mirrornode.hedera.com"),
		explorer: IS_TESTNET
			? "https://hashscan.io/testnet/transaction/"
			: "https://hashscan.io/mainnet/transaction/",
	},
};

export const listNavigators = [
	// {
	// 	text: "Analysis",
	// 	url: "/analysis",
	// },

	{
		text: "Asset Vault",
		url: "/asset-vault",
	},
	// {
	// 	text: "AI Assistant",
	// 	url: "/ai-assistant",
	// },
	// {
	// 	text: "PortFolio",
	// 	url: "/portfolio",
	// },
];

// ─── Multi-Chain Support ───────────────────────────────────────────────────────

export type ChainId = "solana" | "polkadot" | "hedera";

export interface ChainWalletInfo {
	id: string;
	name: string;
	/** Path or URL to icon. May be missing – use `bgColor` + initials as fallback. */
	icon?: string;
	url?: string;
	/** Brand color used as avatar background when icon is unavailable. */
	bgColor: string;
}

/** Chain record returned by GET /chains */
export interface ServerChain {
	id: number;
	name: string;
	slug: string;
	native_token: string;
	created_at: string;
}

export interface ChainDefinition {
	id: ChainId;
	name: string;
	/** Numeric ID from the server's /chains endpoint, matched by slug. */
	serverChainId?: number;
	/** Brand color for UI accents / chain badge. */
	color: string;
	/** Chain logo path (relative to /public). */
	logo: string;
	wallets: ChainWalletInfo[];
}

export const CHAIN_DEFINITIONS: ChainDefinition[] = [
	{
		id: "solana",
		name: "Solana",
		color: "#9945FF",
		logo: "/images/solana.png",
		wallets: [
			{
				id: "phantom",
				name: "Phantom",
				icon: "/icons/wallet-adapter_phantom_adapter_b64_0.svg",
				bgColor: "#AB9FF2",
				url: "https://phantom.com",
			},
			{
				id: "solflare",
				name: "Solflare",
				icon: "/icons/wallet-adapter_solflare_adapter_b64_0.svg",
				bgColor: "#FC6320",
				url: "https://solflare.com",
			},
		],
	},
	{
		id: "polkadot",
		name: "Polkadot",
		color: "#E6007A",
		logo: "/images/polkadot.png",
		wallets: [
			{
				id: "talisman",
				name: "Talisman",
				icon: "/icons/talisman.svg",
				bgColor: "#D5FF5C",
				url: "https://talisman.xyz",
			},
			{
				id: "nova-wallet",
				name: "Nova Wallet",
				icon: "/icons/nova_wallet.png",
				bgColor: "#3D67FF",
				url: "https://novawallet.io",
			},

			{
				id: "metamask-polkadot",
				name: "MetaMask",
				icon: "/icons/metamask.png",
				bgColor: "#F5841F",
				url: "https://metamask.io",
			},
		],
	},
	{
		id: "hedera",
		name: "Hedera",
		color: "#00AAEC",
		logo: "/images/hedera.png",
		wallets: [
			{
				id: "hashpack",
				name: "HashPack",
				bgColor: "#4C26F5",
				url: "https://www.hashpack.app",
				icon: "/icons/hashpack.png",
			},
			{
				id: "metamask-hedera",
				name: "MetaMask",
				bgColor: "#F5841F",
				url: "https://metamask.io",
				icon: "/icons/metamask.png",
			},
		],
	},
];

// ─── Default tokens to show per chain ──────────────────────────────────────────

export interface DefaultChainToken {
	symbol: string;
	name: string;
	logo: string;
	decimals: number;
	/** For Solana SPL tokens, the mint address. Omit for native. */
	mintAddress?: string;
}

export const DEFAULT_CHAIN_TOKENS: Record<ChainId, DefaultChainToken[]> = {
	solana: [
		{
			symbol: "SOL",
			name: "Solana",
			logo: "/images/sol.png",
			decimals: 9,
		},
		{
			symbol: "USDC",
			name: "USD Coin",
			logo: "/images/usdc.png",
			decimals: 6,
			mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
		},
		{
			symbol: "USDT",
			name: "Tether USD",
			logo: "/images/usdt.png",
			decimals: 6,
			mintAddress: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
		},
	],
	polkadot: [
		{
			symbol: "DOT",
			name: "Polkadot",
			logo: "/images/dot.png",
			decimals: 10,
		},
		{
			symbol: "USDC",
			name: "USD Coin",
			logo: "/images/usdc.png",
			decimals: 6,
		},
		{
			symbol: "USDT",
			name: "Tether USD",
			logo: "/images/usdt.png",
			decimals: 6,
		},
	],
	hedera: [
		{
			symbol: "HBAR",
			name: "Hedera",
			logo: "/images/hbar.png",
			decimals: 8,
		},
		{
			symbol: "USDC",
			name: "USD Coin",
			logo: "/images/usdc.png",
			decimals: 6,
		},
		{
			symbol: "USDT",
			name: "Tether USD",
			logo: "/images/usdt.png",
			decimals: 6,
		},
	],
};

// Flat list of all supported wallets across chains (used by ModalConnectWallet)
export const SUPPORTED_WALLETS = CHAIN_DEFINITIONS.flatMap((chain) =>
	chain.wallets.map((w) => ({ ...w, chainId: chain.id })),
);
