/**
 * LiquidationHeatmapChart
 *
 * Visualises estimated futures liquidation zones around the current price.
 * Uses two layers:
 *  1. Estimated zone density  – horizontal bar chart (canvas) by price level
 *  2. Live liquidation events – real-time dots from Binance forceOrder WebSocket
 */

import { useEffect, useRef, useState } from "react";
import { useLiquidationHeatmap } from "@/hooks/useLiquidationHeatmap";
import type { PolkadotSymbol } from "@/services/polkadotPrice";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtUSD(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPrice(v: number, sym: string): string {
  if (sym === "DOTUSD") return v.toFixed(3);
  if (sym === "ETHUSD") return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ─── Color ramp ───────────────────────────────────────────────────────────────
// Long liq (red side): dark → orange → bright red/white
// Short liq (teal side): dark → teal → bright cyan/white
function longColor(t: number): string {
  if (t <= 0) return "transparent";
  // black → dark-red → orange → yellow-white
  const stops: [number, [number, number, number]][] = [
    [0.0,  [10,  4,   4]],
    [0.25, [120, 20,  10]],
    [0.50, [220, 60,  10]],
    [0.75, [255, 150, 30]],
    [1.0,  [255, 240, 200]],
  ];
  return interpRamp(t, stops);
}

function shortColor(t: number): string {
  if (t <= 0) return "transparent";
  const stops: [number, [number, number, number]][] = [
    [0.0,  [4,   10,  12]],
    [0.25, [10,  80,  100]],
    [0.50, [10,  160, 180]],
    [0.75, [30,  220, 200]],
    [1.0,  [200, 255, 255]],
  ];
  return interpRamp(t, stops);
}

function interpRamp(t: number, stops: [number, [number, number, number]][]): string {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const f = (clamped - t0) / (t1 - t0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * f);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * f);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * f);
      return `rgb(${r},${g},${b})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(",")})`;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CANVAS_W      = 620; // heatmap canvas width
const ROW_H         = 4;   // px per price bucket
const PRICE_AXIS_W  = 70;  // right price labels
const BAR_MAX_W     = 220; // max width for density bars (left side = long, right side = short)
interface Props {
  symbol: PolkadotSymbol;
}

export default function LiquidationHeatmapChart({ symbol }: Props) {
  const {
    buckets,
    liveLiqs,
    currentPrice,
    priceLow,
    priceHigh,
    loading,
    error,
    lastUpdate,
    totalLongRisk,
    totalShortRisk,
  } = useLiquidationHeatmap(symbol);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const bucketCount = buckets.length;
  const canvasH     = bucketCount * ROW_H;

  // ─── Draw heatmap ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buckets.length) return;
    canvas.width  = CANVAS_W;
    canvas.height = canvasH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, canvasH);
    ctx.fillStyle = "#08090f";
    ctx.fillRect(0, 0, CANVAS_W, canvasH);

    const maxLong  = Math.max(...buckets.map((b) => b.longQty),  1);
    const maxShort = Math.max(...buckets.map((b) => b.shortQty), 1);

    const centerX = CANVAS_W / 2;

    buckets.forEach((b, i) => {
      // i=0 → lowest price → draw at bottom of canvas
      const y = canvasH - (i + 1) * ROW_H;

      const tLong  = Math.log1p(b.longQty)  / Math.log1p(maxLong);
      const tShort = Math.log1p(b.shortQty) / Math.log1p(maxShort);

      if (tLong > 0.01) {
        const w = tLong * BAR_MAX_W;
        // Long liq bars go LEFT of center
        ctx.fillStyle = longColor(tLong);
        ctx.fillRect(centerX - w, y, w, ROW_H);
      }

      if (tShort > 0.01) {
        const w = tShort * BAR_MAX_W;
        // Short liq bars go RIGHT of center
        ctx.fillStyle = shortColor(tShort);
        ctx.fillRect(centerX, y, w, ROW_H);
      }
    });

    // ── Current price line ──────────────────────────────────────────────────
    if (currentPrice && priceLow && priceHigh) {
      const frac = (currentPrice - priceLow) / (priceHigh - priceLow);
      const y    = canvasH - frac * canvasH;

      ctx.save();
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur  = 6;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_W, y);
      ctx.stroke();
      ctx.restore();
    }

    // ── Center divider ──────────────────────────────────────────────────────
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth   = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, canvasH);
    ctx.stroke();

    // ── Hover highlight ─────────────────────────────────────────────────────
    if (hoverIdx !== null) {
      const y = canvasH - (hoverIdx + 1) * ROW_H;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(0, y, CANVAS_W, ROW_H);
    }
  }, [buckets, canvasH, currentPrice, priceLow, priceHigh, hoverIdx]);

  // ─── Mouse hover ───────────────────────────────────────────────────────────
  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const my   = e.clientY - rect.top;
    const bucketFromTop = Math.floor(my / ROW_H);
    const idx  = bucketCount - 1 - bucketFromTop;
    setHoverIdx(idx >= 0 && idx < bucketCount ? idx : null);
  }

  // ─── Price axis labels ─────────────────────────────────────────────────────
  const priceLabels: { pct: number; price: number }[] = [];
  if (priceLow && priceHigh) {
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const pct   = i / steps;
      const price = priceHigh - pct * (priceHigh - priceLow);
      priceLabels.push({ pct, price });
    }
  }

  // ─── Top 5 hottest zones ───────────────────────────────────────────────────
  const topLong = [...buckets]
    .sort((a, b) => b.longQty - a.longQty)
    .slice(0, 5)
    .filter((b) => b.longQty > 0);
  const topShort = [...buckets]
    .sort((a, b) => b.shortQty - a.shortQty)
    .slice(0, 5)
    .filter((b) => b.shortQty > 0);

  // ─── Hover bucket info ─────────────────────────────────────────────────────
  const hovered = hoverIdx !== null ? buckets[hoverIdx] : null;

  return (
    <div className="rounded-2xl border border-[#363a59] bg-[#080a14] p-4 text-sm w-full">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between pb-3 gap-y-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-slate-500">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
            <path d="M12 22V2M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93 4.93 19.07"/>
          </svg>
          <span>Liquidation Heatmap</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px]">
          <span className="text-slate-300">
            Mid: <span className="font-bold text-white">{currentPrice ? fmtPrice(currentPrice, symbol) : "—"}</span>
          </span>
          <span className="text-slate-500">{symbol} · ±12% range · {lastUpdate}</span>
          {loading && (
            <div className="h-3 w-3 rounded-full border-2 border-t-transparent border-red-400 animate-spin" />
          )}
        </div>
      </div>

      {/* ── Legend row ── */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-[9px]">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: "linear-gradient(to right, #7c0a02, #ff4500, #ffd700)" }} />
          <span className="text-red-400 font-semibold">LONG Liq Zone</span>
          <span className="text-slate-600">(longs get wiped if price drops here)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: "linear-gradient(to right, #002b36, #00b4cc, #c0fffe)" }} />
          <span className="text-cyan-400 font-semibold">SHORT Liq Zone</span>
          <span className="text-slate-600">(shorts get wiped if price rises here)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-5 border-t border-dashed border-white" />
          <span className="text-white text-[9px]">Current price</span>
        </div>
      </div>

      {/* ── Risk summary ── */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2">
          <div className="text-[9px] text-red-400 uppercase tracking-widest mb-0.5">Long Liq Risk (below)</div>
          <div className="text-base font-bold text-red-300">{fmtUSD(totalLongRisk)}</div>
          <div className="text-[9px] text-slate-600">estimated positions at risk</div>
        </div>
        <div className="rounded-xl border border-cyan-900/40 bg-cyan-950/20 px-3 py-2">
          <div className="text-[9px] text-cyan-400 uppercase tracking-widest mb-0.5">Short Liq Risk (above)</div>
          <div className="text-base font-bold text-cyan-300">{fmtUSD(totalShortRisk)}</div>
          <div className="text-[9px] text-slate-600">estimated positions at risk</div>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-center h-16 text-[11px] text-rose-400/80 rounded-xl border border-rose-900/30 bg-rose-950/10 mb-3">
          {error}
        </div>
      )}

      {/* ── Heatmap canvas + axis ── */}
      {!error && buckets.length > 0 && (
        <div className="rounded-xl border border-[#1d2142] bg-[#080a14] overflow-hidden mb-3">
          <div className="flex">
            {/* Centre labels */}
            <div className="flex flex-col justify-between text-[8px] text-slate-600 px-1 py-1 shrink-0" style={{ width: 50 }}>
              <span className="text-cyan-700">SHORT</span>
              <span className="text-center text-slate-700">▲▼</span>
              <span className="text-red-700">LONG</span>
            </div>

            {/* Canvas */}
            <div className="relative flex-1 overflow-x-hidden">
              <canvas
                ref={canvasRef}
                style={{ display: "block", width: "100%", height: canvasH, imageRendering: "pixelated", cursor: "crosshair" }}
                onMouseMove={onMouseMove}
                onMouseLeave={() => setHoverIdx(null)}
              />

              {/* Column header labels */}
              <div className="absolute top-1 left-0 right-0 flex justify-between px-4 pointer-events-none">
                <span className="text-[8px] text-red-500/70">← LONG liquidations</span>
                <span className="text-[8px] text-cyan-500/70">SHORT liquidations →</span>
              </div>

              {/* Hover tooltip */}
              {hovered && (
                <div
                  className="absolute left-1/2 z-20 pointer-events-none rounded-xl border border-[#363a59] bg-[#0d0f1e]/90 px-3 py-2 text-[11px] text-white shadow-xl backdrop-blur"
                  style={{ top: 8, transform: "translateX(-50%)" }}
                >
                  <div className="text-slate-400 mb-1 text-[9px]">Price: <span className="text-white font-mono">{fmtPrice(hovered.priceCenter, symbol)}</span></div>
                  <div className="flex gap-4">
                    <div>
                      <span className="text-red-400">LONG liq: </span>
                      <span className="font-mono text-red-200">{fmtUSD(hovered.longQty)}</span>
                    </div>
                    <div>
                      <span className="text-cyan-400">SHORT liq: </span>
                      <span className="font-mono text-cyan-200">{fmtUSD(hovered.shortQty)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Price axis (right) */}
            <div
              className="shrink-0 relative border-l border-[#1d2142]"
              style={{ width: PRICE_AXIS_W, height: canvasH }}
            >
              {priceLabels.map(({ pct, price }) => (
                <div
                  key={price}
                  className="absolute right-1 text-[8px] text-slate-600"
                  style={{ top: pct * canvasH, transform: "translateY(-50%)" }}
                >
                  {fmtPrice(price, symbol)}
                </div>
              ))}
              {currentPrice && priceLow && priceHigh && (() => {
                const frac = (currentPrice - priceLow) / (priceHigh - priceLow);
                const y    = canvasH - frac * canvasH;
                return (
                  <div
                    className="absolute right-0 font-bold text-[9px] text-white bg-[#0d0f1e] px-1 rounded pointer-events-none"
                    style={{ top: y, transform: "translateY(-50%)", border: "1px solid rgba(255,255,255,0.25)", whiteSpace: "nowrap" }}
                  >
                    {fmtPrice(currentPrice, symbol)}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Top zones table ── */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Top LONG liq zones */}
        <div>
          <div className="text-[9px] text-red-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
            Hottest Long Liq Zones
          </div>
          <div className="flex flex-col gap-0.5">
            {topLong.map((b, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-red-950/20 border border-red-900/20 px-2 py-1">
                <span className="text-[9px] font-mono text-red-300">{fmtPrice(b.priceCenter, symbol)}</span>
                <span className="text-[9px] text-red-400">{fmtUSD(b.longQty)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top SHORT liq zones */}
        <div>
          <div className="text-[9px] text-cyan-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-500" />
            Hottest Short Liq Zones
          </div>
          <div className="flex flex-col gap-0.5">
            {topShort.map((b, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-cyan-950/20 border border-cyan-900/20 px-2 py-1">
                <span className="text-[9px] font-mono text-cyan-300">{fmtPrice(b.priceCenter, symbol)}</span>
                <span className="text-[9px] text-cyan-400">{fmtUSD(b.shortQty)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Live liquidation feed ── */}
      <div>
        <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"
          />
          Live Liquidations (WebSocket)
          <span className="text-slate-700 normal-case tracking-normal">
            · {liveLiqs.length} events
          </span>
        </div>
        {liveLiqs.length === 0 ? (
          <div className="text-[9px] text-slate-700 py-2 text-center rounded-xl border border-[#1d2142] bg-[#080a14]">
            Waiting for liquidation events…
          </div>
        ) : (
          <div className="rounded-xl border border-[#1d2142] bg-[#080a14] overflow-hidden">
            {/* header */}
            <div className="grid grid-cols-4 px-3 py-1 border-b border-[#1d2142] text-[8px] text-slate-600 uppercase tracking-widest">
              <span>Time</span>
              <span>Side</span>
              <span className="text-right">Price</span>
              <span className="text-right">Qty</span>
            </div>
            <div className="max-h-36 overflow-y-auto">
              {[...liveLiqs].reverse().slice(0, 30).map((ev, i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 px-3 py-0.5 text-[9px] border-b border-[#111526]/60 hover:bg-white/5 transition"
                >
                  <span className="text-slate-600">
                    {new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span
                    className={ev.side === "LONG" ? "text-red-400 font-semibold" : "text-cyan-400 font-semibold"}
                  >
                    {ev.side === "LONG" ? "🔴 LONG" : "🟢 SHORT"}
                  </span>
                  <span className="text-right font-mono text-slate-300">
                    {fmtPrice(ev.price, symbol)}
                  </span>
                  <span className="text-right font-mono text-slate-400">
                    {ev.qty.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Footnote ── */}
      <div className="mt-2 text-[9px] text-slate-700 leading-relaxed">
        Liquidation zones estimated from last 300 candles of Binance Futures 1h klines, weighted by volume + time decay, across leverage levels 3×–100×.
        Live events via Binance forceOrder WebSocket stream (no API key required).
        <span className="text-slate-600"> Brighter = more estimated liquidation value concentrated at that price level.</span>
      </div>
    </div>
  );
}
