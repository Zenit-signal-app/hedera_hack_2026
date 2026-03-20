import { useEffect, useRef, useState } from "react";
import { useBinanceLiquidityHeatmap } from "@/hooks/useBinanceLiquidityHeatmap";
import type { PolkadotSymbol } from "@/services/polkadotPrice";

// ─── Config ───────────────────────────────────────────────────────────────────
const PRICE_AXIS_W = 72;  // px reserved for price labels on right
const TIME_AXIS_H  = 24;  // px reserved for time labels at bottom
const CELL_W       = 5;   // px per time column
const CELL_H       = 4;   // px per price row

// ─── Colour ramp: black → dark-blue → cyan → yellow → white ──────────────────
// Coinglass/Aggr.trade-style heatmap palette
const RAMP: [number, number, number][] = [
  [0,   0,   0],    // 0.00 — no liquidity (transparent/black bg)
  [5,   9,  30],    // 0.05
  [10,  30,  80],   // 0.15 — dark blue
  [20,  60, 140],   // 0.30
  [30, 120, 180],   // 0.45 — mid blue
  [0,  200, 200],   // 0.60 — cyan
  [240, 220,  20],  // 0.75 — yellow
  [255, 140,   0],  // 0.85 — orange
  [255, 255, 255],  // 1.00 — white (whale wall)
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function rampColor(t: number): [number, number, number] {
  const n = RAMP.length - 1;
  const scaled = Math.max(0, Math.min(1, t)) * n;
  const i = Math.floor(scaled);
  const f = scaled - i;
  if (i >= n) return RAMP[n];
  return [
    Math.round(lerp(RAMP[i][0], RAMP[i + 1][0], f)),
    Math.round(lerp(RAMP[i][1], RAMP[i + 1][1], f)),
    Math.round(lerp(RAMP[i][2], RAMP[i + 1][2], f)),
  ];
}

function toRgba(t: number, alpha = 1): string {
  const [r, g, b] = rampColor(t);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmtPrice(v: number, symbol: string): string {
  if (symbol === "DOTUSD") return v.toFixed(3);
  if (symbol === "ETHUSD") return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  symbol: PolkadotSymbol;
}

export default function LiquidityHeatmapChart({ symbol }: Props) {
  const {
    snapshots,
    cells,
    priceLow,
    priceHigh,
    priceBinCount,
    loading,
    error,
    lastUpdate,
    latestMidPrice,
  } = useBinanceLiquidityHeatmap(symbol);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track hover
  const [hoverInfo, setHoverInfo] = useState<{
    x: number; y: number;
    price: number; time: string; qty: number; side: string;
  } | null>(null);

  const canvasW = snapshots.length * CELL_W;
  const canvasH = priceBinCount * CELL_H;

  // ─── Draw heatmap ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cells.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resize canvas
    canvas.width  = canvasW;
    canvas.height = canvasH;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = "#080a14";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Find max qty for normalisation (log scale)
    const maxQty = Math.max(...cells.map((c) => c.qty), 1);
    const logMax = Math.log1p(maxQty);

    cells.forEach(({ priceIdx, timeIdx, qty, side }) => {
      const t = Math.log1p(qty) / logMax;
      // Separate hue for bids vs asks: bids warm-shifted, asks cooler
      let alpha = t * 0.9 + 0.04;
      if (t < 0.05) return; // skip negligible cells

      const [r, g, b] = rampColor(t);
      // Asks: slight blue tint, bids: slight warm tint
      const rAdj = side === "ask" ? Math.max(0, r - 40) : r;
      const bAdj = side === "ask" ? Math.min(255, b + 40) : b;

      ctx.fillStyle = `rgba(${rAdj},${g},${bAdj},${alpha})`;
      const x = timeIdx * CELL_W;
      const y = (priceBinCount - 1 - priceIdx) * CELL_H; // invert: high price at top
      ctx.fillRect(x, y, CELL_W, CELL_H);
    });
  }, [cells, canvasW, canvasH, priceBinCount]);

  // ─── Draw overlay: current price line ────────────────────────────────────────
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !latestMidPrice || !priceLow || !priceHigh) return;
    canvas.width  = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasW, canvasH);

    const priceFrac = (latestMidPrice - priceLow) / (priceHigh - priceLow);
    const y = (1 - priceFrac) * canvasH;

    // Glow line
    ctx.save();
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur  = 6;
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
    ctx.restore();
  }, [latestMidPrice, priceLow, priceHigh, canvasW, canvasH]);

  // ─── Mouse hover ─────────────────────────────────────────────────────────────
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const timeIdx  = Math.floor(mx / CELL_W);
    const priceIdx = priceBinCount - 1 - Math.floor(my / CELL_H);

    if (timeIdx < 0 || timeIdx >= snapshots.length || priceIdx < 0 || priceIdx >= priceBinCount) {
      setHoverInfo(null);
      return;
    }

    const snap = snapshots[timeIdx];
    const binH  = (priceHigh - priceLow) / priceBinCount;
    const price = priceLow + (priceIdx + 0.5) * binH;

    // Find matching cell qty
    const cell = cells.find((c) => c.timeIdx === timeIdx && c.priceIdx === priceIdx);
    const qty  = cell?.qty ?? 0;
    const side = cell?.side ?? "—";

    setHoverInfo({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      price,
      time: fmtTime(snap.ts),
      qty,
      side,
    });
  }

  // ─── Price axis labels (right side) ──────────────────────────────────────────
  const priceLabels: { y: number; price: number }[] = [];
  if (priceLow && priceHigh) {
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const frac  = i / steps;
      const price = priceHigh - frac * (priceHigh - priceLow);
      const y     = frac * canvasH;
      priceLabels.push({ y, price });
    }
  }

  // ─── Time axis labels (bottom) ───────────────────────────────────────────────
  const timeLabels: { x: number; label: string }[] = [];
  if (snapshots.length) {
    const step = Math.max(1, Math.floor(snapshots.length / 6));
    for (let i = 0; i < snapshots.length; i += step) {
      timeLabels.push({ x: i * CELL_W + CELL_W / 2, label: fmtTime(snapshots[i].ts) });
    }
  }

  const chartW = Math.max(canvasW, 300);
  const totalH = canvasH + TIME_AXIS_H;

  return (
    <div className="rounded-2xl border border-[#363a59] bg-[#080a14] p-4 text-sm w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-3 gap-y-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-slate-500">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
          </svg>
          <span>Liquidity Heatmap</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px]">
          <span className="text-slate-300">
            Mid: <span className="font-semibold text-cyan-400">
              {latestMidPrice ? fmtPrice(latestMidPrice, symbol) : "—"}
            </span>
          </span>
          <span className="text-slate-500">{symbol} · ±3% depth · {lastUpdate}</span>
          <span className="text-slate-600">{snapshots.length} snapshots</span>
          {loading && !snapshots.length && (
            <div className="h-3 w-3 rounded-full border-2 border-t-transparent border-orange-400 animate-spin" />
          )}
        </div>
      </div>

      {/* Colour legend */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[9px] text-slate-600 uppercase tracking-widest">Intensity:</span>
        <div
          className="h-2.5 flex-1 rounded"
          style={{
            background: `linear-gradient(to right, ${
              [0, 0.15, 0.3, 0.5, 0.65, 0.8, 1].map((t) => toRgba(t, 0.9)).join(",")
            })`,
          }}
        />
        <div className="flex items-center gap-1.5 text-[9px]">
          <span className="text-slate-600">Low</span>
          <span className="text-slate-400">→</span>
          <span className="text-yellow-300 font-semibold">High</span>
          <span className="text-white font-bold">→ Whale Wall</span>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className="h-2 w-2 rounded-sm bg-orange-400/80 inline-block" />
        <span className="text-[9px] text-slate-500">Bid liquidity (warm)</span>
        <span className="h-2 w-2 rounded-sm bg-blue-400/80 inline-block" />
        <span className="text-[9px] text-slate-500">Ask liquidity (cool)</span>
        <span className="h-0.5 w-4 inline-block" style={{ background: "#22d3ee" }} />
        <span className="text-[9px] text-cyan-400">Mid price</span>
      </div>

      {error && (
        <div className="flex items-center justify-center h-24 text-[11px] text-rose-400/80">
          Failed to load Binance Futures depth: {error}
        </div>
      )}

      {!error && (
        <div
          className="rounded-xl border border-[#1d2142] bg-[#080a14] overflow-hidden"
          style={{ height: totalH + 4 }}
        >
          <div className="relative flex" style={{ height: totalH }}>
            {/* ── Heatmap canvas area ── */}
            <div
              ref={containerRef}
              className="relative overflow-x-auto overflow-y-hidden flex-1"
              style={{ height: totalH }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverInfo(null)}
            >
              <div style={{ position: "relative", width: chartW, height: totalH }}>
                {/* Base heatmap */}
                <canvas
                  ref={canvasRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    imageRendering: "pixelated",
                  }}
                />
                {/* Price line overlay */}
                <canvas
                  ref={overlayRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    pointerEvents: "none",
                    imageRendering: "pixelated",
                  }}
                />
                {/* Time axis */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: canvasH,
                    height: TIME_AXIS_H,
                    width: chartW,
                    borderTop: "1px solid #1d2142",
                  }}
                >
                  {timeLabels.map(({ x, label }) => (
                    <span
                      key={x}
                      style={{
                        position: "absolute",
                        left: x,
                        top: 4,
                        transform: "translateX(-50%)",
                        fontSize: 8,
                        color: "rgba(100,116,139,0.8)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Hover tooltip */}
              {hoverInfo && hoverInfo.qty > 0 && (
                <div
                  className="absolute z-30 pointer-events-none rounded-xl border border-[#363a59] bg-[#0d0f1e]/90 px-3 py-2 text-[11px] text-white shadow-xl backdrop-blur"
                  style={{
                    left: hoverInfo.x + 12,
                    top: Math.max(4, hoverInfo.y - 60),
                  }}
                >
                  <div className="font-semibold mb-1" style={{ color: hoverInfo.side === "bid" ? "#f97316" : "#60a5fa" }}>
                    {hoverInfo.side === "bid" ? "Bid Liquidity" : "Ask Liquidity"}
                  </div>
                  <div className="text-slate-300">
                    Price: <span className="text-white font-mono">{fmtPrice(hoverInfo.price, symbol)}</span>
                  </div>
                  <div className="text-slate-300">
                    Volume: <span className="text-white font-mono">
                      ${hoverInfo.qty >= 1e6
                        ? `${(hoverInfo.qty / 1e6).toFixed(2)}M`
                        : hoverInfo.qty >= 1e3
                        ? `${(hoverInfo.qty / 1e3).toFixed(1)}K`
                        : hoverInfo.qty.toFixed(0)}
                    </span>
                  </div>
                  <div className="text-slate-500 text-[9px] mt-0.5">{hoverInfo.time}</div>
                </div>
              )}
            </div>

            {/* ── Price axis (right side) ── */}
            <div
              className="shrink-0 relative border-l border-[#1d2142]"
              style={{ width: PRICE_AXIS_W, height: canvasH }}
            >
              {priceLabels.map(({ y, price }) => (
                <div
                  key={price}
                  className="absolute right-1 text-[8px] text-slate-600"
                  style={{ top: y, transform: "translateY(-50%)" }}
                >
                  {fmtPrice(price, symbol)}
                </div>
              ))}
              {/* Current price label */}
              {latestMidPrice && priceLow && priceHigh && (() => {
                const frac = (latestMidPrice - priceLow) / (priceHigh - priceLow);
                const y = (1 - frac) * canvasH;
                return (
                  <div
                    className="absolute right-0 text-[9px] font-bold text-cyan-400 bg-[#0d0f1e] px-1 rounded"
                    style={{ top: y, transform: "translateY(-50%)", border: "1px solid #22d3ee44" }}
                  >
                    {fmtPrice(latestMidPrice, symbol)}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Footer note */}
      <div className="mt-2 text-[9px] text-slate-700 leading-relaxed">
        Heatmap shows real-time Binance Futures order book depth (±3% around mid price).
        Each column = 1 snapshot (~8s apart). Brighter cells = larger order clusters.
        Warm = bids, cool = asks.
      </div>
    </div>
  );
}
