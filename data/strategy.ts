export interface StrategyCardData {
  id: string;
  title: string;
  description: string;
  iconUrl: string; // Đường dẫn icon
  annualReturn: string; // Ví dụ: "46.6%"
  tvl: string; // Ví dụ: "$26.7K"
}


export const mockStrategies: StrategyCardData[] = [
  {
    id: 'eth-btc-swing',
    title: 'ETH-BTC long swing',
    description: 'ETH and BTC slow moving momentum strategy...',
    iconUrl: '/icons/eth-btc.svg', // Icon tổng hợp ETH/BTC
    annualReturn: '46.6%',
    tvl: '$26.7K',
  },
  {
    id: 'btc',
    title: 'BTC',
    description: 'ETH and BTC slow moving momentum strat...',
    iconUrl: '/icons/btc.svg', // Icon BTC
    annualReturn: '46.6%',
    tvl: '$26.7K',
  },
  {
    id: 'doge',
    title: 'DOGE',
    description: 'DOGE slow moving momentum strategy on...',
    iconUrl: '/icons/doge.svg', // Icon DOGE
    annualReturn: '46.6%',
    tvl: '$26.7K',
  },
  {
    id: 'brett',
    title: 'Brett',
    description: 'Brett slow moving momentum strategy on A...',
    iconUrl: '/icons/brett.svg', // Icon Brett (Mascot)
    annualReturn: '46.6%',
    tvl: '$26.7K',
  },
  {
    id: 'ada',
    title: 'ADA',
    description: 'ADA slow moving momentum strategy on A...',
    iconUrl: '/icons/ada.svg', // Icon ADA
    annualReturn: '46.6%',
    tvl: '$26.7K',
  },
  {
    id: 'link',
    title: 'LINK',
    description: 'LINK slow moving momentum strategy on A...',
    iconUrl: '/icons/link.svg', // Icon LINK
    annualReturn: '46.6%',
    tvl: '$26.7K',
  },
  // ... (Tiếp tục với IAG, WMTX, SNEK)
];