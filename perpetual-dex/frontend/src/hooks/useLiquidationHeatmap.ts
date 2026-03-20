/**
 * useLiquidationHeatmap
 *
 * Builds a "Liquidation Heatmap" similar to Coinglass by combining:
 *  1. Binance Futures klines  → estimate WHERE positions are clustered
 *     (historical candle price × volume → likely entry levels)
 *     → model long / short liq prices at common leverage levels
 *  2. Binance WebSocket forceOrder stream → accumulate LIVE liquidation events
 *     (no API key required)
 *
 * The "estimated zone density" at each price bucket is:
 *   Σ (candle_quote_vol × leverage_weight[L] × time_decay) for all
 *   entries whose liq price falls in that bucket.
 */

import { useEffect, useRef, useState } from "react";

// ─── Public types ─────────────────────────────────────────────────────────────

/** One price-bucket in the density map */
export interface LiqBucket {
  priceCenter: number;
  longQty: number;  // estimated USD in long liquidations
  shortQty: number; // estimated USD in short liquidations
}

/** A live liquidation event from the WebSocket */
export interface LiveLiqEvent {
  ts: number;
  price: number;
  qty: number;      // base qty
  side: "LONG" | "SHORT"; // the position side that was liquidated
}

export interface LiquidationHeatmapData {
  buckets: LiqBucket[];       // ordered by priceCenter ascending
  liveLiqs: LiveLiqEvent[];   // recent live liquidation events
  currentPrice: number;
  priceLow: number;
  priceHigh: number;
  loading: boolean;
  error: string | null;
  lastUpdate: string;
  totalLongRisk: number;   // total estimated $USD long liq in range
  totalShortRisk: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PRICE_RANGE_PCT   = 0.12;   // ±12% around current price
const BUCKET_COUNT      = 200;    // price resolution
const MAX_LIVE_EVENTS   = 500;    // keep last N websocket events
const KLINE_INTERVAL    = "1h";
const KLINE_LIMIT       = 300;    // last 300 candles (~12.5 days of 1h data)
const DECAY_RATE        = 0.006;  // exponential time-decay per candle
const REFRESH_MS        = 5 * 60_000; // re-fetch klines every 5 min

const LEVERAGE_LEVELS: number[] = [3, 5, 10, 20, 50, 100];
const LEVERAGE_WEIGHT: Record<number, number> = {
  3:   0.05,
  5:   0.12,
  10:  0.28,
  20:  0.30,
  50:  0.15,
  100: 0.10,
};

// Binance symbol map
const TO_BINANCE: Record<string, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  DOTUSD: "DOTUSDT",
};

// ─── Core computation ─────────────────────────────────────────────────────────

interface RawKline {
  openTime: number;
  close: number;
  quoteVolume: number;
}

