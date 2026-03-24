/**
 * Custom TradingView Datafeed - Binance API
 * Lấy dữ liệu OHLCV từ Binance (BTCUSDT, ETHUSDT, ...)
 */

const BINANCE_API = "https://api.binance.com/api/v3";
// CORS proxy - Binance chặn CORS từ browser
const CORS_PROXIES = [
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

async function fetchApi<T>(url: string): Promise<T> {
  let lastError: Error | null = null;
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy(url));
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const text = await res.text();
      return JSON.parse(text) as T;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      continue;
    }
  }
  throw lastError || new Error("Fetch failed");
}

const RESOLUTION_MAP: Record<string, string> = {
  "1": "1m",
  "3": "3m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "120": "2h",
  "240": "4h",
  "360": "6h",
  "720": "12h",
  D: "1d",
  "1D": "1d",
  "3D": "3d",
  W: "1w",
  "1W": "1w",
  M: "1M",
  "1M": "1M",
};

export function createBinanceDatafeed() {
  const symbols: { symbol: string; baseAsset: string; quoteAsset: string }[] = [
    { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" },
    { symbol: "ETHUSDT", baseAsset: "ETH", quoteAsset: "USDT" },
    { symbol: "BNBUSDT", baseAsset: "BNB", quoteAsset: "USDT" },
    { symbol: "SOLUSDT", baseAsset: "SOL", quoteAsset: "USDT" },
    { symbol: "XRPUSDT", baseAsset: "XRP", quoteAsset: "USDT" },
  ];

  return {
    onReady: (callback: (config: Record<string, unknown>) => void) => {
      setTimeout(() => {
        callback({
          supports_marks: false,
          supports_timescale_marks: false,
          supports_time: true,
          supported_resolutions: ["1", "5", "15", "30", "60", "240", "1D", "1W"],
        });
      }, 0);
    },

    searchSymbols: (
      userInput: string,
      _exchange: string,
      _type: string,
      onResult: (result: unknown[]) => void,
      _onError?: (msg: string) => void
    ) => {
      const upper = userInput.toUpperCase();
      const filtered = symbols
        .filter((s) => s.symbol.includes(upper) || s.baseAsset.includes(upper))
        .map((s) => ({
          symbol: s.symbol,
          full_name: s.symbol,
          description: `${s.baseAsset} / ${s.quoteAsset}`,
          ticker: s.symbol,
        }));
      onResult(filtered);
    },

    resolveSymbol: (
      symbolName: string,
      onResolve: (symbolInfo: Record<string, unknown>) => void,
      _onError: (msg: string) => void
    ) => {
      const sym = symbolName.replace("BINANCE:", "").toUpperCase();
      const found = symbols.find((s) => s.symbol === sym) || symbols[0];

      setTimeout(() => {
        onResolve({
          name: found.symbol,
          description: `${found.baseAsset} / ${found.quoteAsset}`,
          ticker: found.symbol,
          session: "24x7",
          minmov: 1,
          pricescale: 100,
          timezone: "UTC",
          has_intraday: true,
          has_daily: true,
          has_weekly_and_monthly: true,
          supported_resolutions: ["1", "5", "15", "30", "60", "240", "1D", "1W"],
        });
      }, 0);
    },

    getBars: (
      symbolInfo: { name: string },
      resolution: string,
      periodParams: { from: number; to: number; countBack?: number },
      onResult: (bars: unknown[], meta: { noData?: boolean }) => void,
      onError: (err: string) => void
    ) => {
      const interval = RESOLUTION_MAP[resolution] || "1d";
      const from = periodParams.from * 1000;
      const to = periodParams.to * 1000;
      const limit = 1000;

      const url = `${BINANCE_API}/klines?symbol=${symbolInfo.name}&interval=${interval}&limit=${limit}&startTime=${from}&endTime=${to}`;

      fetchApi<number[][]>(url)
        .then((klines) => {
          if (klines.length === 0) {
            onResult([], { noData: true });
            return;
          }
          const bars = klines.map((k) => ({
            time: Math.floor(k[0] / 1000),
            open: parseFloat(String(k[1])),
            high: parseFloat(String(k[2])),
            low: parseFloat(String(k[3])),
            close: parseFloat(String(k[4])),
            volume: parseFloat(String(k[5])),
          }));
          onResult(bars, { noData: false });
        })
        .catch((err) => {
          console.error("[BinanceDatafeed]", err);
          onError("Không thể tải dữ liệu");
        });
    },

    subscribeBars: () => {},
    unsubscribeBars: () => {},
  };
}
