// Shared types for platform-related API responses
export interface PlatformStatistics {
  // number of trading pairs (string from API)
  n_pair: string;
  // liquidity as string (e.g. "$459.30B")
  liquidity: string;
  // number of transactions or exchanges as string
  n_tx: string;
}

export default PlatformStatistics;