function buildBuckets(
  klines: RawKline[],
  currentPrice: number,
): { buckets: LiqBucket[]; priceLow: number; priceHigh: number } {
  const priceLow  = currentPrice * (1 - PRICE_RANGE_PCT);
  const priceHigh = currentPrice * (1 + PRICE_RANGE_PCT);
  const binSize   = (priceHigh - priceLow) / BUCKET_COUNT;

  const longArr  = new Float64Array(BUCKET_COUNT);
  const shortArr = new Float64Array(BUCKET_COUNT);

  const totalVol = klines.reduce((s, k) => s + k.quoteVolume, 0) || 1;
  const N = klines.length;

  klines.forEach((k, i) => {
    const timeDelta = N - 1 - i; // 0 = most recent
    const decay     = Math.exp(-DECAY_RATE * timeDelta);
    const volWeight = k.quoteVolume / totalVol;
    const w         = volWeight * decay;

    LEVERAGE_LEVELS.forEach((L) => {
      const lw = LEVERAGE_WEIGHT[L] ?? 0;

      // Long liquidation price (below entry): entry × (1 – 1/L)
      const longLiq  = k.close * (1 - 1 / L);
      // Short liquidation price (above entry): entry × (1 + 1/L)
      const shortLiq = k.close * (1 + 1 / L);

      const lBin = Math.floor((longLiq  - priceLow) / binSize);
      const sBin = Math.floor((shortLiq - priceLow) / binSize);

      if (lBin >= 0 && lBin < BUCKET_COUNT) {
        longArr[lBin]  += w * lw * k.quoteVolume;
      }
      if (sBin >= 0 && sBin < BUCKET_COUNT) {
        shortArr[sBin] += w * lw * k.quoteVolume;
      }
    });
  });

  const buckets: LiqBucket[] = Array.from({ length: BUCKET_COUNT }, (_, i) => ({
    priceCenter: priceLow + (i + 0.5) * binSize,
    longQty:  longArr[i],
    shortQty: shortArr[i],
  }));

  return { buckets, priceLow, priceHigh };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLiquidationHeatmap(symbol: string): LiquidationHeatmapData {
  const binanceSymbol = TO_BINANCE[symbol] ?? "BTCUSDT";
  const liveRef   = useRef<LiveLiqEvent[]>([]);
  const wsRef     = useRef<WebSocket | null>(null);

  const [state, setState] = useState<LiquidationHeatmapData>({
    buckets: [],
    liveLiqs: [],
    currentPrice: 0,
    priceLow: 0,
    priceHigh: 0,
    loading: true,
    error: null,
    lastUpdate: "—",
    totalLongRisk: 0,
    totalShortRisk: 0,
  });

  // ── Fetch klines & compute ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval>;

    async function fetch_klines() {
      try {
        const url =
          `https://fapi.binance.com/fapi/v1/klines` +
          `?symbol=${binanceSymbol}&interval=${KLINE_INTERVAL}&limit=${KLINE_LIMIT}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Each element: [openTime, open, high, low, close, volume, closeTime, quoteVol, ...]
        const raw: (string | number)[][] = await res.json();

        const klines: RawKline[] = raw.map((r) => ({
          openTime:    Number(r[0]),
          close:       Number(r[4]),
          quoteVolume: Number(r[7]),
        }));

        if (cancelled) return;

        const currentPrice = klines[klines.length - 1]?.close ?? 0;
        if (!currentPrice) return;

        const { buckets, priceLow, priceHigh } = buildBuckets(klines, currentPrice);
        const totalLongRisk  = buckets.reduce((s, b) => s + b.longQty,  0);
        const totalShortRisk = buckets.reduce((s, b) => s + b.shortQty, 0);

        setState((prev) => ({
          ...prev,
          buckets,
          currentPrice,
          priceLow,
          priceHigh,
          loading: false,
          error: null,
          lastUpdate: new Date().toLocaleTimeString(),
          totalLongRisk,
          totalShortRisk,
        }));
      } catch (e) {
        if (!cancelled)
          setState((prev) => ({
            ...prev,
            loading: false,
            error: e instanceof Error ? e.message : "fetch failed",
          }));
      }
    }

    fetch_klines();
    timer = setInterval(fetch_klines, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [binanceSymbol]);

  // ── WebSocket: live force orders ────────────────────────────────────────────
  useEffect(() => {
    const streamSymbol = binanceSymbol.toLowerCase();
    const wsUrl = `wss://fstream.binance.com/stream?streams=${streamSymbol}@forceOrder`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string);
          const o = msg?.data?.o ?? msg?.o;
          if (!o) return;

          // o.S = "SELL" means a LONG was liquidated (sell order closed the long)
          // o.S = "BUY"  means a SHORT was liquidated
          const side: "LONG" | "SHORT" = o.S === "SELL" ? "LONG" : "SHORT";
          const event: LiveLiqEvent = {
            ts:    Number(o.T),
            price: Number(o.ap) || Number(o.p),
            qty:   Number(o.q),
            side,
          };

          liveRef.current = [...liveRef.current, event].slice(-MAX_LIVE_EVENTS);

          setState((prev) => ({
            ...prev,
            liveLiqs: liveRef.current,
          }));
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        // Reconnect after 3s if not manually closed
        setTimeout(() => {
          if (wsRef.current === ws) connect();
        }, 3_000);
      };
    }

    connect();

    return () => {
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        ws.close();
      }
    };
  }, [binanceSymbol]);

  return state;
}
