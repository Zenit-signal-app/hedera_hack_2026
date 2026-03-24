import { useState, useEffect, useRef } from "react";
import { FootprintBar } from "@/hooks/binanceFootprintTypes";
import { BinanceFootprintManager } from "@/hooks/useBinanceFootprint";

interface AggTrade {
  T: number;   // trade time ms
  p: string;   // price
  q: string;   // quantity
  m: boolean;  // isBuyerMaker → true = sell order hit bid
}

/** Binance kline: [openTime, open, high, low, close, volume, closeTime, ...] */
type Kline = [number, string, string, string, string, string, number, ...unknown[]];

const KLINES_INTERVALS: [number, string][] = [
  [2592000, "1M"],
  [604800, "1w"],
  [86400, "1d"],
  [43200, "12h"],
  [28800, "8h"],
  [21600, "6h"],
  [14400, "4h"],
  [7200, "2h"],
  [3600, "1h"],
  [1800, "30m"],
  [900, "15m"],
  [300, "5m"],
  [180, "3m"],
  [60, "1m"],
];

function barSecondsToKlinesInterval(barSeconds: number): string {
  for (const [sec, interval] of KLINES_INTERVALS) {
    if (barSeconds >= sec) return interval;
  }
  return "1m";
}

async function fetchKlines(
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
  limit = 1000
): Promise<Kline[]> {
  const url =
    `https://fapi.binance.com/fapi/v1/klines` +
    `?symbol=${symbol}&interval=${interval}&startTime=${startMs}&endTime=${endMs}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Binance klines ${res.status}`);
  return res.json();
}

function aggregateToBars(
  trades: AggTrade[],
  barSeconds: number,
  priceBin: number
): FootprintBar[] {
  const barsMap = new Map<number, FootprintBar>();
  const decimals = Math.max(0, -Math.floor(Math.log10(priceBin)));

  for (const trade of trades) {
    const ts = trade.T / 1000;
    const barStart = Math.floor(ts / barSeconds) * barSeconds;
    const price = Number(trade.p);
    const qty = Number(trade.q);
    const levelPrice = Math.round(price / priceBin) * priceBin;
    const level = levelPrice.toFixed(decimals);

    if (!barsMap.has(barStart)) {
      barsMap.set(barStart, {
        barStart,
        barEnd: barStart + barSeconds,
        open: price,
        high: price,
        low: price,
        close: price,
        clusters: {},
      });
    }

    const bar = barsMap.get(barStart)!;
    bar.high = Math.max(bar.high, price);
    bar.low = Math.min(bar.low, price);
    bar.close = price;

    if (!bar.clusters[level]) {
      bar.clusters[level] = { buy_vol: 0, sell_vol: 0, total_vol: 0 };
    }
    const c = bar.clusters[level];
    if (trade.m) {
      c.sell_vol += qty;
    } else {
      c.buy_vol += qty;
    }
    c.total_vol += qty;
  }

  for (const bar of barsMap.values()) {
    let vpocLevel = "";
    let vpocVol = 0;
    for (const [level, c] of Object.entries(bar.clusters)) {
      if (c.total_vol > vpocVol) {
        vpocVol = c.total_vol;
        vpocLevel = level;
      }
    }
    bar.vpocPrice = vpocLevel;
  }

  return Array.from(barsMap.values()).sort((a, b) => a.barStart - b.barStart);
}

function klinesToBars(klines: Kline[]): FootprintBar[] {
  return klines.map((k) => {
    const barStart = Math.floor(k[0] / 1000);
    const open = Number(k[1]);
    const high = Number(k[2]);
    const low = Number(k[3]);
    const close = Number(k[4]);
    const barEnd = Math.floor(k[6] / 1000) + 1;
    return {
      barStart,
      barEnd,
      open,
      high,
      low,
      close,
      clusters: {},
    };
  });
}

function mergeClustersIntoBars(
  baseBars: FootprintBar[],
  aggBars: FootprintBar[]
): FootprintBar[] {
  const clusterMap = new Map<number, Record<string, { buy_vol: number; sell_vol: number; total_vol: number }>>();
  for (const b of aggBars) {
    if (Object.keys(b.clusters).length > 0) {
      clusterMap.set(b.barStart, b.clusters);
    }
  }
  return baseBars.map((bar) => {
    const clusters = clusterMap.get(bar.barStart);
    if (clusters) {
      let vpocLevel = "";
      let vpocVol = 0;
      for (const [level, c] of Object.entries(clusters)) {
        if (c.total_vol > vpocVol) {
          vpocVol = c.total_vol;
          vpocLevel = level;
        }
      }
      return { ...bar, clusters, vpocPrice: vpocLevel };
    }
    return bar;
  });
}

