import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    TradingView?: {
      widget: new (options: Record<string, unknown>) => {
        onChartReady: (callback: () => void) => void;
        remove: () => void;
        activeChart: () => {
          priceScale: (scaleId: string) => {
            createPriceLine: (options: {
              price: number;
              color?: string;
              lineStyle?: number;
              lineWidth?: number;
              axisLabelVisible?: boolean;
              title?: string;
              titleFontSize?: number;
              titleColor?: string;
              titleBackgroundColor?: string;
            }) => { remove: () => void };
          };
        };
      };
    };
    Datafeeds?: {
      UDFCompatibleDatafeed: new (url: string, updateFrequency?: number, opts?: Record<string, unknown>) => unknown;
    };
    LighweightChartPlugin?: any;
    __LIGHTWEIGHT_CHART_PLUGIN_LOADED?: boolean;
  }
}

const PYTH_BENCHMARKS_URL = "https://benchmarks.pyth.network/v1/shims/tradingview";

export interface TVChartContainerProps {
  symbol?: string;
  referencePrice?: number;
  referenceLabel?: string;
  onIntervalChange?: (resolution: string) => void;
  onTimeScaleRightOffsetChange?: (rightOffset: number) => void;
  onVisibleLogicalRangeChange?: (range: { from: number; to: number } | null) => void;
  tpoLevels?: Array<{
    name: string;
    price: number;
    color: string;
    lineWidth?: number;
    lineStyle?: number;
    labelAlign?: "top" | "bottom";
  }>;
}

