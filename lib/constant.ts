export const listNavigators = [
	{
		text: "Analysis",
		url: "/analysis",
	},

	{
		text: "Asset Vault",
		url: "/asset-vault",
	},
	{
		text: "AI Asistant",
		url: "/ai-asistant",
	},
	{
		text: "PortFolio",
		url: "/portfolio",
	},
];

export interface WalletInfo {
	id: string; 
	name: string;
	icon: string; 
	url?: string;
}

export const SUPPORTED_WALLETS: WalletInfo[] = [
	{
		id: "eternl",
		name: "Eternl",
		icon: "/images/eternl.png",
		url: "https://eternl.io/",
	},
	{
		id: "vespr",
		name: "Vespr",
		icon: "/images/vespr.png",
		url: "https://www.vespr.xyz/",
	},
	{
		id: "lace",
		name: "Lace",
		icon: "/images/lace.png",
		url: "https://lace.io/",
	},
	{
		id: "okx",
		name: "OKX Wallet",
		icon: "/images/okx.png",
		url: "https://www.okx.com/web3",
	},
	{
		id: "typhon",
		name: "Typhon",
		icon: "/images/typhon.png",
		url: "https://typhonwallet.io/",
	},
	{
		id: "tokeo",
		name: "Tokeo",
		icon: "/images/tokeo.png",
		url: "https://tokeo.io/",
	},
	{
		id: "flint",
		name: "Flint",
		icon: "/images/flint.png",
		url: "https://flint-wallet.com/",
	},
	{
		id: "nami",
		name: "Nami",
		icon: "/images/nami.png",
		url: "https://namiwallet.io/",
	},
	{
		id: "yoroi",
		name: "Yoroi",
		icon: "/images/yoroi.png",
		url: "https://yoroi-wallet.com/",
	},
];
