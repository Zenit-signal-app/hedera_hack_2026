/**
 * Lấy giá từ các nguồn Oracle trong Polkadot ecosystem
 *
 * Nguồn 1: Pyth Network (Hermes API)
 * - https://hermes.pyth.network
 * - Sử dụng bởi Moonbeam, Acala, Astar và các parachain Polkadot
 *
 * Nguồn 2: DIA Oracle
 * - https://api.diadata.org
 * - Polkadot Medianizer, hỗ trợ 20.000+ tài sản
 * - Dùng làm fallback và cho DOT (native Polkadot)
 */

const PYTH_HERMES_URL = "https://hermes.pyth.network";
const PYTH_BENCHMARKS_URL = "https://benchmarks.pyth.network/v1/shims/tradingview";
const DIA_API_URL = "https://api.diadata.org/v1/assetQuotation";

export type PolkadotSymbol =
  | "BTCUSD"
  | "ETHUSD"
  | "DOTUSD"
  | "HBARUSD"
  | "SAUCEUSD"
  | "PACKUSD"
  | "BONZOUSD";

/** Pyth ticker format - must match chart datafeed for price sync */
const BENCHMARKS_SYMBOL: Partial<Record<PolkadotSymbol, string>> = {
  BTCUSD: "Crypto.BTC/USD",
  ETHUSD: "Crypto.ETH/USD",
  HBARUSD: "Crypto.HBAR/USD",
};

// Pyth price feed IDs (hex)
const PYTH_FEED_IDS: Partial<Record<PolkadotSymbol, string>> = {
  BTCUSD: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETHUSD: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  HBARUSD:
    (import.meta.env.VITE_PYTH_HBAR_USD_FEED_ID as string | undefined) ??
    "0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd",
};

// DIA asset names (blockchain/asset)
const DIA_ASSETS: Partial<Record<PolkadotSymbol, string>> = {
  BTCUSD: "Bitcoin",
  ETHUSD: "Ethereum",
};

export type PriceSource = "pyth" | "dia";

export interface AssetPrice {
  price: number;
  formatted: string;
  source: PriceSource;
  timestamp: number;
  symbol: string;
  volume?: number;
}

export interface BtcUsdPrice {
  price: number;
  formatted: string;
  source: PriceSource;
  timestamp: number;
}

function formatPrice(price: number, symbol: string) {
  const decimals = symbol === "HBARUSD" ? 4 : 2;
  return price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// --- Pyth Hermes ---
async function fetchFromPyth(symbol: PolkadotSymbol): Promise<AssetPrice | null> {
  const feedId = PYTH_FEED_IDS[symbol];
  if (!feedId) return null;

  try {
    const url = `${PYTH_HERMES_URL}/v2/updates/price/latest?ids[]=${feedId}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Pyth API error: ${res.status}`);
    }

    const data = await res.json();

    if (!data?.parsed?.[0]) {
      throw new Error("Invalid Pyth response");
    }

    const parsed = data.parsed[0];
    const priceData = parsed.price;
    const priceRaw = BigInt(priceData.price);
    const expo = priceData.expo ?? -8;
    const price = Number(priceRaw) * Math.pow(10, expo);

    return {
      price,
      formatted: formatPrice(price, symbol),
      source: "pyth",
      timestamp: priceData.publish_time ?? Math.floor(Date.now() / 1000),
      symbol,
    };
  } catch (err) {
    console.error(`[PolkadotPrice] Pyth fetch error (${symbol}):`, err);
    return null;
  }
}

// --- DIA Oracle ---
async function fetchFromDia(symbol: PolkadotSymbol): Promise<AssetPrice | null> {
  const assetName = DIA_ASSETS[symbol];
  if (!assetName) return null;

  try {
    const url = `${DIA_API_URL}/${assetName}/0x0000000000000000000000000000000000000000`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`DIA API error: ${res.status}`);
    }

    const data = await res.json();

    if (!data?.Price) {
      throw new Error("Invalid DIA response");
    }

    const price = Number(data.Price);

    return {
      price,
      formatted: formatPrice(price, symbol),
      source: "dia",
      timestamp: data.Time ? Math.floor(new Date(data.Time).getTime() / 1000) : Math.floor(Date.now() / 1000),
      symbol,
    };
  } catch (err) {
    console.error(`[PolkadotPrice] DIA fetch error (${symbol}):`, err);
    return null;
  }
}

// --- Pyth Benchmarks (cùng nguồn với TradingView chart) ---
export async function getPriceFromPythBenchmarks(symbol: PolkadotSymbol): Promise<AssetPrice | null> {
  const benchSymbol = BENCHMARKS_SYMBOL[symbol] ?? symbol;
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 3600; // 1 giờ gần nhất
    const url = `${PYTH_BENCHMARKS_URL}/history?symbol=${encodeURIComponent(benchSymbol)}&resolution=1&from=${from}&to=${now}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Pyth Benchmarks API error: ${res.status}`);
    }

    const data = await res.json();
    if (data?.s !== "ok" || !data?.c?.length) {
      throw new Error("Invalid Pyth Benchmarks response");
    }

    const price = data.c[data.c.length - 1] as number;

    const volumeArr = data.v as number[] | undefined;
    const volume = volumeArr?.length ? volumeArr[volumeArr.length - 1] : undefined;
    return {
      price,
      formatted: formatPrice(price, symbol),
      source: "pyth",
      timestamp: (data.t as number[])?.[data.t.length - 1] ?? now,
      symbol,
      volume,
    };
  } catch (err) {
    console.error(`[PolkadotPrice] Pyth Benchmarks fetch error (${symbol}):`, err);
    return null;
  }
}