export default function TVChartContainer({
  symbol = "BTCUSD",
  referencePrice,
  referenceLabel,
  onIntervalChange,
  onTimeScaleRightOffsetChange,
  onVisibleLogicalRangeChange,
  tpoLevels,
}: TVChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>();
  const chartRef = useRef<any>();
  const priceLineRef = useRef<any>();
  const intervalUnsubRef = useRef<(() => void) | null>(null);
  const timeScaleSizeObserverRef = useRef<{ timeScale: any; handler: () => void } | null>(null);
  const timeScaleRangeObserverRef = useRef<{ timeScale: any; handler: (range: { from: number; to: number } | null) => void } | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const tpoLineRefs = useRef<Record<string, { remove?: () => void; entityId?: unknown }>>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !window.TradingView || !window.Datafeeds) return;

    setChartReady(false);
    if (timeScaleSizeObserverRef.current) {
      try {
        timeScaleSizeObserverRef.current.timeScale.unsubscribeSizeChange(timeScaleSizeObserverRef.current.handler);
      } catch {
        // ignore
      }
      timeScaleSizeObserverRef.current = null;
    }

    try {
      widgetRef.current?.remove?.();
    } catch {
      // ignore
    }
    try {
      priceLineRef.current?.remove?.();
    } catch {
      // ignore
    }
    priceLineRef.current = undefined;
    chartRef.current = undefined;

    try {
      const widget = new window.TradingView.widget({
        symbol,
        interval: "1D",
        container,
        datafeed: new window.Datafeeds.UDFCompatibleDatafeed(PYTH_BENCHMARKS_URL, 15000, {
          maxResponseLength: 500,
          expectedOrder: "latestFirst",
        }),
        library_path: "/charting_library/",
        locale: "en",
        theme: "dark",
        fullscreen: false,
        autosize: true,
        disabled_features: ["use_localstorage_for_settings", "save_chart_properties_to_local_storage", "header_symbol_search"],
        enabled_features: ["study_templates"],
        charts_storage_url: "https://saveload.tradingview.com",
        charts_storage_api_version: "1.1",
        client_id: "tradingview.com",
        user_id: "public_user_id",
        overrides: {
          "paneProperties.background": "#121421",
          "paneProperties.vertGridProperties.color": "#1e2033",
          "paneProperties.horzGridProperties.color": "#1e2033",
          timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
        },
      });

      widgetRef.current = widget;
      const w = widget as { onChartReady?: (cb: () => void) => void; activeChart?: () => unknown };
      if (w.onChartReady) {
        w.onChartReady(() => {
          try {
            const chart = w.activeChart?.() ?? null;
            chartRef.current = chart;
            const rightOffsetHandler = () => {
              try {
                const timeScale = (chart as { timeScale?: () => { rightOffset?: () => number } }).timeScale?.();
                if (!timeScale || typeof onTimeScaleRightOffsetChange !== "function") return;
                const offset = typeof timeScale.rightOffset === "function" ? timeScale.rightOffset() : undefined;
                if (typeof offset === "number") {
                  onTimeScaleRightOffsetChange(offset);
                }
              } catch {
                // ignore
              }
            };
            if (chart && typeof onTimeScaleRightOffsetChange === "function") {
              const timeScale = (chart as { timeScale?: () => { subscribeSizeChange?: (handler: () => void) => void; unsubscribeSizeChange?: (handler: () => void) => void; rightOffset?: () => number } }).timeScale?.();
              if (timeScale && typeof timeScale.subscribeSizeChange === "function") {
                timeScale.subscribeSizeChange(rightOffsetHandler);
                timeScaleSizeObserverRef.current = { timeScale, handler: rightOffsetHandler };
              }
              rightOffsetHandler();
            }
            if (chart && typeof onVisibleLogicalRangeChange === "function") {
              const timeScale = (chart as { timeScale?: () => { subscribeVisibleLogicalRangeChange?: (handler: (range: { from: number; to: number } | null) => void) => void; unsubscribeVisibleLogicalRangeChange?: (handler: (range: { from: number; to: number } | null) => void) => void; getVisibleLogicalRange?: () => { from: number; to: number } | null } }).timeScale?.();
              if (timeScale && typeof timeScale.subscribeVisibleLogicalRangeChange === "function") {
                const rangeHandler = (range: { from: number; to: number } | null) => {
                  onVisibleLogicalRangeChange(range);
                };
                timeScale.subscribeVisibleLogicalRangeChange(rangeHandler);
                timeScaleRangeObserverRef.current = { timeScale, handler: rangeHandler };
              }
              const initialRange = timeScale?.getVisibleLogicalRange?.() ?? null;
              onVisibleLogicalRangeChange(initialRange);
            }
            if (chart && typeof onIntervalChange === "function") {
              const res = (chart as { resolution?: () => string }).resolution?.();
              if (res) onIntervalChange(res);
              const sub = (chart as { onIntervalChanged?: () => { subscribe: (a: unknown, cb: (interval: string) => void) => { unsubscribe: () => void } } }).onIntervalChanged?.();
              if (sub) {
                const subObj = sub.subscribe(null, (interval: string) => onIntervalChange(interval));
                intervalUnsubRef.current = typeof subObj?.unsubscribe === "function" ? subObj.unsubscribe : null;
              }
            }
            setChartReady(true);
          } catch {
            setChartReady(true);
          }
        });
      } else {
        setChartReady(true);
      }
    } catch (err) {
      console.error("[TVChartContainer] Widget init error:", err);
    }

    return () => {
      try {
        intervalUnsubRef.current?.();
        intervalUnsubRef.current = null;
        widgetRef.current?.remove?.();
        if (timeScaleSizeObserverRef.current) {
          try {
            timeScaleSizeObserverRef.current.timeScale.unsubscribeSizeChange(timeScaleSizeObserverRef.current.handler);
          } catch {
            // ignore
          }
          timeScaleSizeObserverRef.current = null;
        }
        if (timeScaleRangeObserverRef.current) {
          try {
            timeScaleRangeObserverRef.current.timeScale.unsubscribeVisibleLogicalRangeChange?.(timeScaleRangeObserverRef.current.handler);
          } catch {
            // ignore
          }
          timeScaleRangeObserverRef.current = null;
        }
      } catch {
        // ignore
      }
      setChartReady(false);
    };
    }, [symbol, onIntervalChange, onTimeScaleRightOffsetChange, onVisibleLogicalRangeChange]);


  useEffect(() => {
    if (!chartReady) return;
    const chart = chartRef.current;
    if (!chart || typeof referencePrice !== "number" || Number.isNaN(referencePrice)) return;

    try {
      const priceScale = (chart as { priceScale?: (id: string) => { createPriceLine?: (opts: Record<string, unknown>) => { remove?: () => void } } }).priceScale?.("right");
      const createPriceLine = priceScale?.createPriceLine;
      if (typeof createPriceLine !== "function") return;

      priceLineRef.current?.remove?.();
      priceLineRef.current = createPriceLine({
        price: referencePrice,
        color: "#facc15",
        lineStyle: 1,
        lineWidth: 2,
        axisLabelVisible: true,
        title: referenceLabel ?? "",
        titleFontSize: 10,
        titleColor: "#facc15",
        titleBackgroundColor: "#121421",
      });
    } catch {
      // Price line không bắt buộc, bỏ qua nếu API khác
    }
  }, [referencePrice, referenceLabel, chartReady]);

  useEffect(() => {
    if (!chartReady) {
      removeAllTpoLines();
      return;
    }
    const chart = chartRef.current;
    if (!chart || !tpoLevels?.length) {
      removeAllTpoLines();
      return;
    }

    function removeAllTpoLines() {
      const ch = chartRef.current;
      Object.entries(tpoLineRefs.current).forEach(([name, line]) => {
        if (line.remove) line.remove();
        else if (line.entityId != null && typeof ch?.removeEntity === "function") {
          try {
            ch.removeEntity(line.entityId);
          } catch {
            // ignore
          }
        }
        delete tpoLineRefs.current[name];
      });
    }

    const keepNames = new Set(tpoLevels.map((l) => l.name));
    Object.entries(tpoLineRefs.current).forEach(([name, line]) => {
      if (!keepNames.has(name)) {
        if (line.remove) line.remove();
        else if (line.entityId != null && typeof chart.removeEntity === "function") {
          try {
            chart.removeEntity(line.entityId);
          } catch {
            // ignore
          }
        }
        delete tpoLineRefs.current[name];
      }
    });

    const useSeriesApi = () => {
      try {
        const series = chart.getSeries?.();
        const createPriceLine = series?.createPriceLine;
        if (typeof createPriceLine !== "function") return false;
        tpoLevels.forEach((level) => {
          tpoLineRefs.current[level.name]?.remove?.();
          tpoLineRefs.current[level.name] = {
            remove: createPriceLine({
              price: level.price,
              color: level.color,
              lineStyle: level.lineStyle ?? 0,
              lineWidth: level.lineWidth ?? 2,
              axisLabelVisible: true,
              title: level.name,
              titleFontSize: 10,
              titleColor: level.color,
              titleBackgroundColor: "#121421",
            })?.remove,
          };
        });
        return true;
      } catch {
        return false;
      }
    };

    const useDrawingsApi = async () => {
      const now = Math.floor(Date.now() / 1000);
      for (const level of tpoLevels) {
        try {
          tpoLineRefs.current[level.name]?.remove?.();
          if (tpoLineRefs.current[level.name]?.entityId != null && typeof chart.removeEntity === "function") {
            chart.removeEntity(tpoLineRefs.current[level.name].entityId);
          }
          const entityId = await chart.createShape?.(
            { time: now, price: level.price },
            {
              shape: "horizontal_line",
              text: level.name,
              lock: true,
              disableSelection: true,
              disableSave: true,
              disableUndo: true,
              overrides: {
                linecolor: level.color,
                linewidth: level.lineWidth ?? 2,
                linestyle: level.lineStyle ?? 0,
                showPrice: true,
                textcolor: level.color,
                vertLabelsAlign: level.labelAlign ?? "top",
              },
            }
          );
          if (entityId != null) {
            tpoLineRefs.current[level.name] = { entityId };
          }
        } catch {
          // ignore
        }
      }
    };

    if (!useSeriesApi()) {
      useDrawingsApi();
    }

    return () => {
      removeAllTpoLines();
    };
  }, [chartReady, tpoLevels]);


  const libsReady = typeof window !== "undefined" && window.TradingView && window.Datafeeds;

  return (
    <div className="relative w-full min-h-[500px] rounded-xl overflow-hidden border border-[#363a59] bg-[#121421]">
      {!libsReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
          <p>Đang tải TradingView...</p>
          <p className="text-xs text-slate-500">Nếu không hiển thị, kiểm tra /charting_library/ và /datafeeds/</p>
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full h-[500px]"
        style={{ visibility: libsReady ? "visible" : "hidden", maxWidth: "100%" }}
      />
    </div>
  );
}
