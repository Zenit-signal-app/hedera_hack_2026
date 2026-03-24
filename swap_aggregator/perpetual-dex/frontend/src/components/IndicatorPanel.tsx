import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  LineWidth,
  type IChartApi,
  type SeriesMarker,
  type UTCTimestamp,
  type Time,
  TickMarkType,
} from "lightweight-charts";
import {
  fetchPythBenchmarkHistory,
  type BenchmarkHistoryPoint,
  type PolkadotSymbol,
} from "@/services/polkadotPrice";
import useBinanceFootprintHistory, { tvResolutionToSeconds } from "@/hooks/useBinanceFootprintHistory";
import FuturesLiquidityChart from "@/components/FuturesLiquidityChart";
import LiquidityHeatmapChart from "@/components/LiquidityHeatmapChart";
import LiquidationHeatmapChart from "@/components/LiquidationHeatmapChart";

declare global {
  interface Window {
    LighweightChartPlugin?: any;
    __LIGHTWEIGHT_CHART_PLUGIN_LOADED?: boolean;
  }
}

const SMA_LENGTH = 14;
const EMA_SHORT_LENGTH = 12;
const EMA_MID_LENGTH = 14;
const EMA_LONG_LENGTH = 26;
const RSI_LENGTH = 14;
const MOMENTUM_LENGTH = 12;
const ADX_LENGTH = 14;
const HT_AMPLITUDE = 2;
const HT_CHANNEL_DEV = 2;
const DEFAULT_RIGHT_OFFSET = 30;
const TPO_ACTIVE_BARS = 14;
const TPO_ATR_PERIOD = 5;
const TPO_ROW_DETAIL_PCT = 70;
const TPO_PERCENT_VA = 65;
const INDICATOR_PANEL_MIN_HEIGHT = 320;
const IMBALANCE_THRESHOLD = 0.35;
const IMBALANCE_MIN_VOL = 5;

const PRICE_BIN_DEFAULTS: Partial<Record<PolkadotSymbol, number>> = {
  BTCUSD: 100,
  ETHUSD: 10,
  DOTUSD: 0.1,
};
const POLKADOT_TO_BINANCE: Partial<Record<PolkadotSymbol, string>> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  DOTUSD: "DOTUSDT",
};

const CHATBOT_EVENT_NAME = "ai-chatbot-request";
type ChatbotRequestDetail = {
  topic: "indicators";
  prompt: string;
  indicatorId?: string;
  label?: string;
};

interface AddToChatbotButtonProps {
  indicatorId: string;
  label: string;
  question?: string;
}

const INDICATOR_LABELS: Record<string, string> = {
  "ema-sma":           "EMA & SMA Chart",
  "rsi":               "RSI Chart",
  "adx":               "ADX Chart",
  "momentum":          "Momentum (12)",
  "footprint":         "Footprint History",
  "futures-liquidity":    "Futures Liquidity",
  "liquidity-heatmap":      "Liquidity Heatmap",
  "liquidation-heatmap":    "Liquidation Heatmap",
};

function dispatchChatbotRequest(detail: ChatbotRequestDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHATBOT_EVENT_NAME, { detail }));
}

function AddToChatbotButton({ indicatorId, label, question }: AddToChatbotButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    dispatchChatbotRequest({
      topic: "indicators",
      prompt: question ?? `Explain what the ${label} is showing right now.`,
      indicatorId,
      label,
    });
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-100 shadow-lg shadow-indigo-500/50 transition hover:bg-white/20"
      style={{ pointerEvents: "auto" }}
      title="Add to AI Chatbot"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" className="inline-block">
        <path
          d="M6 1v10M1 6h10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span>Add to AI</span>
    </button>
  );
}

interface IndicatorPanelProps {
  symbol: PolkadotSymbol;
  /** Symbol string used by TradingView datafeed (e.g. "BTCUSD", "Crypto.DOT/USD") */
  tradingViewSymbol?: string;
  /** TradingView resolution string (e.g. "1", "5", "60", "1D", "1W") */
  resolution?: string;
  /** Right offset of the TradingView time scale (bars) */
  timeScaleRightOffset?: number;
  /** Visible logical range shared from the TradingView chart */
  visibleLogicalRange?: { from: number; to: number } | null;
}

/** Pyth Benchmarks API caps history at 1 year (~365 days) */
const MAX_RANGE_SECONDS = 360 * 86400;

const USER_TIMEZONE = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
const USER_LOCALE = typeof navigator !== "undefined" ? navigator.language : "en";

function formatTimeLocal(time: Time): Date {
  if (typeof time === "number") return new Date(time * 1000);
  if (typeof time === "string") return new Date(time);
  const t = time as { year?: number; month?: number; day?: number };
  if (t?.year != null && t?.month != null && t?.day != null) {
    return new Date(Date.UTC(t.year, t.month - 1, t.day));
  }
  return new Date();
}

/** Format time scale labels in user's local timezone (matches TradingView) */
function localTickMarkFormatter(time: Time, tickMarkType: TickMarkType, _locale: string): string | null {
  const d = formatTimeLocal(time);
  const opts: Intl.DateTimeFormatOptions = { timeZone: USER_TIMEZONE };
  switch (tickMarkType) {
    case TickMarkType.Year:
      opts.year = "numeric";
      break;
    case TickMarkType.Month:
      opts.month = "short";
      break;
    case TickMarkType.DayOfMonth:
      opts.day = "numeric";
      break;
    case TickMarkType.Time:
      opts.hour12 = false;
      opts.hour = "2-digit";
      opts.minute = "2-digit";
      break;
    case TickMarkType.TimeWithSeconds:
      opts.hour12 = false;
      opts.hour = "2-digit";
      opts.minute = "2-digit";
      opts.second = "2-digit";
      break;
    default:
      return null;
  }
  return d.toLocaleString(USER_LOCALE, opts);
}

/** Localization for all indicator charts - use user's timezone (matches TradingView) */
const CHART_LOCALIZATION = {
  locale: USER_LOCALE,
  timeFormatter: (time: Time) => {
    const d = formatTimeLocal(time);
    return d.toLocaleString(USER_LOCALE, {
      timeZone: USER_TIMEZONE,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  },
};

function IOSToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full transition-colors duration-300 focus:outline-none"
      style={{
        background: value ? "#3d51ff" : "#1e2033",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.07)",
      }}
    >
      <span
        className="inline-block h-[16px] w-[16px] rounded-full bg-white shadow-md transition-transform duration-300"
        style={{ transform: value ? "translateX(20px)" : "translateX(3px)" }}
      />
    </button>
  );
}