/** 7:00 UTC+7 = 00:00 UTC (start of day UTC). Returns ms. */
function getStartOfTodayUTC(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

async function fetchAggTrades(
  symbol: string,
  startMs: number,
  endMs: number,
  maxRequests = 5
): Promise<AggTrade[]> {
  const all: AggTrade[] = [];
  let fromMs = startMs;
  let requests = 0;

  while (fromMs < endMs && requests < maxRequests) {
    const url =
      `https://fapi.binance.com/fapi/v1/aggTrades` +
      `?symbol=${symbol}&startTime=${fromMs}&endTime=${endMs}&limit=1000`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Binance API ${res.status}`);
    const batch: AggTrade[] = await res.json();
    requests++;
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    fromMs = batch[batch.length - 1].T + 1;
  }

  return all;
}

/** Convert TradingView resolution string to seconds */
export function tvResolutionToSeconds(resolution: string): number {
  const r = String(resolution ?? "1").trim().toUpperCase();
  if (r === "1D" || r === "D") return 86400;
  if (r === "1W" || r === "W") return 604800;
  if (r === "1M" || r === "M") return 2592000;
  const n = parseInt(r, 10);
  if (!isNaN(n)) return n * 60;
  return 60;
}

/** Num bars (klines) and max aggTrades requests. aggTrades focused on RECENT period for footprint clusters. */
function adaptiveNumBars(barSeconds: number): {
  numBars: number;
  maxRequests: number;
  recentBarsForClusters: number;
} {
  if (barSeconds <= 60)   return { numBars: 60, maxRequests: 40, recentBarsForClusters: 30 };
  if (barSeconds <= 300)  return { numBars: 48, maxRequests: 40, recentBarsForClusters: 24 };
  if (barSeconds <= 900)  return { numBars: 36, maxRequests: 36, recentBarsForClusters: 18 };
  if (barSeconds <= 1800) return { numBars: 28, maxRequests: 32, recentBarsForClusters: 14 };
  if (barSeconds <= 3600) return { numBars: 24, maxRequests: 32, recentBarsForClusters: 12 };
  if (barSeconds <= 14400) return { numBars: 16, maxRequests: 28, recentBarsForClusters: 8 };
  if (barSeconds <= 86400) return { numBars: 14, maxRequests: 80, recentBarsForClusters: 5 };
  return { numBars: 30, maxRequests: 60, recentBarsForClusters: 5 };
}

export default function useBinanceFootprintHistory(
  symbol: string = "BTCUSDT",
  barSeconds: number = 60,
  priceBin: number = 100,
  numBarsOverride?: number,
  refreshMs: number = 60_000
) {
  const [bars, setBars] = useState<FootprintBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const shouldReconnect = useRef(true);

  const adaptiveParams = adaptiveNumBars(barSeconds);
  const baseNumBars = adaptiveParams.numBars;
  const baseMaxRequests = adaptiveParams.maxRequests;
  const recentBarsForClusters = adaptiveParams.recentBarsForClusters;
  const effectiveNumBars = numBarsOverride ?? baseNumBars;
  const requestMultiplier = Math.max(1, Math.ceil(effectiveNumBars / baseNumBars));
  const maxRequests = baseMaxRequests * requestMultiplier;

  useEffect(() => {
    cancelRef.current = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const nowMs = Date.now();
        const currentBarStart = Math.floor(nowMs / 1000 / barSeconds) * barSeconds * 1000;
        const klinesStartMs = currentBarStart - effectiveNumBars * barSeconds * 1000;

        const startOfTodayUTC = getStartOfTodayUTC();
        const aggTradesStartMs = Math.max(
          startOfTodayUTC,
          currentBarStart - recentBarsForClusters * barSeconds * 1000
        );

        const interval = barSecondsToKlinesInterval(barSeconds);
        const [klines, trades] = await Promise.all([
          fetchKlines(symbol, interval, klinesStartMs, nowMs, Math.min(effectiveNumBars + 5, 1000)),
          fetchAggTrades(symbol, aggTradesStartMs, nowMs, maxRequests),
        ]);
        if (cancelRef.current) return;

        const baseBars = klinesToBars(klines);
        const aggBars = aggregateToBars(trades, barSeconds, priceBin);
        const merged = mergeClustersIntoBars(baseBars, aggBars);
        setBars(merged);
      } catch (e: unknown) {
        if (!cancelRef.current) {
          setError(e instanceof Error ? e.message : "Fetch error");
        }
      } finally {
        if (!cancelRef.current) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, refreshMs);
    return () => {
      cancelRef.current = true;
      clearInterval(timer);
    };
  }, [symbol, barSeconds, priceBin, numBarsOverride, refreshMs, effectiveNumBars, maxRequests]);

  useEffect(() => {
    shouldReconnect.current = true;
    const manager = new BinanceFootprintManager(barSeconds, priceBin);
    const wsSymbol = symbol.toLowerCase();
    const connect = () => {
      const ws = new WebSocket(`wss://fstream.binance.com/ws/${wsSymbol}@aggTrade`);
      wsRef.current = ws;
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const completedBar = manager.processTrade(payload);
          if (completedBar) {
            setBars((prev) => {
              const last = prev[prev.length - 1];
              const replace = last?.barStart === completedBar.barStart;
              const next = replace
                ? [...prev.slice(0, -1), completedBar]
                : [...prev, completedBar];
              return next.length > effectiveNumBars ? next.slice(-effectiveNumBars) : next;
            });
          }
        } catch (error) {
          console.error("Footprint history websocket error", error);
        }
      };
      ws.onclose = () => {
        if (shouldReconnect.current) {
          reconnectTimer.current = window.setTimeout(connect, 1000);
        }
      };
      ws.onerror = () => {
        ws.close();
      };
    };

    connect();
    return () => {
      shouldReconnect.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [symbol, barSeconds, priceBin, effectiveNumBars]);

  return { bars, loading, error };
}
