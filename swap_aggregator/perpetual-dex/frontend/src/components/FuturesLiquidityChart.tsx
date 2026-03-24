import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useBinanceFuturesLiquidity } from "@/hooks/useBinanceFuturesLiquidity";
import type { PolkadotSymbol } from "@/services/polkadotPrice";

const CHART_HEIGHT = 640;

interface Props {
  symbol: PolkadotSymbol;
  resolution?: string;
  visibleLogicalRange?: { from: number; to: number } | null;
}

function fmtBillion(v: number) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

export default function FuturesLiquidityChart({ symbol, resolution = "1D", visibleLogicalRange }: Props) {
  const { data, loading, error, lastUpdate } = useBinanceFuturesLiquidity(symbol, resolution);

  // ── Chart 1: Open Interest ──────────────────────────────────────────────────
  const oiRef    = useRef<HTMLDivElement>(null);
  const oiChart  = useRef<IChartApi | null>(null);

  // ── Chart 2: Long/Short Ratio ───────────────────────────────────────────────
  const lsRef    = useRef<HTMLDivElement>(null);
  const lsChart  = useRef<IChartApi | null>(null);

  // ── Chart 3: Funding Rate ───────────────────────────────────────────────────
  const frRef    = useRef<HTMLDivElement>(null);
  const frChart  = useRef<IChartApi | null>(null);

  const CHART_OPTIONS = {
    layout: { background: { type: ColorType.Solid, color: "#080a14" }, textColor: "#64748b" },
    grid:   { vertLines: { color: "#0f1122" }, horzLines: { color: "#0f1122" } },
    timeScale: {
      borderColor: "#1d2142",
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 30,
      fixLeftEdge: false,
    },
    rightPriceScale: { borderColor: "#1d2142", scaleMargins: { top: 0.08, bottom: 0.08 } },
    crosshair: {
      vertLine: { color: "#3d51ff80", width: 1 as const, style: LineStyle.Dashed },
      horzLine: { color: "#3d51ff80", width: 1 as const, style: LineStyle.Dashed },
    },
    handleScale: true,
    handleScroll: true,
  };

  // ─── Init charts ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!oiRef.current || !lsRef.current || !frRef.current) return;

    const oi = createChart(oiRef.current, { ...CHART_OPTIONS, height: 240 });
    const ls = createChart(lsRef.current, { ...CHART_OPTIONS, height: 200 });
    const fr = createChart(frRef.current, { ...CHART_OPTIONS, height: 160 });

    oiChart.current = oi;
    lsChart.current = ls;
    frChart.current = fr;

    return () => {
      oi.remove(); ls.remove(); fr.remove();
      oiChart.current = null; lsChart.current = null; frChart.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Populate OI chart ──────────────────────────────────────────────────────
  useEffect(() => {
    const chart = oiChart.current;
    if (!chart || !data.oi.length) return;

    const oiSeries = chart.addAreaSeries({
      lineColor: "#38bdf8",
      topColor: "rgba(56,189,248,0.3)",
      bottomColor: "rgba(56,189,248,0.02)",
      lineWidth: 2,
      title: "Open Interest",
      priceFormat: { type: "custom", formatter: (v: number) => fmtBillion(v), minMove: 1 },
    });

    const oiData = data.oi.map((p) => ({ time: p.time as UTCTimestamp, value: p.openInterest }));
    oiSeries.setData(oiData);
    chart.timeScale().fitContent();

    // Overlay OI change % as line series
    const pctSeries = chart.addLineSeries({
      color: "#a78bfa",
      lineWidth: 1,
      title: "OI Δ%",
      priceScaleId: "right2",
      visible: false, // hidden by default; keep for crosshair tooltip
    });
    const pctData = data.oi.map((p, i) => {
      const prev = i > 0 ? data.oi[i - 1].openInterest : p.openInterest;
      const pct = prev === 0 ? 0 : ((p.openInterest - prev) / prev) * 100;
      return { time: p.time as UTCTimestamp, value: pct };
    });
    pctSeries.setData(pctData);

    // Funding rate as markers on OI chart
    if (data.funding.length) {
      const markers = data.funding.map((f) => ({
        time: f.time as UTCTimestamp,
        position: f.fundingRate >= 0 ? "aboveBar" : "belowBar",
        color: f.fundingRate >= 0 ? "#4ade80" : "#f87171",
        shape: f.fundingRate >= 0 ? "arrowUp" : "arrowDown",
        text: `${(f.fundingRate * 100).toFixed(4)}%`,
        size: 0.6,
      })) as Parameters<typeof oiSeries.setMarkers>[0];
      oiSeries.setMarkers(markers);
    }

    return () => {
      try { chart.removeSeries(oiSeries); chart.removeSeries(pctSeries); } catch { /* ignore */ }
    };
  }, [data]);

  // ─── Populate L/S chart ─────────────────────────────────────────────────────
  useEffect(() => {
    const chart = lsChart.current;
    if (!chart || !data.ls.length) return;

    // Neutral line at 1.0
    const neutralSeries = chart.addLineSeries({
      color: "rgba(148,163,184,0.25)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const neutralData = data.ls.map((p) => ({ time: p.time as UTCTimestamp, value: 1 }));
    neutralSeries.setData(neutralData);

    const ratioSeries = chart.addLineSeries({
      color: "#fb923c",
      lineWidth: 2,
      title: "L/S Ratio",
      priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(3), minMove: 0.001 },
    });
    ratioSeries.setData(
      data.ls.map((p) => ({ time: p.time as UTCTimestamp, value: p.lsRatio }))
    );

    // Long% as secondary line
    const longPctSeries = chart.addLineSeries({
      color: "rgba(74,222,128,0.6)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: "Long%",
      priceFormat: { type: "custom", formatter: (v: number) => `${(v * 100).toFixed(1)}%`, minMove: 0.001 },
    });
    longPctSeries.setData(
      data.ls.map((p) => ({ time: p.time as UTCTimestamp, value: p.longAccount }))
    );

    chart.timeScale().fitContent();

    return () => {
      try {
        chart.removeSeries(neutralSeries);
        chart.removeSeries(ratioSeries);
        chart.removeSeries(longPctSeries);
      } catch { /* ignore */ }
    };
  }, [data]);

  // ─── Populate Funding Rate chart ────────────────────────────────────────────
  useEffect(() => {
    const chart = frChart.current;
    if (!chart || !data.funding.length) return;

    const hist = chart.addHistogramSeries({
      title: "Funding Rate",
      priceFormat: {
        type: "custom",
        formatter: (v: number) => `${(v * 100).toFixed(5)}%`,
        minMove: 0.00001,
      },
      lastValueVisible: true,
      priceLineVisible: false,
    });

    hist.setData(
      data.funding.map((f) => ({
        time: f.time as UTCTimestamp,
        value: f.fundingRate,
        color: f.fundingRate >= 0 ? "rgba(74,222,128,0.65)" : "rgba(248,113,113,0.65)",
      }))
    );

    // Zero reference line
    const zeroSeries = chart.addLineSeries({
      color: "rgba(148,163,184,0.25)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    zeroSeries.setData(data.funding.map((f) => ({ time: f.time as UTCTimestamp, value: 0 })));

    chart.timeScale().fitContent();

    return () => {
      try { chart.removeSeries(hist); chart.removeSeries(zeroSeries); } catch { /* ignore */ }
    };
  }, [data]);

  // ─── Sync visible range ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!visibleLogicalRange) return;
    const { from, to } = visibleLogicalRange;
    const clampedFrom = Math.max(0, from);
    if (clampedFrom > to) return;
    const range = { from: clampedFrom, to };
    try { oiChart.current?.timeScale().setVisibleLogicalRange(range); } catch { /* ignore */ }
    try { lsChart.current?.timeScale().setVisibleLogicalRange(range); } catch { /* ignore */ }
    try { frChart.current?.timeScale().setVisibleLogicalRange(range); } catch { /* ignore */ }
  }, [visibleLogicalRange]);

  // ─── Derive latest stats for header ─────────────────────────────────────────
  const latestOI  = data.oi[data.oi.length - 1];
  const prevOI    = data.oi[data.oi.length - 2];
  const oiChange  = latestOI && prevOI
    ? ((latestOI.openInterest - prevOI.openInterest) / prevOI.openInterest) * 100
    : null;
  const latestLS  = data.ls[data.ls.length - 1];
  const latestFR  = data.funding[data.funding.length - 1];

  return (
    <div className="rounded-2xl border border-[#363a59] bg-[#080a14] p-4 text-sm w-full">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between pb-3 gap-y-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-slate-500">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
            <polyline points="16 7 22 7 22 13"/>
          </svg>
          <span>Futures Liquidity</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px]">
          {latestOI && (
            <span className="text-slate-300">
              OI: <span className="font-semibold text-sky-400">{fmtBillion(latestOI.openInterest)}</span>
              {oiChange !== null && (
                <span className={`ml-1 ${oiChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {oiChange >= 0 ? "+" : ""}{oiChange.toFixed(2)}%
                </span>
              )}
            </span>
          )}
          {latestLS && (
            <span className="text-slate-300">
              L/S: <span className={`font-semibold ${latestLS.lsRatio >= 1 ? "text-emerald-400" : "text-rose-400"}`}>
                {latestLS.lsRatio.toFixed(3)}
              </span>
              <span className="ml-1 text-slate-500">
                ({(latestLS.longAccount * 100).toFixed(1)}% L)
              </span>
            </span>
          )}
          {latestFR && (
            <span className="text-slate-300">
              Funding: <span className={`font-semibold ${latestFR.fundingRate >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {(latestFR.fundingRate * 100).toFixed(4)}%
              </span>
            </span>
          )}
          <span className="text-slate-600">{symbol} · {resolution} · {lastUpdate}</span>
          {loading && <div className="h-3 w-3 rounded-full border-2 border-t-transparent border-sky-500 animate-spin" />}
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-center h-20 text-[11px] text-rose-400/80">
          Failed to load Binance Futures data. Check network.
        </div>
      )}

      {!error && (
        <div
          className="rounded-xl border border-[#1d2142] bg-[#0d0f18] overflow-hidden"
          style={{ height: CHART_HEIGHT }}
        >
          {/* Section headers */}
          <div className="flex flex-col h-full">

            {/* OI area */}
            <div className="relative" style={{ flex: "0 0 240px" }}>
              <div className="absolute top-1.5 left-3 z-10 text-[9px] text-slate-500 uppercase tracking-widest pointer-events-none">
                Open Interest + Funding Rate Markers
              </div>
              <div ref={oiRef} style={{ height: 240 }} />
            </div>

            {/* Divider */}
            <div className="border-t border-[#1d2142]" />

            {/* L/S Ratio */}
            <div className="relative" style={{ flex: "0 0 200px" }}>
              <div className="absolute top-1.5 left-3 z-10 text-[9px] text-slate-500 uppercase tracking-widest pointer-events-none">
                Long/Short Ratio (Top Traders)
              </div>
              <div ref={lsRef} style={{ height: 200 }} />
            </div>

            {/* Divider */}
            <div className="border-t border-[#1d2142]" />

            {/* Funding Rate */}
            <div className="relative" style={{ flex: "0 0 160px" }}>
              <div className="absolute top-1.5 left-3 z-10 text-[9px] text-slate-500 uppercase tracking-widest pointer-events-none">
                Funding Rate (8h)
              </div>
              <div ref={frRef} style={{ height: 160 }} />
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t border-[#1d2142]">
              <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                <span className="h-0.5 w-4 bg-sky-400 inline-block rounded" />OI
              </div>
              <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                <span className="h-0.5 w-4 bg-orange-400 inline-block rounded" />L/S Ratio
              </div>
              <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                <span className="h-0.5 w-4 bg-emerald-400/60 inline-block rounded" dashed-line="true" />Long %
              </div>
              <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                <span className="h-3 w-3 rounded-sm bg-emerald-400/60 inline-block" />+FR
              </div>
              <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                <span className="h-3 w-3 rounded-sm bg-rose-400/60 inline-block" />-FR
              </div>
              <div className="flex items-center gap-1.5 text-[9px] text-rose-400">
                ▲ Funding = longs pay shorts · ▼ = shorts pay longs
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