function MultiSeriesSubChart({
  title,
  seriesSets,
  visibleLogicalRange,
  logicalOffset = 0,
  zones,
  zoneGradient,
  signalSet,
  topWarning,
}: MultiSeriesChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRefs = useRef<ReturnType<IChartApi["addLineSeries"]>[]>([]);
  const [hoverSignal, setHoverSignal] = useState<{
    x: number;
    y: number;
    signal: SignalEntry;
    accuracy: SignalAccuracy;
  } | null>(null);
  const signalMarkers = useMemo<SeriesMarker<Time>[]>(() => {
    if (!signalSet) return [];
    const markers: SeriesMarker<Time>[] = [];
    signalSet.long.forEach((s) => {
      markers.push({
        time: s.time,
        position: "belowBar",
        color: "#00C853",
        shape: "circle",
        text: "LONG",
      });
    });
    signalSet.short.forEach((s) => {
      markers.push({
        time: s.time,
        position: "aboveBar",
        color: "#F44336",
        shape: "circle",
        text: "SHORT",
      });
    });
    return markers.sort((a, b) => (a.time as number) - (b.time as number));
  }, [signalSet]);

  const seriesCount = seriesSets.length;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#0c101f" },
        textColor: "#94a3b8",
        fontFamily: "inherit",
      },
      grid: { vertLines: { color: "#161b30" }, horzLines: { color: "#161b30" } },
      rightPriceScale: { visible: true, borderVisible: true, borderColor: "#363a59", scaleMargins: { top: 0.05, bottom: 0.2 }, alignLabels: true },
      leftPriceScale: { visible: false },
      localization: CHART_LOCALIZATION,
      timeScale: {
        borderColor: "#363a59",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: DEFAULT_RIGHT_OFFSET,
        tickMarkFormatter: localTickMarkFormatter,
      },
      width: Math.max(container.clientWidth, 300),
      height: INDICATOR_PANEL_MIN_HEIGHT,
    });

    chartRef.current = chart;
    lineSeriesRefs.current = seriesSets.map((series) =>
      chart.addLineSeries({
        priceScaleId: "right",
        color: series.color,
        lineWidth: 2,
        priceLineVisible: true,
        title: series.label,
        priceLineColor: series.color,
        priceLineWidth: 2,
        lastValueVisible: true,
      })
    );
    chart.timeScale().fitContent();
    chart.priceScale("right").applyOptions({ autoScale: true });

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: Math.max(container.clientWidth, 300) });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      lineSeriesRefs.current = [];
    };
  }, [seriesCount]);

  useEffect(() => {
    if (!lineSeriesRefs.current.length) return;
    lineSeriesRefs.current.forEach((seriesRef, index) => {
      const raw = seriesSets[index]?.data ?? [];
      const sorted = [...raw].sort((a, b) => (a.time as number) - (b.time as number));
      seriesRef.setData(sorted.map((point) => ({ time: point.time, value: point.value })));
      const color = seriesSets[index]?.color;
      if (color) seriesRef.applyOptions({ color });
    });
  }, [seriesSets]);

  useEffect(() => {
    if (!signalSet || !lineSeriesRefs.current.length) return;
    lineSeriesRefs.current[0].setMarkers(signalMarkers);
  }, [signalMarkers, signalSet]);

  useEffect(() => {
    if (!chartRef.current) return;
    const zoneSeries = zones?.map((zone) => {
      const seriesRef = chartRef.current!.addLineSeries({
        color: zone.color,
        lineWidth: (zone.lineWidth ?? 1) as LineWidth,
        lineStyle: zone.lineStyle ?? LineStyle.Dashed,
        priceLineVisible: false,
      });
      seriesRef.setData(seriesSets[0]?.data.map((point) => ({ time: point.time, value: zone.value })));
      return seriesRef;
    });
    return () => {
      zoneSeries?.forEach((seriesRef) => chartRef.current?.removeSeries(seriesRef));
    };
  }, [zones, seriesSets]);

  useEffect(() => {
    if (!signalSet || !chartRef.current) {
      setHoverSignal(null);
      return;
    }
    const chart = chartRef.current;
    const lookup = new Map<number, SignalEntry>();
    signalSet.long.concat(signalSet.short).forEach((s) => lookup.set(s.time as number, s));
    const handler = (param: any) => {
      if (!param.time || !param.point) {
        setHoverSignal(null);
        return;
      }
      const entry = lookup.get(param.time as number);
      if (!entry) {
        setHoverSignal(null);
        return;
      }
      const accuracy = entry.type === "long" ? signalSet.longAccuracy : signalSet.shortAccuracy;
      setHoverSignal({ x: param.point.x, y: param.point.y, signal: entry, accuracy });
    };
    chart.subscribeCrosshairMove(handler);
    return () => {
      chart.unsubscribeCrosshairMove(handler);
    };
  }, [signalSet]);

  useEffect(() => {
    if (!chartRef.current || !visibleLogicalRange) return;
    const subFrom = visibleLogicalRange.from - logicalOffset;
    const subTo = visibleLogicalRange.to - logicalOffset;
    const clampedFrom = Math.max(0, subFrom);
    if (clampedFrom <= subTo) {
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: clampedFrom,
        to: subTo,
      });
    }
  }, [visibleLogicalRange, seriesSets, logicalOffset]);

  const latestValues = seriesSets.map((series) => ({
    label: series.label,
    value: series.data[series.data.length - 1]?.value,
    color: series.color,
  }));

  return (
    <div
      className="rounded-2xl border border-[#363a59] bg-[#080a14] p-4 text-sm w-full"
      style={{ letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 text-xs uppercase tracking-[0.4em] text-slate-500">
        <span>{title}</span>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-200">
            {latestValues.map((item) => (
              <span
                key={item.label}
                className="flex items-center gap-1 rounded-full bg-[#121421]/80 px-1 py-1 text-[10px]"
                style={{ letterSpacing: "-0.05em", fontVariantNumeric: "tabular-nums" }}
              >
              <span className="h-2 w-2 rounded-full" style={{ background: item.color }}></span>
              <span className="min-w-[48px] text-left">
                {item.label} {item.value?.toFixed(2) ?? "—"}
              </span>
            </span>
          ))}
        </div>
      </div>
      {topWarning && (
        <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-400/90 normal-case tracking-normal">
          {topWarning}
        </div>
      )}
      <div
        className="rounded-xl border border-[#1d2142] bg-[#0d0f18] overflow-hidden relative"
        style={{ height: INDICATOR_PANEL_MIN_HEIGHT }}
      >
        {zoneGradient && (
          <div
            className="absolute inset-0 pointer-events-none opacity-70"
            style={{ background: zoneGradient }}
          />
        )}
        <div
          ref={containerRef}
          className="w-full"
          style={{ height: INDICATOR_PANEL_MIN_HEIGHT }}
        />
        {hoverSignal && signalSet && (() => {
          const isLong = hoverSignal.signal.type === "long";
          const stats = hoverSignal.accuracy;
          const tooltipW = 220;
          const containerW = containerRef.current?.clientWidth ?? 360;
          const rawLeft = hoverSignal.x + 14;
          const left = rawLeft + tooltipW > containerW ? hoverSignal.x - tooltipW - 6 : rawLeft;
          const top = Math.max(4, Math.min(hoverSignal.y - 30, 170));
          const signalTime = hoverSignal.signal.time as number;
          const signalTimeLabel = new Date(signalTime * 1000).toLocaleString();
          const rsiData = seriesSets[0]?.data ?? [];
          const rsiAtSignal = rsiData.find((p) => (p.time as number) === signalTime)?.value ??
            (() => {
              const sorted = [...rsiData].sort(
                (a, b) =>
                  Math.abs((a.time as number) - signalTime) - Math.abs((b.time as number) - signalTime)
              );
              return sorted[0]?.value;
            })();
          const fmt = (v: number) =>
            v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const longGradient = "linear-gradient(135deg, rgba(0,200,83,0.25) 0%, rgba(76,175,80,0.4) 100%)";
          const shortGradient = "linear-gradient(135deg, rgba(244,67,54,0.2) 0%, rgba(229,57,53,0.35) 100%)";
          return (
            <div
              className="absolute z-10 pointer-events-none select-none rounded-xl border p-3 text-xs text-white shadow-2xl backdrop-blur"
              style={{
                left,
                top,
                width: tooltipW,
                background: isLong ? longGradient : shortGradient,
                borderColor: isLong ? "rgba(0,200,83,0.5)" : "rgba(244,67,54,0.5)",
              }}
            >
              <div
                className="mb-2 flex items-center gap-1 font-semibold text-[13px] uppercase tracking-wider"
                style={{ color: isLong ? "#00C853" : "#F44336" }}
              >
                <span>●</span>
                <span>Signal Type: {isLong ? "Long" : "Short"}</span>
              </div>
              <div className="flex justify-between mb-1 text-[12px]">
                <span className="text-slate-400">Signal Time</span>
                <span className="font-mono">{signalTimeLabel}</span>
              </div>
              <div className="flex justify-between mb-1 text-[12px]">
                <span className="text-slate-400">Entry (signal price)</span>
                <span className="font-mono">${fmt(hoverSignal.signal.entryPrice)}</span>
              </div>
              <div className="flex justify-between mb-1 text-[12px]">
                <span className="text-slate-400">{seriesSets[0]?.label ?? "Value"}</span>
                <span className="font-mono">{rsiAtSignal != null ? rsiAtSignal.toFixed(2) : "—"}</span>
              </div>
              <div className="flex justify-between mb-2 text-[12px]">
                <span className="text-slate-400">Leverage (Suggest)</span>
                <span className="font-mono font-semibold" style={{ color: isLong ? "#00C853" : "#F44336" }}>
                  10x
                </span>
              </div>
              <div className="border-t border-[#2a2d4a] pt-2">
                {stats.total === 0 ? (
                  <div className="text-slate-500 text-[10px]">Not enough data</div>
                ) : (
                  <>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-slate-400">Correct / Total</span>
                      <span>{stats.correct} / {stats.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Win Rate</span>
                      <span
                        className="font-semibold"
                        style={{ color: stats.pct >= 50 ? "#4ade80" : "#f87171" }}
                      >
                        {stats.pct.toFixed(1)}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/** VPOC (Volume Point of Control) box styling - matches the barVPOC indicator concept */
const VPOC_DEFAULTS = {
  boxColor: "#facc15",
  boxWidth: 4,
  lineOpacity: 100,
  lineWidth: 1,
};

interface FootprintHistoryChartProps {
  polkadotSymbol?: PolkadotSymbol;
  priceBin: number;
  displayPrice?: number;
  resolution?: string;
  visibleLogicalRange?: { from: number; to: number } | null;
  /** VPOC box color (default: #facc15) */
  vpocBoxColor?: string;
  /** VPOC box width factor - box height = 2 * tickSize/boxWidth (default: 4) */
  vpocBoxWidth?: number;
  /** VPOC line opacity 0-100 (default: 100) */
  vpocLineOpacity?: number;
  /** VPOC line thickness (default: 1) */
  vpocLineWidth?: number;
}

function FootprintHistoryChart({
  polkadotSymbol,
  priceBin,
  displayPrice,
  resolution,
  visibleLogicalRange,
  vpocBoxColor = VPOC_DEFAULTS.boxColor,
  vpocBoxWidth = VPOC_DEFAULTS.boxWidth,
  vpocLineOpacity = VPOC_DEFAULTS.lineOpacity,
  vpocLineWidth = VPOC_DEFAULTS.lineWidth,
}: FootprintHistoryChartProps) {
  const barSeconds = tvResolutionToSeconds(resolution ?? "1");
  const binanceSymbol = polkadotSymbol ? POLKADOT_TO_BINANCE[polkadotSymbol] ?? "BTCUSDT" : "BTCUSDT";
  const { bars, loading, error } = useBinanceFootprintHistory(
    binanceSymbol,
    barSeconds,
    priceBin,
    undefined,
    Math.max(barSeconds * 1000, 15_000)
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickRef = useRef<ReturnType<IChartApi["addCandlestickSeries"]> | null>(null);

  const symbolLabel = polkadotSymbol ?? "BTCUSD";
  const formattedPrice =
    displayPrice == null
      ? "—"
      : `$${displayPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const resolutionLabel =
    barSeconds >= 86400
      ? `${barSeconds / 86400}D`
      : barSeconds >= 3600
      ? `${barSeconds / 3600}h`
      : `${barSeconds / 60}m`;

  const candlestickData = useMemo(() => {
    return bars.map((bar) => ({
      time: Math.floor(bar.barStart) as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));
  }, [bars]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#0c101f" },
        textColor: "#94a3b8",
        fontFamily: "inherit",
      },
      grid: { vertLines: { color: "#161b30" }, horzLines: { color: "#161b30" } },
      rightPriceScale: {
        visible: true,
        borderVisible: true,
        borderColor: "#363a59",
        scaleMargins: { top: 0.05, bottom: 0.2 },
        alignLabels: true,
      },
      leftPriceScale: { visible: false },
      localization: CHART_LOCALIZATION,
      timeScale: {
        borderColor: "#363a59",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: DEFAULT_RIGHT_OFFSET,
        tickMarkFormatter: localTickMarkFormatter,
      },
      width: Math.max(container.clientWidth, 300),
      height: INDICATOR_PANEL_MIN_HEIGHT,
    });

    chartRef.current = chart;
    candlestickRef.current = chart.addCandlestickSeries({
      upColor: "rgba(37,211,102,0.35)",
      downColor: "rgba(248,113,113,0.35)",
      borderUpColor: "rgba(37,211,102,0.6)",
      borderDownColor: "rgba(248,113,113,0.6)",
      wickUpColor: "rgba(37,211,102,0.5)",
      wickDownColor: "rgba(248,113,113,0.5)",
    });

    chart.timeScale().fitContent();
    chart.priceScale("right").applyOptions({ autoScale: true });

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: Math.max(container.clientWidth, 300) });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candlestickRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candlestickRef.current) return;
    candlestickRef.current.setData(candlestickData);
  }, [candlestickData]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.timeScale().applyOptions({
      rightOffset: DEFAULT_RIGHT_OFFSET,
    });
  }, []);

  useEffect(() => {
    if (!chartRef.current || !visibleLogicalRange || candlestickData.length === 0) return;
    const lastIdx = candlestickData.length - 1;
    const clampedFrom = Math.max(0, visibleLogicalRange.from);
    const from = clampedFrom <= visibleLogicalRange.to ? clampedFrom : Math.max(0, lastIdx - 30);
    const to = clampedFrom <= visibleLogicalRange.to ? visibleLogicalRange.to : lastIdx;
    chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
  }, [visibleLogicalRange, candlestickData]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = candlestickRef.current;
    const overlay = overlayRef.current;
    if (!chart || !series || !overlay || bars.length === 0) return;

    const drawFootprintOverlay = () => {
      const timeScale = chart.timeScale();
      const tickSize = priceBin;
      const halfHeight = tickSize / Math.max(vpocBoxWidth, 0.1);
      const vpocOpacity = Math.max(0, Math.min(1, vpocLineOpacity / 100));

      const ctx = overlay.getContext("2d");
      if (!ctx) return;

      overlay.width = overlay.clientWidth;
      overlay.height = overlay.clientHeight;
      ctx.clearRect(0, 0, overlay.width, overlay.height);

      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i];
        const prevBar = bars[i - 1];
        const nextBar = bars[i + 1];

        const tCur = Math.floor(bar.barStart) as UTCTimestamp;
        const xCur = timeScale.timeToCoordinate(tCur);
        if (xCur == null) continue;

        const tPrev = prevBar ? Math.floor(prevBar.barStart) : tCur - barSeconds;
        const tNext = nextBar ? Math.floor(nextBar.barStart) : tCur + barSeconds;
        const xPrev = timeScale.timeToCoordinate(tPrev as UTCTimestamp);
        const xNext = timeScale.timeToCoordinate(tNext as UTCTimestamp);

        const barSpacing = (xNext ?? xCur + 50) - (xPrev ?? xCur - 50);
        const left = xCur - barSpacing * 0.5;
        const right = xCur + barSpacing * 0.5;
        const barWidth = right - left;
        const maxVol = Math.max(1, ...Object.values(bar.clusters).map((c) => c.total_vol));

        for (const [priceKey, cluster] of Object.entries(bar.clusters)) {
          if (cluster.total_vol <= 0) continue;

          const price = Number(priceKey);
          const yTop = series.priceToCoordinate(price + tickSize / 2);
          const yBottom = series.priceToCoordinate(price - tickSize / 2);
          if (yTop == null || yBottom == null) continue;

          const cellH = yBottom - yTop;
          const half = barWidth / 2;
          const buyW = (cluster.buy_vol / maxVol) * half;
          const sellW = (cluster.sell_vol / maxVol) * half;

          ctx.fillStyle = "rgba(10,13,27,0.6)";
          ctx.fillRect(left, yTop, barWidth, cellH);

          const imbalance = cluster.buy_vol - cluster.sell_vol;
          const strength = Math.abs(imbalance) / Math.max(cluster.total_vol, 1);
          if (cluster.total_vol >= IMBALANCE_MIN_VOL && strength >= IMBALANCE_THRESHOLD) {
            ctx.fillStyle = imbalance > 0 ? "rgba(34,197,94,0.2)" : "rgba(248,113,113,0.2)";
            ctx.fillRect(left, yTop, barWidth, cellH);
          }

          ctx.fillStyle = "rgba(34,197,94,0.85)";
          ctx.fillRect(left + half, yTop + 1, buyW, cellH - 2);
          ctx.fillStyle = "rgba(248,113,113,0.85)";
          ctx.fillRect(left + half - sellW, yTop + 1, sellW, cellH - 2);

          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.font = "9px monospace";
          ctx.textAlign = "center";
          ctx.fillText(
            `${cluster.buy_vol.toFixed(1)} / ${cluster.sell_vol.toFixed(1)}`,
            left + barWidth / 2,
            (yTop + yBottom) / 2 + 3
          );
        }

        if (bar.vpocPrice) {
          const vpocPrice = Number(bar.vpocPrice);
          const yTop = series.priceToCoordinate(vpocPrice + halfHeight);
          const yBottom = series.priceToCoordinate(vpocPrice - halfHeight);
          if (yTop != null && yBottom != null) {
            ctx.strokeStyle = vpocBoxColor;
            ctx.globalAlpha = vpocOpacity;
            ctx.lineWidth = vpocLineWidth;
            ctx.strokeRect(left, yTop, barWidth, yBottom - yTop);
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    drawFootprintOverlay();

    const handleRangeChange = () => {
      requestAnimationFrame(drawFootprintOverlay);
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);
    chart.timeScale().subscribeVisibleTimeRangeChange(handleRangeChange);

    const ro = new ResizeObserver(() => requestAnimationFrame(drawFootprintOverlay));
    ro.observe(overlay);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleRangeChange);
      ro.disconnect();
    };
  }, [bars, priceBin, vpocBoxColor, vpocBoxWidth, vpocLineOpacity, vpocLineWidth, barSeconds]);

  return (
    <div className="rounded-2xl border border-[#363a59] bg-[#080a14] p-4 text-sm w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 text-xs uppercase tracking-[0.4em] text-slate-500">
        <div className="space-y-1 text-right">
          <span className="font-semibold text-white">Footprint History · {symbolLabel} · {formattedPrice}</span>
          <span className="text-[11px] text-slate-500">Pyth Benchmarks · {resolutionLabel}</span>
        </div>
        <div className="flex flex-wrap gap-3 normal-case tracking-normal text-[11px] items-center justify-end text-right">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-green-500/70" />
            Buy
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-red-400/70" />
            Sell
          </span>
          <span className="text-slate-500">bin≈{priceBin.toFixed(2)} · {bars.length} bars</span>
          {loading && <span className="text-slate-600 animate-pulse">Loading…</span>}
          {error && <span className="text-rose-400" title={error}>Error</span>}
        </div>
      </div>
      <div
        className="rounded-xl border border-[#1d2142] bg-[#0d0f18] overflow-hidden relative"
        style={{ height: INDICATOR_PANEL_MIN_HEIGHT }}
      >
        {bars.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 z-10">
            {error ? `Binance API error: ${error}` : "Đang tải dữ liệu Binance…"}
          </div>
        )}
        {bars.length === 0 && loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 animate-pulse z-10">
            Đang tải lịch sử giao dịch…
          </div>
        )}
        <div className="relative w-full" style={{ height: INDICATOR_PANEL_MIN_HEIGHT }}>
          <div
            ref={containerRef}
            className="w-full h-full"
            style={{
              opacity: bars.length > 0 ? 1 : 0.3,
            }}
          />
          <canvas
            ref={overlayRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 1 }}
          />
        </div>
      </div>
    </div>
  );
}

function resolutionToParams(tvResolution: string): { resolution: string; rangeSeconds: number; resolutionSeconds: number } {
  const trimmed = String(tvResolution || "1D").trim();
  const upper = trimmed.toUpperCase();
  let resolutionSeconds: number;
  let resolution: string;
  const leadingNumberMatch = trimmed.match(/^(\d+)/);
  const numericValue = leadingNumberMatch ? Number(leadingNumberMatch[1]) : NaN;

  if (upper === "D" || upper === "1D") {
    resolutionSeconds = 86400;
    resolution = "1D";
  } else if (upper === "W" || upper === "1W") {
    resolutionSeconds = 604800;
    resolution = "1W";
  } else if (upper === "M" || upper === "1M") {
    resolutionSeconds = 2592000;
    resolution = "1M";
  } else if (trimmed.endsWith("m") && !Number.isNaN(numericValue)) {
    resolutionSeconds = numericValue * 60;
    resolution = String(numericValue);
  } else if (trimmed.endsWith("M") && !Number.isNaN(numericValue)) {
    resolutionSeconds = numericValue * 2592000;
    resolution = `${numericValue}M`;
  } else if (trimmed.toLowerCase().endsWith("h") && !Number.isNaN(numericValue)) {
    resolutionSeconds = numericValue * 3600;
    resolution = String(numericValue * 60);
  } else if (trimmed.toLowerCase().endsWith("d") && !Number.isNaN(numericValue)) {
    resolutionSeconds = numericValue * 86400;
    resolution = `${numericValue}D`;
  } else if (trimmed.toLowerCase().endsWith("w") && !Number.isNaN(numericValue)) {
    resolutionSeconds = numericValue * 604800;
    resolution = `${numericValue}W`;
  } else if (/^\d+$/.test(trimmed)) {
    resolutionSeconds = Number(trimmed) * 60;
    resolution = trimmed;
  } else {
    resolutionSeconds = 86400;
    resolution = "1D";
  }

  const targetBars = 300;
  const rangeSeconds = Math.min(resolutionSeconds * targetBars, MAX_RANGE_SECONDS);

  return { resolution, rangeSeconds, resolutionSeconds };
}


type IndicatorPoint = { time: UTCTimestamp; value: number };

interface MultiSeriesChartProps {
  title: string;
  seriesSets: Array<{ label: string; color: string; data: IndicatorPoint[] }>;
  /** Visible logical range shared from the main/TradingView chart - syncs right offset with main chart */
  visibleLogicalRange?: { from: number; to: number } | null;
  /** Offset to map main chart logical indices to sub-chart (e.g. RSI/ADX start after N bars) */
  logicalOffset?: number;
  zones?: Array<{ value: number; color: string; lineStyle?: LineStyle; lineWidth?: number }>;
  zoneGradient?: string;
  signalSet?: SignalsResult;
  topWarning?: string;
}

function calculateSMA(history: BenchmarkHistoryPoint[], length: number): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (!history.length || history.length < length) return result;
  let sum = 0;
  for (let i = 0; i < history.length; i += 1) {
    sum += history[i].close;
    if (i >= length) sum -= history[i - length].close;
    if (i >= length - 1) {
      result.push({ time: history[i].time as UTCTimestamp, value: sum / length });
    }
  }
  return result;
}

function calculateEMA(history: BenchmarkHistoryPoint[], length: number): IndicatorPoint[] {
  if (!history.length || history.length < length) return [];
  const k = 2 / (length + 1);
  const result: IndicatorPoint[] = [];
  let ema = history.slice(0, length).reduce((s, p) => s + p.close, 0) / length;
  result.push({ time: history[length - 1].time as UTCTimestamp, value: ema });
  for (let i = length; i < history.length; i += 1) {
    ema = history[i].close * k + ema * (1 - k);
    result.push({ time: history[i].time as UTCTimestamp, value: ema });
  }
  return result;
}

function calculateRSI(history: BenchmarkHistoryPoint[], length: number): IndicatorPoint[] {
  if (!history.length || history.length <= length) return [];
  const result: IndicatorPoint[] = [];
  for (let i = length; i < history.length; i += 1) {
    let gains = 0;
    let losses = 0;
    for (let j = i - length + 1; j <= i; j += 1) {
      const change = history[j].close - history[j - 1].close;
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / length;
    const avgLoss = losses / length;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    result.push({ time: history[i].time as UTCTimestamp, value: Math.min(100, Math.max(0, rsi)) });
  }
  return result;
}

function calculateMomentum(history: BenchmarkHistoryPoint[], length: number): IndicatorPoint[] {
  if (!history.length || history.length <= length) return [];
  return history.slice(length).map((point, index) => ({
    time: point.time as UTCTimestamp,
    value: point.close - history[index].close,
  }));
}

const SIGNAL_TARGET_PCT = 0.01; // 1% profit target for win-rate stats

type SignalEntry = {
  time: UTCTimestamp;
  entryPrice: number;
  target: number;
  /** true if price reached target within the evaluation window */
  isCorrect: boolean;
  type: "long" | "short";
};

type SignalAccuracy = { correct: number; total: number; pct: number };

type SignalsResult = {
  long: SignalEntry[];
  short: SignalEntry[];
  longAccuracy: SignalAccuracy;
  shortAccuracy: SignalAccuracy;
};

function buildSignalAccuracy(signals: SignalEntry[], histIdxByTime: Map<number, number>, historyLength: number): SignalAccuracy {
  const measured = signals.filter((s) => {
    const idx = histIdxByTime.get(s.time as number) ?? -1;
    return idx >= 0 && historyLength - idx > 13;
  });
  const correct = measured.filter((s) => s.isCorrect).length;
  return {
    correct,
    total: measured.length,
    pct: measured.length ? (correct / measured.length) * 100 : 0,
  };
}

/** Scan full history for Golden Cross / Death Cross with price & EMA vs SMA + pullback conditions */
function findCrossSignals(
  history: BenchmarkHistoryPoint[],
  smaData: IndicatorPoint[],
  ema12Data: IndicatorPoint[],
  ema26Data: IndicatorPoint[]
): SignalsResult {
  const longRaw: Array<{ time: UTCTimestamp; histIdx: number }> = [];
  const shortRaw: Array<{ time: UTCTimestamp; histIdx: number }> = [];
  const priceByTime = new Map<number, number>();
  const smaByTime = new Map<number, number>();
  const ema12ByTime = new Map<number, number>();
  const histIdxByTime = new Map<number, number>();
  history.forEach((p, idx) => {
    priceByTime.set(p.time as number, p.close);
    histIdxByTime.set(p.time as number, idx);
  });
  smaData.forEach((p) => smaByTime.set(p.time as number, p.value));
  ema12Data.forEach((p) => ema12ByTime.set(p.time as number, p.value));

  for (let i = 1; i < ema26Data.length; i += 1) {
    const prevEma12 = ema12ByTime.get(ema26Data[i - 1].time as number);
    const prevEma26 = ema26Data[i - 1].value;
    const currEma12 = ema12ByTime.get(ema26Data[i].time as number);
    const currEma26 = ema26Data[i].value;
    const price = priceByTime.get(ema26Data[i].time as number);
    const sma = smaByTime.get(ema26Data[i].time as number);
    const histIdx = histIdxByTime.get(ema26Data[i].time as number);
    if (
      prevEma12 == null || currEma12 == null || price == null ||
      sma == null || prevEma26 == null || currEma26 == null
    ) continue;

    const goldenCross = prevEma12 <= prevEma26 && currEma12 > currEma26;
    const deathCross = prevEma12 >= prevEma26 && currEma12 < currEma26;
    const priceAboveSma = price > sma;
    const priceBelowSma = price < sma;
    const emaAboveSma = currEma12 > sma && currEma26 > sma;
    const emaBelowSma = currEma12 < sma && currEma26 < sma;
    const nearSma = Math.abs(price - sma) <= sma * 0.01;
    const nearEma12 = Math.abs(price - currEma12) <= currEma12 * 0.01;
    const pullback = nearSma || nearEma12;

    if (goldenCross && priceAboveSma && emaAboveSma && pullback) {
      longRaw.push({ time: ema26Data[i].time as UTCTimestamp, histIdx: histIdx ?? -1 });
    }
    if (deathCross && priceBelowSma && emaBelowSma && pullback) {
      shortRaw.push({ time: ema26Data[i].time as UTCTimestamp, histIdx: histIdx ?? -1 });
    }
  }

  const longSignals: SignalEntry[] = longRaw.map(({ time, histIdx }) => {
    const entryPrice = histIdx >= 0 ? history[histIdx].close : 0;
    const target = entryPrice * (1 + SIGNAL_TARGET_PCT);
    const nextBars = histIdx >= 0 ? history.slice(histIdx + 1, histIdx + 27) : [];
    // Use best available price: prefer high, fallback to close (Pyth intraday may omit OHLC)
    const isCorrect = nextBars.length > 0 &&
      nextBars.some((bar) => Math.max(bar.high ?? bar.close, bar.close) >= target);
    return { time, entryPrice, target, isCorrect, type: "long" };
  });

  const shortSignals: SignalEntry[] = shortRaw.map(({ time, histIdx }) => {
    const entryPrice = histIdx >= 0 ? history[histIdx].close : 0;
    const target = entryPrice * (1 - SIGNAL_TARGET_PCT);
    const nextBars = histIdx >= 0 ? history.slice(histIdx + 1, histIdx + 27) : [];
    // Use best available price: prefer low, fallback to close
    const isCorrect = nextBars.length > 0 &&
      nextBars.some((bar) => Math.min(bar.low ?? bar.close, bar.close) <= target);
    return { time, entryPrice, target, isCorrect, type: "short" };
  });

  return {
    long: longSignals,
    short: shortSignals,
    longAccuracy: buildSignalAccuracy(longSignals, histIdxByTime, history.length),
    shortAccuracy: buildSignalAccuracy(shortSignals, histIdxByTime, history.length),
  };
}

function findRsiDivergenceSignals(
  history: BenchmarkHistoryPoint[],
  rsi14Data: IndicatorPoint[],
  rsi28Data: IndicatorPoint[]
): SignalsResult {
  const rsi14ByTime = new Map<number, number>();
  const rsi28ByTime = new Map<number, number>();
  const histIdxByTime = new Map<number, number>();
  history.forEach((p, idx) => histIdxByTime.set(p.time as number, idx));
  rsi14Data.forEach((p) => rsi14ByTime.set(p.time as number, p.value));
  rsi28Data.forEach((p) => rsi28ByTime.set(p.time as number, p.value));

  const priceLows: Array<{ idx: number; value: number; time: number }> = [];
  const priceHighs: Array<{ idx: number; value: number; time: number }> = [];
  const longCandidates: Array<{ time: UTCTimestamp; histIdx: number }> = [];
  const shortCandidates: Array<{ time: UTCTimestamp; histIdx: number }> = [];

  for (let i = 1; i < history.length - 1; i += 1) {
    const prevPrice = history[i - 1].close;
    const currPrice = history[i].close;
    const nextPrice = history[i + 1].close;
    const currTime = history[i].time as number;

    if (currPrice <= prevPrice && currPrice <= nextPrice) {
      const prevLow = priceLows[priceLows.length - 1];
      const currRsi14 = rsi14ByTime.get(currTime);
      const currRsi28 = rsi28ByTime.get(currTime);
      if (prevLow) {
        const prevTime = prevLow.time;
        const prevRsi14 = rsi14ByTime.get(prevTime);
        const prevRsi28 = rsi28ByTime.get(prevTime);
        if (
          currPrice < prevLow.value &&
          currRsi14 != null &&
          prevRsi14 != null &&
          currRsi28 != null &&
          prevRsi28 != null &&
          currRsi14 > prevRsi14 &&
          currRsi28 > prevRsi28
        ) {
          longCandidates.push({ time: history[i].time as UTCTimestamp, histIdx: i });
        }
      }
      priceLows.push({ idx: i, value: currPrice, time: currTime });
    }

    if (currPrice >= prevPrice && currPrice >= nextPrice) {
      const prevHigh = priceHighs[priceHighs.length - 1];
      const currRsi14 = rsi14ByTime.get(currTime);
      const currRsi28 = rsi28ByTime.get(currTime);
      if (prevHigh) {
        const prevTime = prevHigh.time;
        const prevRsi14 = rsi14ByTime.get(prevTime);
        const prevRsi28 = rsi28ByTime.get(prevTime);
        if (
          currPrice > prevHigh.value &&
          currRsi14 != null &&
          prevRsi14 != null &&
          currRsi28 != null &&
          prevRsi28 != null &&
          currRsi14 < prevRsi14 &&
          currRsi28 < prevRsi28
        ) {
          shortCandidates.push({ time: history[i].time as UTCTimestamp, histIdx: i });
        }
      }
      priceHighs.push({ idx: i, value: currPrice, time: currTime });
    }
  }

  const longSignals: SignalEntry[] = longCandidates.map(({ time, histIdx }) => {
    const entryPrice = history[histIdx].close;
    const target = entryPrice * (1 + SIGNAL_TARGET_PCT);
    const future = history.slice(histIdx + 1, histIdx + 27);
    const isCorrect = future.length > 0 && future.some((bar) => Math.max(bar.high ?? bar.close, bar.close) >= target);
    return { time, entryPrice, target, isCorrect, type: "long" };
  });
  const shortSignals: SignalEntry[] = shortCandidates.map(({ time, histIdx }) => {
    const entryPrice = history[histIdx].close;
    const target = entryPrice * (1 - SIGNAL_TARGET_PCT);
    const future = history.slice(histIdx + 1, histIdx + 27);
    const isCorrect = future.length > 0 && future.some((bar) => Math.min(bar.low ?? bar.close, bar.close) <= target);
    return { time, entryPrice, target, isCorrect, type: "short" };
  });

  return {
    long: longSignals,
    short: shortSignals,
    longAccuracy: buildSignalAccuracy(longSignals, histIdxByTime, history.length),
    shortAccuracy: buildSignalAccuracy(shortSignals, histIdxByTime, history.length),
  };
}

function findMomentumDivergenceSignals(
  history: BenchmarkHistoryPoint[],
  momentumData: IndicatorPoint[]
): SignalsResult {
  const momentumByTime = new Map<number, number>();
  momentumData.forEach((p) => momentumByTime.set(p.time as number, p.value));

  const priceLows: Array<{ idx: number; value: number; time: number }> = [];
  const priceHighs: Array<{ idx: number; value: number; time: number }> = [];
  const longCandidates: Array<{ time: UTCTimestamp; histIdx: number }> = [];
  const shortCandidates: Array<{ time: UTCTimestamp; histIdx: number }> = [];

  for (let i = 1; i < history.length - 1; i += 1) {
    const prevPrice = history[i - 1].close;
    const currPrice = history[i].close;
    const nextPrice = history[i + 1].close;
    const currTime = history[i].time as number;

    if (currPrice <= prevPrice && currPrice <= nextPrice) {
      const prevLow = priceLows[priceLows.length - 1];
      const currMom = momentumByTime.get(currTime);
      if (prevLow) {
        const prevMom = momentumByTime.get(prevLow.time);
        if (
          currPrice < prevLow.value &&
          currMom != null &&
          prevMom != null &&
          currMom > prevMom
        ) {
          longCandidates.push({ time: history[i].time as UTCTimestamp, histIdx: i });
        }
      }
      priceLows.push({ idx: i, value: currPrice, time: currTime });
    }

    if (currPrice >= prevPrice && currPrice >= nextPrice) {
      const prevHigh = priceHighs[priceHighs.length - 1];
      const currMom = momentumByTime.get(currTime);
      if (prevHigh) {
        const prevMom = momentumByTime.get(prevHigh.time);
        if (
          currPrice > prevHigh.value &&
          currMom != null &&
          prevMom != null &&
          currMom < prevMom
        ) {
          shortCandidates.push({ time: history[i].time as UTCTimestamp, histIdx: i });
        }
      }
      priceHighs.push({ idx: i, value: currPrice, time: currTime });
    }
  }

  const histIdxByTime = new Map<number, number>();
  history.forEach((p, idx) => histIdxByTime.set(p.time as number, idx));

  const longSignals: SignalEntry[] = longCandidates.map(({ time, histIdx }) => {
    const entryPrice = history[histIdx].close;
    const target = entryPrice * (1 + SIGNAL_TARGET_PCT);
    const future = history.slice(histIdx + 1, histIdx + 27);
    const isCorrect = future.length > 0 && future.some((bar) => Math.max(bar.high ?? bar.close, bar.close) >= target);
    return { time, entryPrice, target, isCorrect, type: "long" };
  });
  const shortSignals: SignalEntry[] = shortCandidates.map(({ time, histIdx }) => {
    const entryPrice = history[histIdx].close;
    const target = entryPrice * (1 - SIGNAL_TARGET_PCT);
    const future = history.slice(histIdx + 1, histIdx + 27);
    const isCorrect = future.length > 0 && future.some((bar) => Math.min(bar.low ?? bar.close, bar.close) <= target);
    return { time, entryPrice, target, isCorrect, type: "short" };
  });

  return {
    long: longSignals,
    short: shortSignals,
    longAccuracy: buildSignalAccuracy(longSignals, histIdxByTime, history.length),
    shortAccuracy: buildSignalAccuracy(shortSignals, histIdxByTime, history.length),
  };
}

function findADXSignals(
  history: BenchmarkHistoryPoint[],
  adxData: IndicatorPoint[],
  plusDIData: IndicatorPoint[],
  minusDIData: IndicatorPoint[],
  ema12Data: IndicatorPoint[]
): SignalsResult {
  const histIdxByTime = new Map<number, number>();
  const priceByTime = new Map<number, number>();
  const ema12ByTime = new Map<number, number>();
  history.forEach((p, idx) => {
    histIdxByTime.set(p.time as number, idx);
    priceByTime.set(p.time as number, p.close);
  });
  ema12Data.forEach((p) => ema12ByTime.set(p.time as number, p.value));

  const adxByTime = new Map<number, number>();
  const plusDIByTime = new Map<number, number>();
  const minusDIByTime = new Map<number, number>();
  adxData.forEach((p) => adxByTime.set(p.time as number, p.value));
  plusDIData.forEach((p) => plusDIByTime.set(p.time as number, p.value));
  minusDIData.forEach((p) => minusDIByTime.set(p.time as number, p.value));

  const allTimes = Array.from(
    new Set([
      ...adxData.map((p) => p.time as number),
      ...plusDIData.map((p) => p.time as number),
      ...minusDIData.map((p) => p.time as number),
    ])
  ).sort((a, b) => a - b);

  const longCandidates: Array<{ time: UTCTimestamp; histIdx: number }> = [];
  const shortCandidates: Array<{ time: UTCTimestamp; histIdx: number }> = [];

  for (let i = 1; i < allTimes.length; i += 1) {
    const t = allTimes[i];
    const tPrev = allTimes[i - 1];
    const adx = adxByTime.get(t);
    const adxPrev = adxByTime.get(tPrev);
    const plusDI = plusDIByTime.get(t);
    const plusDIPrev = plusDIByTime.get(tPrev);
    const minusDI = minusDIByTime.get(t);
    const minusDIPrev = minusDIByTime.get(tPrev);
    const price = priceByTime.get(t);
    const ema12 = ema12ByTime.get(t);
    const histIdx = histIdxByTime.get(t);

    if (
      adx == null || adxPrev == null || plusDI == null || plusDIPrev == null ||
      minusDI == null || minusDIPrev == null || price == null || ema12 == null || histIdx == null
    ) continue;

    const plusDICrossedUp = plusDIPrev <= minusDIPrev && plusDI > minusDI;
    const minusDICrossedUp = minusDIPrev <= plusDIPrev && minusDI > plusDI;
    const adxAbove25 = adx > 25;
    const adxRising = adx > adxPrev;
    const priceAboveEma12 = price > ema12;
    const priceBelowEma12 = price < ema12;

    if (plusDICrossedUp && adxAbove25 && adxRising && priceAboveEma12) {
      longCandidates.push({ time: t as UTCTimestamp, histIdx });
    }
    if (minusDICrossedUp && adxAbove25 && adxRising && priceBelowEma12) {
      shortCandidates.push({ time: t as UTCTimestamp, histIdx });
    }
  }

  const longSignals: SignalEntry[] = longCandidates.map(({ time, histIdx }) => {
    const entryPrice = history[histIdx].close;
    const target = entryPrice * (1 + SIGNAL_TARGET_PCT);
    const future = history.slice(histIdx + 1, histIdx + 27);
    const isCorrect =
      future.length > 0 &&
      future.some((bar) => Math.max(bar.high ?? bar.close, bar.close) >= target);
    return { time, entryPrice, target, isCorrect, type: "long" };
  });
  const shortSignals: SignalEntry[] = shortCandidates.map(({ time, histIdx }) => {
    const entryPrice = history[histIdx].close;
    const target = entryPrice * (1 - SIGNAL_TARGET_PCT);
    const future = history.slice(histIdx + 1, histIdx + 27);
    const isCorrect =
      future.length > 0 &&
      future.some((bar) => Math.min(bar.low ?? bar.close, bar.close) <= target);
    return { time, entryPrice, target, isCorrect, type: "short" };
  });

  return {
    long: longSignals,
    short: shortSignals,
    longAccuracy: buildSignalAccuracy(longSignals, histIdxByTime, history.length),
    shortAccuracy: buildSignalAccuracy(shortSignals, histIdxByTime, history.length),
  };
}

interface TpoHistogramBin {
  price: number;
  count: number;
}

interface TpoResult {
  poc: number;
  vah: number;
  val: number;
  segments: number[];
  histogram: TpoHistogramBin[];
}

function computeTpoRowHeight(
  ohlc: Array<{ high: number; low: number; close: number }>,
  period: number,
  detailPct: number,
  pipSize: number
): number {
  const atrArr = calculateATR(ohlc, period);
  if (!atrArr.length) return pipSize * 4;
  const atrInTick = atrArr[atrArr.length - 1] / pipSize;
  const priceInTick = ohlc[ohlc.length - 1].close / pipSize;
  if (priceInTick <= 0) return pipSize * 4;
  const kFactor = (atrInTick * detailPct) / priceInTick;
  const rowSizeInTick = (atrInTick * atrInTick) / (kFactor * priceInTick);
  const rowSizePips = Math.max(0.3, Math.round(rowSizeInTick * 100) / 100);
  return pipSize * rowSizePips;
}

function createTpoSegments(open: number, lowest: number, highest: number, rowHeight: number): number[] {
  const segments: number[] = [];
  let value = open;
  while (value >= lowest - rowHeight) {
    segments.push(value);
    value = Math.abs(value - rowHeight);
  }
  value = open;
  while (value <= highest + rowHeight) {
    segments.push(value);
    value = Math.abs(value + rowHeight);
  }
  return Array.from(new Set(segments)).sort((a, b) => a - b);
}

function buildTpoHistogram(
  bars: Array<{ high: number; low: number }>,
  segments: number[],
  rowHeight: number
): Map<number, number> {
  const histogram = new Map<number, number>();
  if (!segments.length) return histogram;
  for (const bar of bars) {
    const { high, low } = bar;
    let letters = 0;
    for (const segment of segments) {
      if (segment < high && segment > low) letters += 1;
    }
    let current = high;
    for (let i = 0; i <= letters; i += 1) {
      let prev = 0;
      for (const segment of segments) {
        if (prev !== 0 && current >= prev && current <= segment) {
          histogram.set(segment, (histogram.get(segment) ?? 0) + 1);
          break;
        }
        prev = segment;
      }
      current = Math.abs(current - rowHeight);
    }
  }
  return histogram;
}

function calculateVaPocFromHistogram(
  histogram: Map<number, number>,
  segments: number[],
  percent: number,
  rowHeight: number
): TpoResult | null {
  const entries = Array.from(histogram.entries());
  if (entries.length < 4) return null;
  const totalLetters = entries.reduce((sum, [, value]) => sum + value, 0);
  const target = Math.round((percent / 100) * totalLetters);
  let poc = 0;
  let maxCount = -Infinity;
  for (const [price, count] of entries) {
    if (count > maxCount) {
      maxCount = count;
      poc = price;
    }
  }
  let running = histogram.get(poc) ?? 0;
  let upper = poc;
  let lower = poc;
  const sortedSegments = segments;
  const segmentIndex = sortedSegments.indexOf(poc);
  let iUp = segmentIndex;
  let iDown = segmentIndex;
  while (running < target && (iUp < sortedSegments.length - 1 || iDown > 0)) {
    const upPrice = iUp < sortedSegments.length - 1 ? sortedSegments[iUp + 1] : undefined;
    const downPrice = iDown > 0 ? sortedSegments[iDown - 1] : undefined;
    const upValue = upPrice !== undefined ? histogram.get(upPrice) ?? 0 : 0;
    const downValue = downPrice !== undefined ? histogram.get(downPrice) ?? 0 : 0;
    if (upValue >= downValue && upPrice !== undefined) {
      running += upValue;
      upper = upPrice;
      iUp += 1;
    } else if (downPrice !== undefined) {
      running += downValue;
      lower = downPrice;
      iDown -= 1;
    } else {
      break;
    }
  }
  const vah = upper + rowHeight;
  const val = lower - rowHeight;
  const histogramBins: TpoHistogramBin[] = segments.map((price) => ({
    price,
    count: histogram.get(price) ?? 0,
  }));
  return {
    poc,
    vah,
    val,
    segments,
    histogram: histogramBins,
  };
}

function getTpoLevels(history: BenchmarkHistoryPoint[]): TpoResult | null {
  if (history.length < TPO_ACTIVE_BARS + TPO_ATR_PERIOD) return null;
  const ohlc = ensureOHLC(history);
  const activeBars = ohlc.slice(-TPO_ACTIVE_BARS);
  const lastClose = ohlc[ohlc.length - 1]?.close ?? 0;
  const pipSize = lastClose >= 1 ? 0.01 : 0.0001;
  const rowHeight = computeTpoRowHeight(ohlc, TPO_ATR_PERIOD, TPO_ROW_DETAIL_PCT, pipSize);
  const open = activeBars[0].open ?? activeBars[0].close;
  const lowest = Math.min(...activeBars.map((b) => b.low));
  const highest = Math.max(...activeBars.map((b) => b.high));
  const segments = createTpoSegments(open, lowest, highest, rowHeight);
  if (!segments.length) return null;
  const histogram = buildTpoHistogram(
    activeBars.map((b) => ({ high: b.high, low: b.low })),
    segments,
    rowHeight
  );
  return calculateVaPocFromHistogram(histogram, segments, TPO_PERCENT_VA, rowHeight);
}


function calculateATR(ohlc: Array<{ high: number; low: number; close: number }>, period: number): number[] {
  const tr: number[] = [];
  for (let i = 1; i < ohlc.length; i += 1) {
    const { high, low } = ohlc[i];
    const prevClose = ohlc[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const result: number[] = [];
  let sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
  result.push(sum / period);
  for (let i = period; i < tr.length; i += 1) {
    sum = sum - sum / period + tr[i];
    result.push(sum / period);
  }
  return result;
}

interface HalfTrendPoint {
  time: number;
  value: number;
  trend: 0 | 1;
  buySignal?: boolean;
  sellSignal?: boolean;
}

function calculateHalfTrend(
  history: BenchmarkHistoryPoint[],
  amplitude: number,
  channelDev: number
): HalfTrendPoint[] {
  const ohlc = ensureOHLC(history);
  if (ohlc.length < 110) return [];

  const atrArr = calculateATR(ohlc, 100);
  const result: HalfTrendPoint[] = [];
  let trend: 0 | 1 = 0;
  let nextTrend = 0;
  let maxLowPrice = ohlc[0].low;
  let minHighPrice = ohlc[0].high;
  let up = ohlc[0].low;
  let down = ohlc[0].high;

  for (let i = 1; i < ohlc.length; i += 1) {
    const atrIdx = i - 100;
    if (atrIdx < 0) continue;
    const atr2 = atrArr[atrIdx] / 2;
    const dev = channelDev * atr2;

    const highPrice = Math.max(...ohlc.slice(Math.max(0, i - amplitude), i + 1).map((b) => b.high));
    const lowPrice = Math.min(...ohlc.slice(Math.max(0, i - amplitude), i + 1).map((b) => b.low));
    const highma = ohlc.slice(Math.max(0, i - amplitude + 1), i + 1).reduce((s, b) => s + b.high, 0) / Math.min(amplitude, i + 1);
    const lowma = ohlc.slice(Math.max(0, i - amplitude + 1), i + 1).reduce((s, b) => s + b.low, 0) / Math.min(amplitude, i + 1);

    const prevLow = ohlc[i - 1].low;
    const prevHigh = ohlc[i - 1].high;
    const { close } = ohlc[i];

    if (nextTrend === 1) {
      maxLowPrice = Math.max(lowPrice, maxLowPrice);
      if (highma < maxLowPrice && close < prevLow) {
        trend = 1;
        nextTrend = 0;
        minHighPrice = highPrice;
      }
    } else {
      minHighPrice = Math.min(highPrice, minHighPrice);
      if (lowma > minHighPrice && close > prevHigh) {
        trend = 0;
        nextTrend = 1;
        maxLowPrice = lowPrice;
      }
    }

    let arrowUp: number | null = null;
    let arrowDown: number | null = null;
    const prevTrend = result[result.length - 1]?.trend;

    if (trend === 0) {
      if (prevTrend !== undefined && prevTrend !== 0) {
        up = down;
        arrowUp = up - atr2;
      } else {
        up = Math.max(maxLowPrice, up);
      }
      down = up - dev;
    } else {
      if (prevTrend !== undefined && prevTrend !== 1) {
        down = up;
        arrowDown = down + atr2;
      } else {
        down = Math.min(minHighPrice, down);
      }
      up = down + dev;
    }

    const ht = trend === 0 ? up : down;
    const buySignal = arrowUp !== null && trend === 0 && prevTrend === 1;
    const sellSignal = arrowDown !== null && trend === 1 && prevTrend === 0;

    result.push({
      time: ohlc[i].time,
      value: ht,
      trend,
      buySignal,
      sellSignal,
    });
  }
  return result;
}

/** Ensure OHLC for ADX; synthesize from close when missing */
function ensureOHLC(history: BenchmarkHistoryPoint[]): Array<{ high: number; low: number; close: number; open: number; time: number; volume: number }> {
  return history.map((p, i) => {
    const open = p.open ?? (i > 0 ? history[i - 1].close : p.close);
    const close = p.close;
    const high = p.high ?? Math.max(open, close);
    const low = p.low ?? Math.min(open, close);
    const volume = p.volume ?? 0;
    return { open, high, low, close, time: p.time, volume };
  });
}

function formatPluginTime(seconds?: number) {
  const ts = seconds ?? Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function calculateADX(
  history: BenchmarkHistoryPoint[],
  length: number
): { adx: IndicatorPoint[]; plusDI: IndicatorPoint[]; minusDI: IndicatorPoint[] } {
  const ohlc = ensureOHLC(history);
  if (ohlc.length < length * 2) return { adx: [], plusDI: [], minusDI: [] };

  let trSum = 0;
  let plusDMSum = 0;
  let minusDMSum = 0;

  const dxData: Array<{ time: number; value: number }> = [];
  const diSnapshots: Array<{ time: number; pdi: number; mdi: number }> = [];

  for (let i = 1; i < ohlc.length; i += 1) {
    const { high, low } = ohlc[i];
    const prevClose = ohlc[i - 1].close;
    const prevHigh = ohlc[i - 1].high;
    const prevLow = ohlc[i - 1].low;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;

    if (i <= length) {
      trSum += tr;
      plusDMSum += plusDM;
      minusDMSum += minusDM;
      if (i < length) continue;
    } else {
      trSum = trSum - trSum / length + tr;
      plusDMSum = plusDMSum - plusDMSum / length + plusDM;
      minusDMSum = minusDMSum - minusDMSum / length + minusDM;
    }

    const atr = trSum;
    const pdi = atr === 0 ? 0 : (100 * plusDMSum) / atr;
    const mdi = atr === 0 ? 0 : (100 * minusDMSum) / atr;
    const diSum = pdi + mdi;
    const dxVal = diSum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / diSum;
    const time = ohlc[i].time;
    dxData.push({ time, value: dxVal });
    diSnapshots.push({ time, pdi, mdi });
  }

  if (dxData.length < length) return { adx: [], plusDI: [], minusDI: [] };

  let adxValue = dxData.slice(0, length).reduce((sum, item) => sum + item.value, 0) / length;
  const adx: IndicatorPoint[] = [];
  const plusDI: IndicatorPoint[] = [];
  const minusDI: IndicatorPoint[] = [];

  for (let idx = length - 1; idx < dxData.length; idx += 1) {
    if (idx > length - 1) {
      adxValue = ((adxValue * (length - 1)) + dxData[idx].value) / length;
    }
    const time = dxData[idx].time as UTCTimestamp;
    adx.push({ time, value: Math.max(0, Math.min(100, adxValue)) });
    plusDI.push({ time, value: Math.max(0, Math.min(100, diSnapshots[idx].pdi)) });
    minusDI.push({ time, value: Math.max(0, Math.min(100, diSnapshots[idx].mdi)) });
  }

  return { adx, plusDI, minusDI };
}

function generateFallbackData(symbol: PolkadotSymbol, resolutionSeconds = 3600): BenchmarkHistoryPoint[] {
  const basePrice = symbol === "DOTUSD" ? 5 : symbol === "ETHUSD" ? 2200 : 70000;
  const points: BenchmarkHistoryPoint[] = [];
  const barCount = 168;
  let time = Math.floor(Date.now() / 1000) - barCount * resolutionSeconds;
  let price = basePrice;
  for (let i = 0; i < barCount; i += 1) {
    const prevClose = price;
    price = price * (1 + (Math.random() - 0.48) * 0.02);
    const close = Math.round(price * 100) / 100;
    const open = i === 0 ? close : prevClose;
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    const volume = (high - low) * (500 + Math.random() * 500);
    points.push({ time, close, open, high, low, volume });
    time += resolutionSeconds;
  }
  return points;
}

function formatPercent(value?: number) {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export default function IndicatorPanel({ symbol, tradingViewSymbol, resolution, visibleLogicalRange }: IndicatorPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ReturnType<IChartApi["addLineSeries"]> | null>(null);
  const smaSeriesRef = useRef<ReturnType<IChartApi["addLineSeries"]> | null>(null);
  const ema12SeriesRef = useRef<ReturnType<IChartApi["addLineSeries"]> | null>(null);
  const ema26SeriesRef = useRef<ReturnType<IChartApi["addLineSeries"]> | null>(null);
  const htSeriesRef = useRef<ReturnType<IChartApi["addLineSeries"]> | null>(null);
  const [history, setHistory] = useState<BenchmarkHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartInitialized, setChartInitialized] = useState(false);
  const [pluginScriptReady, setPluginScriptReady] = useState(false);
  const pluginRef = useRef<any>(null);
  const [tooltipSignal, setTooltipSignal] = useState<{
    x: number;
    y: number;
    signal: SignalEntry;
    type: "long" | "short";
  } | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showEMASMA, setShowEMASMA] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showADX, setShowADX] = useState(true);
  const [showMomentum, setShowMomentum] = useState(true);
  const [showFootprint, setShowFootprint] = useState(false);
  const [showFuturesLiquidity, setShowFuturesLiquidity] = useState(true);
  const [showLiquidityHeatmap,   setShowLiquidityHeatmap]   = useState(true);
  const [showLiquidationHeatmap, setShowLiquidationHeatmap] = useState(true);

  const [indicatorOrder, setIndicatorOrder] = useState<string[]>(
    ["ema-sma", "rsi", "adx", "momentum", "footprint", "futures-liquidity", "liquidity-heatmap", "liquidation-heatmap"]
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const moveIndicator = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setIndicatorOrder((prev) => {
      const arr = [...prev];
      const fi = arr.indexOf(fromId);
      const ti = arr.indexOf(toId);
      if (fi < 0 || ti < 0) return prev;
      arr.splice(fi, 1);
      arr.splice(ti, 0, fromId);
      return arr;
    });
  };

  useEffect(() => {
    if (window.__LIGHTWEIGHT_CHART_PLUGIN_LOADED) {
      setPluginScriptReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "/plugins/lightweight-chart-plugin.js";
    script.async = true;
    script.onload = () => {
      window.__LIGHTWEIGHT_CHART_PLUGIN_LOADED = true;
      setPluginScriptReady(true);
    };
    document.body.appendChild(script);
    return () => {
      // keep script loaded for the lifetime of the app
    };
  }, []);

  useEffect(() => {
    if (!chartInitialized || !pluginScriptReady) return;
    if (pluginRef.current) return;
    const chart = chartRef.current;
    const series = priceSeriesRef.current;
    if (!chart || !series) return;
    const PluginCtor = window.LighweightChartPlugin;
    if (typeof PluginCtor !== "function") return;
    const plugin = new PluginCtor({
      chart,
      series,
      chartContainerId: "chartContainer",
      chartDivId: "chart",
      overlayCanvasId: "overlayCanvas",
      volumeprofile: { volumeProfileId: "overlayCanvasVP" },
      background: { pointerEvents: "none" },
    });
    plugin.initElement?.();
    plugin.initTooltip?.();
    plugin.boundRectOverlay?.();
    pluginRef.current = plugin;
  }, [chartInitialized, pluginScriptReady]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#0f111f" },
        textColor: "#94a3b8",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "#1e2033" },
        horzLines: { color: "#1e2033" },
      },
      rightPriceScale: {
        borderColor: "#363a59",
        scaleMargins: { top: 0.05, bottom: 0.2 },
      },
      localization: CHART_LOCALIZATION,
      timeScale: {
        borderColor: "#363a59",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: DEFAULT_RIGHT_OFFSET,
        tickMarkFormatter: localTickMarkFormatter,
      },
      crosshair: {
        vertLine: { color: "#3d51ff", width: 1 },
        horzLine: { color: "#3d51ff", width: 1 },
      },
      width: Math.max(container.clientWidth, 300),
      height: INDICATOR_PANEL_MIN_HEIGHT,
    });

    chartRef.current = chart;
    priceSeriesRef.current = chart.addLineSeries({
      color: "#38bdf8",
      lineWidth: 2,
      title: "Price",
    });
    smaSeriesRef.current = chart.addLineSeries({
      color: "#facc15",
      lineWidth: 2,
      lineStyle: 2,
      title: `SMA(${SMA_LENGTH})`,
    });
    ema12SeriesRef.current = chart.addLineSeries({
      color: "#a78bfa",
      lineWidth: 2,
      lineStyle: 2,
      title: `EMA(${EMA_SHORT_LENGTH})`,
    });
    ema26SeriesRef.current = chart.addLineSeries({
      color: "#fb7185",
      lineWidth: 2,
      lineStyle: 2,
      title: `EMA(${EMA_LONG_LENGTH})`,
    });
    htSeriesRef.current = chart.addLineSeries({
      color: "#94a3b8",
      lineWidth: 2,
      title: "HalfTrend",
    });
    setChartInitialized(true);

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: Math.max(container.clientWidth, 300) });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      smaSeriesRef.current = null;
      ema12SeriesRef.current = null;
      ema26SeriesRef.current = null;
      htSeriesRef.current = null;
      setChartInitialized(false);
    };
  // Re-run when showEMASMA toggles so the chart is recreated after its container remounts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEMASMA]);

  const INDICATOR_REFRESH_MS = 15_000;

  useEffect(() => {
    let cancelled = false;
    let isFirstLoad = true;

    const load = () => {
      if (isFirstLoad) {
        setLoading(true);
        setError(null);
      }
      const { resolution: resStr, rangeSeconds, resolutionSeconds } = resolutionToParams(resolution ?? "1D");
      fetchPythBenchmarkHistory(symbol, {
        resolution: resStr,
        rangeSeconds,
        symbolOverride: tradingViewSymbol,
      })
        .then((points) => {
          if (!cancelled) {
            if (points.length >= SMA_LENGTH) {
              setHistory(points);
            } else {
              setHistory(generateFallbackData(symbol, resolutionSeconds));
            }
          }
        })
        .catch(() => {
          if (!cancelled) {
            setHistory(generateFallbackData(symbol, resolutionSeconds));
            setError(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
            isFirstLoad = false;
          }
        });
    };

    load();
    const timer = setInterval(load, INDICATOR_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol, tradingViewSymbol, resolution]);

  const priceData = useMemo(
    () => history.map((p) => ({ time: p.time as UTCTimestamp, value: p.close })),
    [history]
  );
  const smaData = useMemo(() => calculateSMA(history, SMA_LENGTH), [history]);
  const ema12Data = useMemo(() => calculateEMA(history, EMA_SHORT_LENGTH), [history]);
  const ema14Data = useMemo(() => calculateEMA(history, EMA_MID_LENGTH), [history]);
  const ema26Data = useMemo(() => calculateEMA(history, EMA_LONG_LENGTH), [history]);
  const rsi14Data = useMemo(() => calculateRSI(history, RSI_LENGTH), [history]);
  const rsi28Data = useMemo(() => calculateRSI(history, 28), [history]);
  const momentumData = useMemo(() => calculateMomentum(history, MOMENTUM_LENGTH), [history]);
  const { adx: adxData, plusDI: plusDIData, minusDI: minusDIData } = useMemo(
    () => calculateADX(history, ADX_LENGTH),
    [history]
  );
  const tpoResult = useMemo(() => getTpoLevels(history), [history]);
  const latestPrice = priceData[priceData.length - 1]?.value;
  const footprintBin = useMemo(() => {
    const defaultBin = PRICE_BIN_DEFAULTS[symbol] ?? 1;
    if (!latestPrice || Number.isNaN(latestPrice)) return defaultBin;
    const candidate = latestPrice * 0.001;
    if (candidate < 0.01) return 0.01;
    if (candidate >= 1) return Number(candidate.toFixed(2));
    return Number(candidate.toFixed(4));
  }, [latestPrice, symbol]);
  const latestSma = smaData[smaData.length - 1]?.value;
  const latestEma12 = ema12Data[ema12Data.length - 1]?.value;
  const latestEma14 = ema14Data[ema14Data.length - 1]?.value;
  const latestEma26 = ema26Data[ema26Data.length - 1]?.value;
  const latestRsi = rsi14Data[rsi14Data.length - 1]?.value;
  const latestMomentum = momentumData[momentumData.length - 1]?.value;
  const priceSignals = useMemo(
    () => findCrossSignals(history, smaData, ema12Data, ema26Data),
    [history, smaData, ema12Data, ema26Data]
  );
  const rsiDivergenceSignals = useMemo(
    () => findRsiDivergenceSignals(history, rsi14Data, rsi28Data),
    [history, rsi14Data, rsi28Data]
  );
  const rsiSeriesSets = useMemo(
    () => [
      { label: "RSI(14)", color: "#38bdf8", data: rsi14Data },
      { label: "RSI(28)", color: "#22c55e", data: rsi28Data },
    ],
    [rsi14Data, rsi28Data]
  );
  const [stableRsiSignals, setStableRsiSignals] = useState<SignalsResult>(() => ({
    long: [],
    short: [],
    longAccuracy: { correct: 0, total: 0, pct: 0 },
    shortAccuracy: { correct: 0, total: 0, pct: 0 },
  }));
  useEffect(() => {
    if (rsiDivergenceSignals.long.length > 0 || rsiDivergenceSignals.short.length > 0) {
      setStableRsiSignals(rsiDivergenceSignals);
    }
  }, [rsiDivergenceSignals]);

  const adxSignals = useMemo(
    () => findADXSignals(history, adxData, plusDIData, minusDIData, ema12Data),
    [history, adxData, plusDIData, minusDIData, ema12Data]
  );
  const [stableADXSignals, setStableADXSignals] = useState<SignalsResult>(() => ({
    long: [],
    short: [],
    longAccuracy: { correct: 0, total: 0, pct: 0 },
    shortAccuracy: { correct: 0, total: 0, pct: 0 },
  }));
  useEffect(() => {
    if (adxSignals.long.length > 0 || adxSignals.short.length > 0) {
      setStableADXSignals(adxSignals);
    }
  }, [adxSignals]);

  const latestADX = adxData[adxData.length - 1]?.value;
  const adxColorByStrength =
    latestADX == null ? "#a78bfa" :
    latestADX < 20 ? "#94a3b8" :
    latestADX < 40 ? "#3b82f6" :
    "#a78bfa";
  const adxSeriesSets = useMemo(
    () => [
      { label: `ADX(${ADX_LENGTH})`, color: adxColorByStrength, data: adxData },
      { label: "+DI", color: "#22c55e", data: plusDIData },
      { label: "-DI", color: "#f87171", data: minusDIData },
    ],
    [adxData, plusDIData, minusDIData, adxColorByStrength]
  );

  const momentumDivergenceSignals = useMemo(
    () => findMomentumDivergenceSignals(history, momentumData),
    [history, momentumData]
  );
  const [stableMomentumSignals, setStableMomentumSignals] = useState<SignalsResult>(() => ({
    long: [],
    short: [],
    longAccuracy: { correct: 0, total: 0, pct: 0 },
    shortAccuracy: { correct: 0, total: 0, pct: 0 },
  }));
  useEffect(() => {
    if (momentumDivergenceSignals.long.length > 0 || momentumDivergenceSignals.short.length > 0) {
      setStableMomentumSignals(momentumDivergenceSignals);
    }
  }, [momentumDivergenceSignals]);

  const momentumExtremeLevels = useMemo(() => {
    if (!momentumData.length) return { high: Infinity, low: -Infinity };
    const values = momentumData.map((p) => p.value).sort((a, b) => a - b);
    const p95Idx = Math.floor(values.length * 0.95);
    const p5Idx = Math.floor(values.length * 0.05);
    return {
      high: values[Math.min(p95Idx, values.length - 1)] ?? Infinity,
      low: values[Math.max(p5Idx, 0)] ?? -Infinity,
    };
  }, [momentumData]);
  const momentumOverstretched =
    latestMomentum != null &&
    (latestMomentum >= momentumExtremeLevels.high || latestMomentum <= momentumExtremeLevels.low);

  const momentumSeriesSets = useMemo(
    () => [{ label: `Momentum(${MOMENTUM_LENGTH})`, color: "#0ea5e9", data: momentumData }],
    [momentumData]
  );

  const smaDelta = latestPrice && latestSma ? ((latestSma - latestPrice) / latestPrice) * 100 : undefined;
  const ema12Delta = latestPrice && latestEma12 ? ((latestEma12 - latestPrice) / latestPrice) * 100 : undefined;
  const ema14Delta = latestPrice && latestEma14 ? ((latestEma14 - latestPrice) / latestPrice) * 100 : undefined;
  const rsiLabel =
    latestRsi == null ? "—" : latestRsi >= 70 ? "Overbought" : latestRsi <= 30 ? "Oversold" : "Neutral";
  const momentumLabel =
    latestMomentum == null ? "—" : latestMomentum >= 0 ? "Bullish" : "Bearish";


  useEffect(() => {
    const plugin = pluginRef.current;
    if (!plugin) return;
    plugin.volume_data = [];
    plugin.rectangles = [];

    if (tpoResult) {
      const startTime = history[0]?.time ?? Math.floor(Date.now() / 1000);
      const endTime = history[history.length - 1]?.time ?? startTime;
      const startLabel = formatPluginTime(startTime);
      const endLabel = formatPluginTime(endTime);
      tpoResult.histogram.forEach((bin) => {
        if (bin.count <= 0) return;
        plugin.addVolume(endLabel, bin.price, bin.count);
      });
      plugin.addRectangle(
        startLabel,
        tpoResult.val,
        endLabel,
        tpoResult.vah,
        "rgba(34,197,94,0.18)",
        true,
        "TPO Value Area",
        true
      );
    }

    plugin.scheduleRedraw();
  }, [history, tpoResult]);

  const halfTrendData = useMemo(
    () => calculateHalfTrend(history, HT_AMPLITUDE, HT_CHANNEL_DEV),
    [history]
  );

  const htLineData = useMemo(
    () =>
      halfTrendData.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    [halfTrendData]
  );

  const latestHT = halfTrendData[halfTrendData.length - 1]?.value;
  const legendItems = [
    { label: "Price", value: latestPrice, color: "#38bdf8" },
    { label: `EMA(${EMA_SHORT_LENGTH})`, value: latestEma12, color: "#a78bfa" },
    { label: `EMA(${EMA_LONG_LENGTH})`, value: latestEma26, color: "#fb7185" },
    { label: `SMA(${SMA_LENGTH})`, value: latestSma, color: "#facc15" },
    { label: "HalfTrend", value: latestHT, color: "#94a3b8" },
  ];

  const signalMarkers = useMemo<SeriesMarker<Time>[]>(
    () => {
      const markers: SeriesMarker<Time>[] = [];
      priceSignals.long.forEach((s) => {
        markers.push({
          time: s.time,
          position: "belowBar",
          color: "#00C853",
          shape: "circle",
          text: "LONG",
        });
      });
      priceSignals.short.forEach((s) => {
        markers.push({
          time: s.time,
          position: "aboveBar",
          color: "#F44336",
          shape: "circle",
          text: "SHORT",
        });
      });
      return markers.sort((a, b) => (a.time as number) - (b.time as number));
    },
    [priceSignals]
  );

  const lastUpdate = history[history.length - 1]
    ? new Date(history[history.length - 1].time * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  useEffect(() => {
    if (!chartRef.current) return;
    const sortAsc = <T extends { time: UTCTimestamp }>(arr: T[]) =>
      [...arr].sort((a, b) => (a.time as number) - (b.time as number));
    priceSeriesRef.current?.setData(sortAsc(priceData));
    smaSeriesRef.current?.setData(sortAsc(smaData));
    ema12SeriesRef.current?.setData(sortAsc(ema12Data));
    ema26SeriesRef.current?.setData(sortAsc(ema26Data));
    chartRef.current.timeScale().fitContent();
    chartRef.current.priceScale("right").applyOptions({ autoScale: true });
  // chartInitialized included so data is re-applied after chart is recreated on toggle
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceData, smaData, ema12Data, ema26Data, chartInitialized]);

  useEffect(() => {
    if (!htSeriesRef.current || !htLineData.length) return;
    const sorted = [...htLineData].sort((a, b) => (a.time as number) - (b.time as number));
    htSeriesRef.current.setData(sorted);
  // chartInitialized included so HT data is re-applied after chart is recreated on toggle
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htLineData, chartInitialized]);

  useEffect(() => {
    if (!priceSeriesRef.current) return;
    priceSeriesRef.current.setMarkers(signalMarkers);
  }, [signalMarkers]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartInitialized) return;
    const handler = (param: any) => {
      if (!param.time || !param.point) {
        setTooltipSignal(null);
        return;
      }
      const t = param.time as number;
      const longSig = priceSignals.long.find((s) => (s.time as number) === t);
      const shortSig = priceSignals.short.find((s) => (s.time as number) === t);
      if (longSig) {
        setTooltipSignal({ x: param.point.x, y: param.point.y, signal: longSig, type: "long" });
      } else if (shortSig) {
        setTooltipSignal({ x: param.point.x, y: param.point.y, signal: shortSig, type: "short" });
      } else {
        setTooltipSignal(null);
      }
    };
    chart.subscribeCrosshairMove(handler);
    return () => { chart.unsubscribeCrosshairMove(handler); };
  }, [priceSignals, chartInitialized]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.timeScale().applyOptions({
      rightOffset: DEFAULT_RIGHT_OFFSET,
    });
  }, []);

  useEffect(() => {
    if (!chartRef.current || !visibleLogicalRange) return;
    chartRef.current.timeScale().setVisibleLogicalRange({
      from: visibleLogicalRange.from,
      to: visibleLogicalRange.to,
    });
  }, [visibleLogicalRange]);

  return (
    <>
      {/* ══════════════════════════════════════════════
          Fixed left-edge trigger tab — always visible
          ══════════════════════════════════════════════ */}
      <button
        type="button"
        onClick={() => setSidebarOpen((o) => !o)}
        title="Toggle indicator list"
        className="fixed left-0 z-[200] flex flex-col items-center justify-center gap-1.5 transition-all duration-200"
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          width: 28,
          paddingTop: 14,
          paddingBottom: 14,
          borderRadius: "0 10px 10px 0",
          background: sidebarOpen
            ? "linear-gradient(180deg,#3d51ff 0%,#2d3fd0 100%)"
            : "linear-gradient(180deg,#1a1d2e 0%,#141625 100%)",
          border: "1px solid",
          borderLeft: "none",
          borderColor: sidebarOpen ? "#3d51ff" : "#363a59",
          boxShadow: sidebarOpen
            ? "2px 0 16px rgba(61,81,255,0.35)"
            : "2px 0 8px rgba(0,0,0,0.4)",
        }}
      >
        {/* stacked dot-lines icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={sidebarOpen ? "#fff" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6"  x2="21" y2="6"  />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="3" cy="6"  r="1.2" fill={sidebarOpen ? "#fff" : "#94a3b8"} stroke="none" />
          <circle cx="3" cy="12" r="1.2" fill={sidebarOpen ? "#fff" : "#94a3b8"} stroke="none" />
          <circle cx="3" cy="18" r="1.2" fill={sidebarOpen ? "#fff" : "#94a3b8"} stroke="none" />
        </svg>
        {/* rotated label */}
        <span
          className="select-none font-semibold"
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: sidebarOpen ? "#c7d2fe" : "#475569",
          }}
        >
          Chart
        </span>
      </button>

      {/* ══════════════════════
          Fixed backdrop
          ══════════════════════ */}
      <div
        className="fixed inset-0 z-[150] transition-opacity duration-300"
        style={{
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(3px)",
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? "auto" : "none",
        }}
        onClick={() => setSidebarOpen(false)}
      />

      {/* ══════════════════════════
          Fixed left sidebar panel
          ══════════════════════════ */}
      <div
        className="fixed inset-y-0 left-0 z-[180] flex flex-col border-r border-[#252840] shadow-2xl transition-transform duration-300 ease-out"
        style={{
          width: 264,
          background: "linear-gradient(160deg,#0b0d1e 0%,#0d0f22 100%)",
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        {/* sidebar header */}
        <div className="flex items-center justify-between border-b border-[#1a1d30] px-5 py-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#3d51ff]/20">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-300">
              Indicators
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1a1d2e] text-slate-500 hover:text-white transition-colors duration-150"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* toggle list — grouped and sorted by indicatorOrder, rows are draggable */}
        {(() => {
          type IndicatorItem = { id: string; label: string; value: boolean; onChange: (v: boolean) => void; color: string; note?: string };
          const allItems: IndicatorItem[] = [
            { id: "ema-sma",             label: "EMA & SMA Chart",          value: showEMASMA,           onChange: setShowEMASMA,           color: "#a78bfa", note: undefined },
            { id: "rsi",                 label: "RSI Chart",                value: showRSI,              onChange: setShowRSI,              color: "#38bdf8", note: undefined },
            { id: "adx",                 label: "ADX Chart",                value: showADX,              onChange: setShowADX,              color: "#fb7185", note: undefined },
            { id: "momentum",            label: `Momentum (${MOMENTUM_LENGTH})`, value: showMomentum,   onChange: setShowMomentum,         color: "#0ea5e9", note: undefined },
            { id: "footprint",           label: "Footprint History",        value: showFootprint,        onChange: setShowFootprint,        color: "#4ade80", note: "Feature under development." },
            { id: "futures-liquidity",   label: "Futures Liquidity",        value: showFuturesLiquidity, onChange: setShowFuturesLiquidity, color: "#34d399", note: "Feature under development." },
            { id: "liquidity-heatmap",   label: "Liquidity Heatmap",        value: showLiquidityHeatmap, onChange: setShowLiquidityHeatmap, color: "#f97316", note: "Feature under development." },
            { id: "liquidation-heatmap", label: "Liquidation Heatmap",      value: showLiquidationHeatmap, onChange: setShowLiquidationHeatmap, color: "#ef4444", note: "Feature under development." },
          ];

          const TECHNICAL_IDS = new Set(["ema-sma", "rsi", "adx", "momentum"]);
          const sorted = [...allItems].sort((a, b) => indicatorOrder.indexOf(a.id) - indicatorOrder.indexOf(b.id));
          const technicals = sorted.filter((i) => TECHNICAL_IDS.has(i.id));
          const onchain    = sorted.filter((i) => !TECHNICAL_IDS.has(i.id));

          const GroupLabel = ({ icon, label, accent }: { icon: React.ReactNode; label: string; accent: string }) => (
            <div
              className="flex items-center gap-2 px-3 pt-3 pb-1"
              style={{ borderTop: "1px solid #1a1d30" }}
            >
              <span style={{ color: accent }}>{icon}</span>
              <span
                className="text-[9px] font-semibold uppercase tracking-[0.25em]"
                style={{ color: accent }}
              >
                {label}
              </span>
              <span className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${accent}40, transparent)` }} />
            </div>
          );

          const ToggleRow = ({ id, label, value, onChange, color, note }: IndicatorItem) => (
            <div
              key={id}
              draggable
              onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDraggingId(id); }}
              onDragOver={(e) => { e.preventDefault(); if (id !== draggingId) setDragOverId(id); }}
              onDrop={(e) => { e.preventDefault(); if (draggingId) moveIndicator(draggingId, id); setDraggingId(null); setDragOverId(null); }}
              onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
              className="group relative flex items-center justify-between gap-2 rounded-xl px-2 py-[10px] transition-all duration-150 cursor-pointer select-none"
              style={{
                opacity: draggingId === id ? 0.4 : 1,
                background: dragOverId === id && draggingId !== id ? "rgba(61,81,255,0.13)" : undefined,
                outline: dragOverId === id && draggingId !== id ? "1px solid rgba(61,81,255,0.4)" : "1px solid transparent",
                outlineOffset: -1,
              }}
              onClick={() => onChange(!value)}
            >
              {/* grip icon */}
              <div
                className="flex shrink-0 cursor-grab active:cursor-grabbing items-center justify-center text-slate-700 group-hover:text-slate-500 transition-colors duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="9" height="13" viewBox="0 0 9 13" fill="currentColor">
                  <circle cx="2" cy="2"   r="1.3"/><circle cx="7" cy="2"   r="1.3"/>
                  <circle cx="2" cy="6.5" r="1.3"/><circle cx="7" cy="6.5" r="1.3"/>
                  <circle cx="2" cy="11"  r="1.3"/><circle cx="7" cy="11"  r="1.3"/>
                </svg>
              </div>
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: value ? color : "#2a2d4a", boxShadow: value ? `0 0 6px ${color}80` : "none", transition: "all 0.3s" }}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className="truncate text-[13px] leading-none transition-colors duration-200"
                    style={{ color: value ? "#e2e8f0" : "#475569" }}
                  >
                    {label}
                  </span>
                  {note && (
                    <span className="text-[10px] leading-none text-amber-500/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      {note}
                    </span>
                  )}
                </div>
              </div>
              <IOSToggle value={value} onChange={onChange} />
            </div>
          );

          return (
            <div className="flex flex-col pb-3">
              {/* ── Technical Indicators ── */}
              <GroupLabel
                icon={
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                }
                label="Technical Indicators"
                accent="#a78bfa"
              />
              <div className="flex flex-col gap-0.5 px-3">
                {technicals.map((item) => <ToggleRow key={item.id} {...item} />)}
              </div>

              {/* ── On-chain Data ── */}
              <GroupLabel
                icon={
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3"/>
                    <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
                    <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>
                  </svg>
                }
                label="On-chain Data"
                accent="#34d399"
              />
              <div className="flex flex-col gap-0.5 px-3">
                {onchain.map((item) => <ToggleRow key={item.id} {...item} />)}
              </div>
            </div>
          );
        })()}

        {/* sidebar footer */}
        <div className="mt-auto border-t border-[#1a1d30] px-5 py-4">
          <p className="text-[10px] leading-relaxed text-slate-700">
            Drag <span className="text-slate-600">⠿</span> rows to reorder · click outside to close
          </p>
        </div>
      </div>

    <div className="mt-6 px-6 pb-6">
      <div className="bg-[#0f111f] rounded-2xl border border-[#363a59] p-5 shadow-xl shadow-black/20">
        {/* ── Panel header ── */}
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.4em] text-slate-500 mb-3">
          <span>Indicators</span>
          <span className="text-slate-400 text-[10px] normal-case tracking-normal">
            {symbol} · {resolution ?? "1D"} · {lastUpdate}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-left text-sm mb-4">
          <div className="rounded-xl border border-[#363a59] bg-[#121421] p-3 min-h-[120px]">
            <p className="text-[10px] uppercase text-slate-400 mb-1">SMA ({SMA_LENGTH})</p>
            <div className="text-lg font-semibold text-white">${latestSma?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}</div>
            <p className="text-[11px] text-slate-500">{formatPercent(smaDelta)} vs price</p>
          </div>
          <div className="rounded-xl border border-[#363a59] bg-[#121421] p-3 min-h-[120px]">
            <p className="text-[10px] uppercase text-slate-400 mb-1">EMA ({EMA_SHORT_LENGTH})</p>
            <div className="text-lg font-semibold text-white">${latestEma12?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}</div>
            <p className="text-[11px] text-slate-500">{formatPercent(ema12Delta)} vs price</p>
          </div>
          <div className="rounded-xl border border-[#363a59] bg-[#121421] p-3 min-h-[120px]">
            <p className="text-[10px] uppercase text-slate-400 mb-1">EMA ({EMA_MID_LENGTH})</p>
            <div className="text-lg font-semibold text-white">${latestEma14?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}</div>
            <p className="text-[11px] text-slate-500">{formatPercent(ema14Delta)} vs price</p>
          </div>
          <div className="rounded-xl border border-[#363a59] bg-[#121421] p-3 min-h-[120px]">
            <p className="text-[10px] uppercase text-slate-400 mb-1">RSI ({RSI_LENGTH})</p>
            <div className="text-lg font-semibold text-white">{latestRsi?.toFixed(1) ?? "—"}</div>
            <p className="text-[11px] text-slate-500">{rsiLabel}</p>
          </div>
          <div className="rounded-xl border border-[#363a59] bg-[#121421] p-3 min-h-[120px]">
            <p className="text-[10px] uppercase text-slate-400 mb-1">Momentum ({MOMENTUM_LENGTH})</p>
            <div className="text-lg font-semibold text-white">{latestMomentum?.toFixed(2) ?? "—"}</div>
            <p className="text-[11px] text-slate-500">{momentumLabel}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {indicatorOrder.map((id) => {
            const isOver = dragOverId === id && draggingId !== id;
            const isDragging = draggingId === id;
            const displayLabel = INDICATOR_LABELS[id] ?? "Indicator";
            const questionText = `Explain what the ${displayLabel} is signaling right now.`;

            /** Shared drag-wrapper around each chart card */
            const wrap = (content: React.ReactNode) => (
              <div
                key={id}
                draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDraggingId(id); }}
                onDragOver={(e) => { e.preventDefault(); if (id !== draggingId) setDragOverId(id); }}
                onDrop={(e) => { e.preventDefault(); if (draggingId) moveIndicator(draggingId, id); setDraggingId(null); setDragOverId(null); }}
                onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                className="group/card relative"
                style={{
                  opacity: isDragging ? 0.38 : 1,
                  outline: isOver ? "2px solid #3d51ff" : "2px solid transparent",
                  outlineOffset: 2,
                  borderRadius: 16,
                  transition: "opacity 0.2s, outline-color 0.15s",
                  overflow: "visible",
                }}
              >
                {/* centered drag handle strip — visible on card hover */}
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 z-20 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200 flex items-center gap-1.5 px-4 py-[5px] rounded-b-xl cursor-grab active:cursor-grabbing select-none"
                  style={{ background: "rgba(61,81,255,0.13)", border: "1px solid rgba(61,81,255,0.25)", borderTop: "none" }}
                  title="Drag to reorder"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg width="14" height="10" viewBox="0 0 14 10" fill="rgba(148,163,184,0.7)">
                    <circle cx="2"  cy="2" r="1.4"/><circle cx="7"  cy="2" r="1.4"/><circle cx="12" cy="2" r="1.4"/>
                    <circle cx="2"  cy="8" r="1.4"/><circle cx="7"  cy="8" r="1.4"/><circle cx="12" cy="8" r="1.4"/>
                  </svg>
                  <span style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(148,163,184,0.6)" }}>drag</span>
                </div>
                {content}
                <AddToChatbotButton indicatorId={id} label={displayLabel} question={questionText} />
              </div>
            );

            if (id === "ema-sma" && showEMASMA) return wrap(
          <div className="rounded-2xl border border-[#363a59] bg-[#080a14] p-4 text-sm w-full">
            <div className="flex items-center justify-between pb-3 text-[10px] uppercase tracking-[0.4em] text-slate-500">
              <span>EMA &amp; SMA Chart</span>
              <span className="text-slate-400 text-[10px] normal-case tracking-normal">
                {symbol} · {resolution ?? "1D"} · {lastUpdate}
              </span>
            </div>
            <div
              className="rounded-xl border border-[#1d2142] bg-[#0d0f18] overflow-hidden relative"
              style={{ height: INDICATOR_PANEL_MIN_HEIGHT }}
            >
              <div
                id="chartContainer"
                className="relative w-full min-w-[300px]"
                style={{ height: INDICATOR_PANEL_MIN_HEIGHT }}
              >
                <div
                  id="chart"
                  ref={containerRef}
                  className="w-full"
                  style={{ height: INDICATOR_PANEL_MIN_HEIGHT }}
                />
                <canvas
                  id="overlayCanvas"
                  className="absolute inset-0 pointer-events-none"
                  style={{ zIndex: -1 }}
                />
                <canvas
                  id="overlayCanvasVP"
                  className="absolute inset-0 pointer-events-none"
                  style={{ zIndex: -2 }}
                />
              </div>
              <div className="absolute right-[0.5rem] top-4 hidden flex-col items-end gap-1 rounded-lg bg-black/30 px-3 py-2 text-right text-[11px] font-semibold text-white backdrop-blur sm:flex">
                {legendItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-1" style={{ letterSpacing: "-0.05em" }}>
                    <span
                      className="block h-2.5 w-2.5 rounded-full"
                      style={{ background: item.color }}
                    />
                    <span className="text-slate-300">{item.label}</span>
                    <span className="text-[13px] text-white">{item.value?.toFixed(2) ?? "—"}</span>
                  </div>
                ))}
              </div>
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#0d0f18]/80 text-xs uppercase tracking-[0.3em] text-slate-400">
                  Loading...
                </div>
              )}
              {error && (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-rose-400">
                  {error}
                </div>
              )}
              {tooltipSignal && (() => {
                const isLong = tooltipSignal.type === "long";
                const acc = isLong ? priceSignals.longAccuracy : priceSignals.shortAccuracy;
                const fmt = (v: number) =>
                  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const containerW = containerRef.current?.clientWidth ?? 400;
                const tooltipW = 220;
                const rawLeft = tooltipSignal.x + 14;
                const left = rawLeft + tooltipW > containerW ? tooltipSignal.x - tooltipW - 6 : rawLeft;
                const top = Math.max(4, Math.min(tooltipSignal.y - 30, 170));
                const signalTime = tooltipSignal.signal.time as number;
                const rsiAtSignal = rsi14Data.find((p) => (p.time as number) === signalTime)?.value ??
                  (() => {
                    const sorted = [...rsi14Data].sort(
                      (a, b) =>
                        Math.abs((a.time as number) - signalTime) - Math.abs((b.time as number) - signalTime)
                    );
                    return sorted[0]?.value;
                  })();
                const longGradient = "linear-gradient(135deg, rgba(0,200,83,0.25) 0%, rgba(76,175,80,0.4) 100%)";
                const shortGradient = "linear-gradient(135deg, rgba(244,67,54,0.2) 0%, rgba(229,57,53,0.35) 100%)";
                return (
                  <div
                    className="absolute z-50 pointer-events-none select-none rounded-xl border border-[#363a59] p-3 text-xs text-white shadow-2xl backdrop-blur"
                    style={{
                      left,
                      top,
                      width: tooltipW,
                      background: isLong ? longGradient : shortGradient,
                      borderColor: isLong ? "rgba(0,200,83,0.5)" : "rgba(244,67,54,0.5)",
                    }}
                  >
                    <div
                      className="mb-2 flex items-center gap-1.5 font-semibold text-[13px] uppercase tracking-wider"
                      style={{ color: isLong ? "#00C853" : "#F44336" }}
                    >
                      <span>{isLong ? "●" : "●"}</span>
                      <span>Signal Type: {isLong ? "Long" : "Short"}</span>
                    </div>
              <div className="flex justify-between mb-1 text-[12px]">
                <span className="text-slate-400">Signal Time</span>
                <span className="font-mono">
                  {new Date((tooltipSignal.signal.time as number) * 1000).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between mb-1 text-[12px]">
                <span className="text-slate-400">Entry (signal price)</span>
                <span className="font-mono">${fmt(tooltipSignal.signal.entryPrice)}</span>
              </div>
                    <div className="flex justify-between mb-1 text-[12px]">
                      <span className="text-slate-400">RSI(14)</span>
                      <span className="font-mono">{rsiAtSignal != null ? rsiAtSignal.toFixed(2) : "—"}</span>
                    </div>
                    <div className="flex justify-between mb-2 text-[12px]">
                      <span className="text-slate-400">Leverage (Suggest)</span>
                      <span className="font-mono font-semibold" style={{ color: isLong ? "#00C853" : "#F44336" }}>
                        10x
                      </span>
                    </div>
                    <div className="border-t border-[#2a2d4a] pt-2">
                      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">
                        {isLong ? "Long" : "Short"} Win Rate
                      </div>
                      {acc.total === 0 ? (
                        <div className="text-slate-500 text-[11px]">Not enough historical data</div>
                      ) : (
                        <>
                          <div className="flex justify-between mb-0.5">
                            <span className="text-slate-400">Correct / Total</span>
                            <span>{acc.correct} / {acc.total}</span>
                          </div>
                          <div className="flex justify-between mb-1">
                            <span className="text-slate-400">Win Rate</span>
                            <span
                              className="font-semibold"
                              style={{ color: acc.pct >= 50 ? "#4ade80" : "#f87171" }}
                            >
                              {acc.pct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-600">
                            Target ±{(SIGNAL_TARGET_PCT * 100).toFixed(0)}% within 26 bars
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
            ); // end ema-sma wrap

            if (id === "rsi" && showRSI) return wrap(
              <MultiSeriesSubChart
                title="RSI Chart"
                seriesSets={rsiSeriesSets}
                visibleLogicalRange={visibleLogicalRange}
                logicalOffset={RSI_LENGTH}
                zones={[
                  { value: 100, color: "#facc15", lineStyle: LineStyle.Dotted },
                  { value: 70, color: "#fde047", lineStyle: LineStyle.Dashed },
                  { value: 50, color: "#94a3b8", lineStyle: LineStyle.Dashed },
                  { value: 30, color: "#38bdf8", lineStyle: LineStyle.Dashed },
                  { value: 0, color: "#0ea5e9", lineStyle: LineStyle.Dotted },
                ]}
                zoneGradient="linear-gradient(to top, rgba(14,165,233,0.25) 0%, rgba(59,130,246,0.18) 30%, rgba(148,163,184,0.1) 50%, rgba(251,146,60,0.2) 80%, rgba(248,113,113,0.2) 100%)"
                signalSet={stableRsiSignals}
              />
            );

            if (id === "adx" && showADX) return wrap(
              <MultiSeriesSubChart
                title="ADX Chart"
                seriesSets={adxSeriesSets}
                visibleLogicalRange={visibleLogicalRange}
                logicalOffset={ADX_LENGTH}
                signalSet={stableADXSignals}
                topWarning={latestADX != null && latestADX < 20 ? "Sideways market - Limit high leverage" : undefined}
                zones={[
                  { value: 100, color: "#facc15", lineStyle: LineStyle.Dotted },
                  { value: 50, color: "#fde047", lineStyle: LineStyle.Dashed },
                  { value: 25, color: "#94a3b8", lineStyle: LineStyle.Dashed },
                  { value: 0, color: "#0ea5e9", lineStyle: LineStyle.Dotted },
                ]}
                zoneGradient="linear-gradient(to top, rgba(14,165,233,0.15) 0%, rgba(148,163,184,0.08) 25%, rgba(251,146,60,0.15) 50%, rgba(248,113,113,0.2) 100%)"
              />
            );

            if (id === "momentum" && showMomentum) return wrap(
              <MultiSeriesSubChart
                title={`Momentum (${MOMENTUM_LENGTH})`}
                seriesSets={momentumSeriesSets}
                visibleLogicalRange={visibleLogicalRange}
                logicalOffset={MOMENTUM_LENGTH}
                signalSet={stableMomentumSignals}
                topWarning={momentumOverstretched ? "Momentum Overstretched" : undefined}
                zones={[
                  ...(Number.isFinite(momentumExtremeLevels.high)
                    ? [{ value: momentumExtremeLevels.high, color: "#facc15", lineStyle: LineStyle.Dashed as const }]
                    : []),
                  { value: 0, color: "#94a3b8", lineStyle: LineStyle.Dashed },
                  ...(Number.isFinite(momentumExtremeLevels.low)
                    ? [{ value: momentumExtremeLevels.low, color: "#38bdf8", lineStyle: LineStyle.Dashed as const }]
                    : []),
                ]}
                zoneGradient="linear-gradient(to top, rgba(14,165,233,0.2) 0%, rgba(148,163,184,0.08) 50%, rgba(251,146,60,0.2) 100%)"
              />
            );

            if (id === "footprint" && showFootprint) return wrap(
              <FootprintHistoryChart
                polkadotSymbol={symbol}
                priceBin={footprintBin}
                displayPrice={latestPrice}
                resolution={resolution ?? "1D"}
                visibleLogicalRange={visibleLogicalRange}
              />
            );

            if (id === "futures-liquidity" && showFuturesLiquidity) return wrap(
              <FuturesLiquidityChart
                symbol={symbol}
                resolution={resolution ?? "1D"}
                visibleLogicalRange={visibleLogicalRange}
              />
            );

            if (id === "liquidity-heatmap" && showLiquidityHeatmap) return wrap(
              <LiquidityHeatmapChart symbol={symbol} />
            );

            if (id === "liquidation-heatmap" && showLiquidationHeatmap) return wrap(
              <LiquidationHeatmapChart symbol={symbol} />
            );

            return null;
          })}
        </div>
      </div>
    </div>
    </>
  );
}
