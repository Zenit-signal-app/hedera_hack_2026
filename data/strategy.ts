export interface StrategyCardData {
  id: string;
  title: string;
  description: string;
  iconUrl: string; // Đường dẫn icon
  annualReturn: string; // Ví dụ: "46.6%"
  tvl: string; // Ví dụ: "$26.7K"
  bgGradient: string; // Gradient background
  subStats: {
    maxDrawdown: string;
    sharpe: string;
    sortino: string;
    age: string;
  };
  vaultInfo?: {
    vaultType: string; // "Enzyme"
    vaultTypeIcon: string; // Icon path or component name
    blockchain: string; // "Cardano"
    blockchainIcon: string; // Icon path
    address: string; // Vault address
  };
}

export const mockStrategies: StrategyCardData[] = [
  {
    id: "eth-btc-swing",
    title: "ETH-BTC long swing",
    description: "ETH and BTC slow moving momentum strategy on Arbitrum",
    iconUrl: "/images/eth.png",
    annualReturn: "46.6%",
    tvl: "$26.7K",
    bgGradient:
      "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(30, 58, 138, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)",
    subStats: {
      maxDrawdown: "2.8%",
      sharpe: "1.54",
      sortino: "12.88",
      age: "392 days",
    },
    vaultInfo: {
      vaultType: "Enzyme",
      vaultTypeIcon: "E",
      blockchain: "Cardano",
      blockchainIcon: "/images/ada.png",
      address: "0x53b23bDOCe01bAd74A314B8C5e7E891e27c13D5a",
    },
  },
  {
    id: "btc",
    title: "BTC",
    description: "ETH and BTC slow moving momentum strategy on Arbitrum",
    iconUrl: "/images/btc.png",
    annualReturn: "46.6%",
    tvl: "$26.7K",
    bgGradient:
      "linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(146, 64, 14, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)",
    subStats: {
      maxDrawdown: "2.8%",
      sharpe: "1.54",
      sortino: "12.88",
      age: "392 days",
    },
  },
  {
    id: "doge",
    title: "DOGE",
    description: "DOGE slow moving momentum strategy on Arbitrum",
    iconUrl: "/images/DogecoinBadge.png",
    annualReturn: "46.6%",
    tvl: "$26.7K",
    bgGradient:
      "linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(107, 33, 168, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)",
    subStats: {
      maxDrawdown: "2.8%",
      sharpe: "1.54",
      sortino: "12.88",
      age: "392 days",
    },
  },
  {
    id: "brett",
    title: "Brett",
    description: "Brett slow moving momentum strategy on Arbitrum",
    iconUrl: "/images/BasedBrett.png",
    annualReturn: "46.6%",
    tvl: "$26.7K",
    bgGradient:
      "linear-gradient(135deg, rgba(236, 72, 153, 0.12) 0%, rgba(157, 23, 77, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)",
    subStats: {
      maxDrawdown: "2.8%",
      sharpe: "1.54",
      sortino: "12.88",
      age: "392 days",
    },
  },
  {
    id: "ada",
    title: "ADA",
    description: "ADA slow moving momentum strategy on Arbitrum",
    iconUrl: "/images/ada.png",
    annualReturn: "46.6%",
    tvl: "$26.7K",
    bgGradient:
      "linear-gradient(135deg, rgba(190, 18, 60, 0.15) 0%, rgba(136, 19, 55, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)",
    subStats: {
      maxDrawdown: "2.8%",
      sharpe: "1.54",
      sortino: "12.88",
      age: "392 days",
    },
  },
  {
    id: "link",
    title: "LINK",
    description: "LINK slow moving momentum strategy on Arbitrum",
    iconUrl: "/images/Group.png",
    annualReturn: "46.6%",
    tvl: "$26.7K",
    bgGradient:
      "linear-gradient(135deg, rgba(30, 64, 175, 0.15) 0%, rgba(17, 24, 39, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)",
    subStats: {
      maxDrawdown: "2.8%",
      sharpe: "1.54",
      sortino: "12.88",
      age: "392 days",
    },
  },
  {
    id: "iag",
    title: "IAG",
    description: "IAG slow moving momentum strategy on Arbitrum",
    iconUrl: "/images/IAG.png",
    annualReturn: "46.6%",
    tvl: "$26.7K",
    bgGradient:
      "linear-gradient(135deg, rgba(156, 163, 175, 0.12) 0%, rgba(75, 85, 99, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)",
    subStats: {
      maxDrawdown: "2.8%",
      sharpe: "1.54",
      sortino: "12.88",
      age: "392 days",
    },
  },
  {
    id: "wmtx",
    title: "WMTX",
    description: "WMTX slow moving momentum strategy on Arbitrum",
    iconUrl: "/images/WMTX.png",
    annualReturn: "46.6%",
    tvl: "$26.7K",
    bgGradient:
      "linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(180, 83, 9, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)",
    subStats: {
      maxDrawdown: "2.8%",
      sharpe: "1.54",
      sortino: "12.88",
      age: "392 days",
    },
  },
  {
    id: "snek",
    title: "SNEK",
    description: "SNEK slow moving momentum strategy on Arbitrum",
    iconUrl: "/images/SNEK.png",
    annualReturn: "46.6%",
    tvl: "$26.7K",
    bgGradient:
      "linear-gradient(135deg, rgba(20, 184, 166, 0.15) 0%, rgba(13, 148, 136, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)",
    subStats: {
      maxDrawdown: "2.8%",
      sharpe: "1.54",
      sortino: "12.88",
      age: "392 days",
    },
  },
];
