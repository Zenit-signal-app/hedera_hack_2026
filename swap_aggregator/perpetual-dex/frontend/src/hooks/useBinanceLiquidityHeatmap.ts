import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
/** A single [price, quantity] level from the order book */
export type OrderLevel = [number, number];

/** One time-snapshot of the order book */
export interface DepthSnapshot {
  ts: number;          // unix ms
  bids: OrderLevel[];  // sorted desc
  asks: OrderLevel[];  // sorted asc
  midPrice: number;
}

/** Pre-processed heatmap cell matrix for canvas rendering */
export interface HeatmapCell {
  /** price bucket index (0 = lowest price in range) */
  priceIdx: number;
  /** time column index (0 = oldest) */
  timeIdx: number;
  /** total quote quantity at this cell */
  qty: number;
  /** "bid" | "ask" */
  side: "bid" | "ask";
}

export interface LiquidityHeatmapState {
  snapshots: DepthSnapshot[];
  cells: HeatmapCell[];
  priceLow: number;
  priceHigh: number;
  priceBinCount: number;
  loading: boolean;
  error: string | null;
  lastUpdate: string;
  latestMidPrice: number;
}

// ─── Binance symbol map ───────────────────────────────────────────────────────
const TO_BINANCE: Record<string, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  DOTUSD: "DOTUSDT",
};

// ─── Config ───────────────────────────────────────────────────────────────────
const POLL_MS        = 8_000;   // poll every 8 seconds
const MAX_SNAPSHOTS  = 90;      // keep up to 90 columns (~12 min)
const DEPTH_LIMIT    = 1_000;   // levels per side
const PRICE_BIN_PCT  = 0.03;    // ±3% range around mid
const PRICE_BINS     = 120;     // rows in the heatmap

// ─── Helpers ──────────────────────────────────────────────────────────────────
function priceToBinIdx(price: number, low: number, high: number, bins: number): number {
  if (high <= low) return -1;
  const idx = Math.floor(((price - low) / (high - low)) * bins);
  return Math.max(0, Math.min(bins - 1, idx));
}

function buildCells(
  snapshots: DepthSnapshot[],
  priceLow: number,
  priceHigh: number,
  bins: number,
): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  snapshots.forEach((snap, timeIdx) => {
    const bidAgg = new Map<number, number>();
    const askAgg = new Map<number, number>();

    snap.bids.forEach(([p, q]) => {
      const idx = priceToBinIdx(p, priceLow, priceHigh, bins);
      if (idx >= 0) bidAgg.set(idx, (bidAgg.get(idx) ?? 0) + q * p);
    });
    snap.asks.forEach(([p, q]) => {
      const idx = priceToBinIdx(p, priceLow, priceHigh, bins);
      if (idx >= 0) askAgg.set(idx, (askAgg.get(idx) ?? 0) + q * p);
    });

    bidAgg.forEach((qty, priceIdx) =>
      cells.push({ priceIdx, timeIdx, qty, side: "bid" })
    );
    askAgg.forEach((qty, priceIdx) =>
      cells.push({ priceIdx, timeIdx, qty, side: "ask" })
    );
  });
  return cells;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useBinanceLiquidityHeatmap(symbol: string): LiquidityHeatmapState {
  const binanceSymbol = TO_BINANCE[symbol] ?? "BTCUSDT";
  const snapshotsRef = useRef<DepthSnapshot[]>([]);
  const [state, setState] = useState<LiquidityHeatmapState>({
    snapshots: [],
    cells: [],
    priceLow: 0,
    priceHigh: 0,
    priceBinCount: PRICE_BINS,
    loading: true,
    error: null,
    lastUpdate: "—",
    latestMidPrice: 0,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/depth?symbol=${binanceSymbol}&limit=${DEPTH_LIMIT}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw: {
          bids: [string, string][];
          asks: [string, string][];
        } = await res.json();

        const bids: OrderLevel[] = raw.bids
          .map(([p, q]) => [Number(p), Number(q)] as OrderLevel)
          .sort((a, b) => b[0] - a[0]);

        const asks: OrderLevel[] = raw.asks
          .map(([p, q]) => [Number(p), Number(q)] as OrderLevel)
          .sort((a, b) => a[0] - b[0]);

        const midPrice =
          bids.length && asks.length
            ? (bids[0][0] + asks[0][0]) / 2
            : bids[0]?.[0] ?? asks[0]?.[0] ?? 0;

        const snap: DepthSnapshot = { ts: Date.now(), bids, asks, midPrice };

        // Append and trim
        const updated = [...snapshotsRef.current, snap].slice(-MAX_SNAPSHOTS);
        snapshotsRef.current = updated;

        if (cancelled) return;

        // Derive price range from latest mid price
        const priceLow  = midPrice * (1 - PRICE_BIN_PCT);
        const priceHigh = midPrice * (1 + PRICE_BIN_PCT);
        const cells = buildCells(updated, priceLow, priceHigh, PRICE_BINS);

        setState({
          snapshots: updated,
          cells,
          priceLow,
          priceHigh,
          priceBinCount: PRICE_BINS,
          loading: false,
          error: null,
          lastUpdate: new Date().toLocaleTimeString(),
          latestMidPrice: midPrice,
        });
      } catch (e) {
        if (!cancelled)
          setState((prev) => ({
            ...prev,
            loading: false,
            error: e instanceof Error ? e.message : "fetch failed",
          }));
      }
    }

    snapshotsRef.current = [];
    setState((s) => ({ ...s, loading: true, error: null }));
    poll();
    timerRef.current = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [binanceSymbol]);

  return state;
}
