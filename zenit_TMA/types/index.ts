type SwapDirection = "sell" | "buy";

export interface TokenData {
	type: SwapDirection;
	value: string;
	usdValue: string;
	token: string;
	balance: string;
	iconUrl: string;
}

export interface TradingPairTrend {
	pair: string;
	confidence: number;
	price: number;
	change_24h: number;
	volume_24h: number;
}

export type TimeFrame = "5m" | "30m" | "1h" | "4h" | "1d";

export interface TrendPair {
	pair: string;
	confidence: number;
	price: number;
	change_24h: number;
	volume_24h: number;
	market_cap: number;
	logo_url: string;
}

export interface TrendAnalysisResponse {
	uptrend: TrendPair[];
	downtrend: TrendPair[];
}

export interface TrendAnalysisParams {
	timeframe?: TimeFrame;
	limit?: number;
}

export interface StatisticResponse {
	n_pair: number;
	liquidity: number;
	n_tx: number;
}

export interface Partner {
  name: string;
  logo_url: string;
  url: string;
}