/**
 * Lấy giá từ Pyth, fallback sang DIA nếu Pyth lỗi
 */
export async function getPrice(symbol: PolkadotSymbol): Promise<AssetPrice | null> {
  const pythResult = await fetchFromPyth(symbol);
  if (pythResult) return pythResult;

  const diaResult = await fetchFromDia(symbol);
  return diaResult;
}

/**
 * Lấy giá từ tất cả nguồn Polkadot (Pyth ưu tiên, DIA fallback)
 * Trả về map symbol -> price
 */
export async function getAllPolkadotPrices(): Promise<Record<PolkadotSymbol, AssetPrice>> {
  const symbols: Array<PolkadotSymbol> = ["BTCUSD", "ETHUSD", "HBARUSD"];
  const results = await Promise.all(symbols.map((s) => getPrice(s)));

  const map: Record<string, AssetPrice> = {};
  symbols.forEach((s, i) => {
    const r = results[i];
    if (r) map[s] = r;
  });
  return map as Record<PolkadotSymbol, AssetPrice>;
}

/**
 * Lấy giá BTC/USD (giữ tương thích với code cũ)
 */
export async function getBtcUsdPrice(): Promise<BtcUsdPrice | null> {
  const result = await getPrice("BTCUSD");
  if (!result) return null;
  return {
    price: result.price,
    formatted: result.formatted,
    source: result.source,
    timestamp: result.timestamp,
  };
}

export interface BenchmarkHistoryPoint {
  time: number;
  close: number;
  /** Open price (Pyth UDF 'o') */
  open?: number;
  /** High price (Pyth UDF 'h') */
  high?: number;
  /** Low price (Pyth UDF 'l') */
  low?: number;
  volume?: number;
}

export interface BenchmarkHistoryOptions {
  /** TradingView resolution string (e.g. "1", "5", "60", "1D", "1W") - same format as chart datafeed */
  resolution?: string;
  resolutionSeconds?: number;
  rangeHours?: number;
  /** Overrides rangeHours when set: from = to - rangeSeconds */
  rangeSeconds?: number;
  /** Override symbol - use TradingView symbol string for exact chart sync (e.g. "BTCUSD", "Crypto.DOT/USD") */
  symbolOverride?: string;
}

/** Normalize resolution to Pyth UDF format (matches TradingView datafeed) */
function toPythResolution(opts: BenchmarkHistoryOptions): string {
  if (opts.resolution) return opts.resolution;
  const sec = opts.resolutionSeconds ?? 3600;
  if (sec < 3600) return String(Math.round(sec / 60));
  if (sec === 3600) return "60";
  if (sec === 86400) return "1D";
  if (sec === 604800) return "1W";
  return "1D";
}

const PYTH_MAX_RANGE_SECONDS = 360 * 86400;

function resolutionToSeconds(resolution: string): number {
  const r = String(resolution).toUpperCase();
  if (r === "1D" || r === "D") return 86400;
  if (r === "1W" || r === "W") return 604800;
  if (r === "1M" || r === "M") return 2592000;
  const n = parseInt(resolution, 10);
  if (!isNaN(n)) return n * 60;
  return 3600;
}

export async function fetchPythBenchmarkHistory(
  symbol: PolkadotSymbol,
  options: BenchmarkHistoryOptions = {}
): Promise<BenchmarkHistoryPoint[]> {
  const resolution = toPythResolution(options);
  const nowUtc = Math.floor(Date.now() / 1000);
  const resSeconds = resolutionToSeconds(resolution);
  const to = nowUtc + resSeconds;
  const rawRange =
    options.rangeSeconds ?? (options.rangeHours ?? 168) * 3600;
  const rangeSeconds = Math.min(rawRange, PYTH_MAX_RANGE_SECONDS);
  const from = Math.max(0, nowUtc - rangeSeconds);
  const benchSymbol = options.symbolOverride ?? BENCHMARKS_SYMBOL[symbol] ?? symbol;

  const url = `${PYTH_BENCHMARKS_URL}/history?symbol=${encodeURIComponent(benchSymbol)}&resolution=${encodeURIComponent(resolution)}&from=${from}&to=${to}`;
  const res = await fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } });
  if (!res.ok) {
    throw new Error(`Pyth Benchmarks history error: ${res.status}`);
  }

  const data = await res.json();
  if (data?.s !== "ok" || !Array.isArray(data.t) || !Array.isArray(data.c)) {
    return [];
  }

  const length = Math.min(data.t.length, data.c.length);
  const volumeArr = Array.isArray(data.v) ? data.v : [];
  const openArr = Array.isArray(data.o) ? data.o : [];
  const highArr = Array.isArray(data.h) ? data.h : [];
  const lowArr = Array.isArray(data.l) ? data.l : [];

  const points: BenchmarkHistoryPoint[] = [];
  for (let i = 0; i < length; i += 1) {
    const time = data.t[i];
    const close = data.c[i];
    if (typeof time !== "number" || typeof close !== "number") continue;
    points.push({
      time,
      close,
      open: typeof openArr[i] === "number" ? openArr[i] : undefined,
      high: typeof highArr[i] === "number" ? highArr[i] : undefined,
      low: typeof lowArr[i] === "number" ? lowArr[i] : undefined,
      volume: typeof volumeArr[i] === "number" ? volumeArr[i] : undefined,
    });
  }

  // Chart libraries require strictly ascending order by time (no duplicates)
  points.sort((a, b) => a.time - b.time);
  const seen = new Set<number>();
  return points.filter((p) => {
    if (seen.has(p.time)) return false;
    seen.add(p.time);
    return true;
  });
}
