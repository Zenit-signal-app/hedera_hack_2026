import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  UTCTimestamp,
  type Time,
  TickMarkType,
} from "lightweight-charts";

function localTickMarkFormatter(time: Time, tickMarkType: TickMarkType, locale: string): string | null {
  let d: Date;
  if (typeof time === "number") {
    d = new Date(time * 1000);
  } else if (typeof time === "string") {
    d = new Date(time);
  } else {
    d = new Date(time.year, time.month - 1, time.day);
  }
  const opts: Intl.DateTimeFormatOptions = {};
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
  return d.toLocaleString(locale, opts);
}

// Generate sample price data (contract doesn't have oracle - demo data)
function generateSampleData() {
  const data: { time: number; value: number }[] = [];
  let time = Math.floor(Date.now() / 1000) - 86400 * 7;
  let price = 2500 + Math.random() * 200;
  for (let i = 0; i < 168; i++) {
    price = price + (Math.random() - 0.48) * 50;
    price = Math.max(2300, Math.min(2800, price));
    data.push({ time, value: Math.round(price * 100) / 100 });
    time += 3600;
  }
  return data;
}

export default function TradingChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#121421" },
        textColor: "#9FA3BC",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "#1e2033" },
        horzLines: { color: "#1e2033" },
      },
      rightPriceScale: {
        borderColor: "#363a59",
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: "#363a59",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: localTickMarkFormatter,
      },
      crosshair: {
        vertLine: { color: "#3d51ff", width: 1 },
        horzLine: { color: "#3d51ff", width: 1 },
      },
    });

    chartRef.current = chart;

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: "#0FDE8D",
      downColor: "#FF506A",
      borderUpColor: "#0FDE8D",
      borderDownColor: "#FF506A",
      wickUpColor: "#0FDE8D",
      wickDownColor: "#FF506A",
    });

    // Convert line data to OHLC for candlestick
    const lineData = generateSampleData();
    const ohlcData = lineData.map((d) => {
      const open = d.value;
      const change = (Math.random() - 0.5) * 40;
      const close = Math.max(2300, Math.min(2800, open + change));
      const high = Math.max(open, close) + Math.random() * 20;
      const low = Math.min(open, close) - Math.random() * 20;
      return {
        time: d.time as UTCTimestamp,
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
      };
    });
    candlestickSeries.setData(ohlcData);

    chart.timeScale().fitContent();

    const handleResize = () => chart.applyOptions({ width: chartContainerRef.current!.clientWidth });
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-xl overflow-hidden border border-[#363a59] bg-[#121421]">
      <div className="absolute top-3 left-4 z-10 flex items-center gap-4">
        <span className="text-white font-semibold">PCT/USD</span>
        <span className="text-xs text-slate-400 px-2 py-1 rounded bg-[#1e2033]">1H</span>
        <span className="text-xs text-slate-400 px-2 py-1 rounded bg-[#1e2033]">4H</span>
        <span className="text-xs text-slate-500 px-2 py-1 rounded bg-[#3d51ff]/20 text-blue-400">1D</span>
        <span className="text-xs text-slate-400 px-2 py-1 rounded bg-[#1e2033]">1W</span>
      </div>
      <div ref={chartContainerRef} className="w-full h-full" />
      <div className="absolute bottom-2 right-4 z-10 text-xs text-slate-600">Demo chart</div>
    </div>
  );
}
