import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface OIPoint {
  time: number;       // unix seconds
  openInterest: number; // in USD
}

export interface LSPoint {
  time: number;
  longAccount: number;  // % longs (0–1)
  shortAccount: number; // % shorts (0–1)
  lsRatio: number;      // longAccount / shortAccount
}

export interface FundingPoint {
  time: number;
  fundingRate: number; // e.g. 0.0001 = 0.01%
}

export interface FuturesLiquidityData {
  oi: OIPoint[];
  ls: LSPoint[];
  funding: FundingPoint[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const POLKADOT_TO_BINANCE: Record<string, string> = {
  BTCUSD:  "BTCUSDT",
  ETHUSD:  "ETHUSDT",
  DOTUSD:  "DOTUSDT",
};

function tvResolutionToBinancePeriod(tv: string): string {
  if (tv === "1D" || tv === "D") return "1d";
  if (tv === "1W" || tv === "W") return "1d"; // weekly not supported, use daily
  const m = Number(tv);
  if (m >= 240) return "4h";
  if (m >= 60)  return "1h";
  if (m >= 30)  return "30m";
  if (m >= 15)  return "15m";
  return "5m"; // minimum for OI hist endpoint
}

function limitForPeriod(period: string): number {
  switch (period) {
    case "1d":  return 200;
    case "4h":  return 300;
    case "1h":  return 500;
    case "30m": return 500;
    case "15m": return 500;
    default:    return 500;
  }
}

async function fetchOI(symbol: string, period: string, limit: number): Promise<OIPoint[]> {
  const url = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OI fetch failed: ${res.status}`);
  const raw: { timestamp: number; sumOpenInterestValue: string }[] = await res.json();
  return raw.map((r) => ({
    time: Math.floor(r.timestamp / 1000),
    openInterest: Number(r.sumOpenInterestValue),
  })).sort((a, b) => a.time - b.time);
}

async function fetchLS(symbol: string, period: string, limit: number): Promise<LSPoint[]> {
  const url = `https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=${period}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`L/S fetch failed: ${res.status}`);
  const raw: { timestamp: number; longAccount: string; shortAccount: string; longShortRatio: string }[] = await res.json();
  return raw.map((r) => ({
    time: Math.floor(r.timestamp / 1000),
    longAccount: Number(r.longAccount),
    shortAccount: Number(r.shortAccount),
    lsRatio: Number(r.longShortRatio),
  })).sort((a, b) => a.time - b.time);
}

async function fetchFunding(symbol: string, limit: number): Promise<FundingPoint[]> {
  const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Funding fetch failed: ${res.status}`);
  const raw: { fundingTime: number; fundingRate: string }[] = await res.json();
  return raw.map((r) => ({
    time: Math.floor(r.fundingTime / 1000),
    fundingRate: Number(r.fundingRate),
  })).sort((a, b) => a.time - b.time);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
interface UseBinanceFuturesLiquidityResult {
  data: FuturesLiquidityData;
  loading: boolean;
  error: string | null;
  lastUpdate: string;
}

export function useBinanceFuturesLiquidity(
  symbol: string,
  resolution = "1D"
): UseBinanceFuturesLiquidityResult {
  const [data, setData] = useState<FuturesLiquidityData>({ oi: [], ls: [], funding: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState("—");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const binanceSymbol = POLKADOT_TO_BINANCE[symbol] ?? "BTCUSDT";
    const period = tvResolutionToBinancePeriod(resolution);
    const limit = limitForPeriod(period);

    async function load() {
      try {
        const [oi, ls, funding] = await Promise.all([
          fetchOI(binanceSymbol, period, limit),
          fetchLS(binanceSymbol, period, limit),
          fetchFunding(binanceSymbol, Math.min(limit, 500)),
        ]);
        if (!cancelled) {
          setData({ oi, ls, funding });
          setLastUpdate(new Date().toLocaleTimeString());
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Fetch failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    load();

    timerRef.current = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [symbol, resolution]);

  return { data, loading, error, lastUpdate };
}
