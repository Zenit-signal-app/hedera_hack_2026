import { useEffect, useMemo, useState } from "react";
import {
  fetchPythBenchmarkHistory,
  type BenchmarkHistoryPoint,
  type PolkadotSymbol,
} from "@/services/polkadotPrice";

// ─── Helpers ────────────────────────────────────────────────────────────────
function clamp(v: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}

function emaVal(data: BenchmarkHistoryPoint[], len: number): number | null {
  if (data.length < len) return null;
  const k = 2 / (len + 1);
  let v = data.slice(0, len).reduce((s, p) => s + p.close, 0) / len;
  for (let i = len; i < data.length; i++) v = data[i].close * k + v * (1 - k);
  return v;
}

function atrApprox(data: BenchmarkHistoryPoint[], len: number) {
  const slice = data.slice(-len);
  return slice.reduce(
    (s, p) => s + ((p.high ?? p.close * 1.001) - (p.low ?? p.close * 0.999)),
    0,
  ) / slice.length;
}

// ── Score calculators — 0 = strong short, 50 = neutral, 100 = strong long ──

function scoreRSI(data: BenchmarkHistoryPoint[], len = 14): number {
  if (data.length <= len) return 50;
  let g = 0, l = 0;
  for (let i = data.length - len; i < data.length; i++) {
    const ch = data[i].close - data[i - 1].close;
    if (ch > 0) g += ch; else l -= ch;
  }
  if (l === 0) return 100;
  return clamp(100 - 100 / (1 + g / l));
}

function scoreEMACross(data: BenchmarkHistoryPoint[]): number {
  const price = data[data.length - 1]?.close;
  const e12 = emaVal(data, 12);
  const e26 = emaVal(data, 26);
  if (!price || !e12 || !e26) return 50;
  const ref = Math.max(atrApprox(data, 14), price * 0.002);
  return clamp(50 + 50 * Math.tanh(((price - (e12 + e26) / 2) / ref) * 0.5));
}

function scoreSMA(data: BenchmarkHistoryPoint[], len = 14): number {
  const price = data[data.length - 1]?.close;
  if (!price || data.length < len) return 50;
  const sma = data.slice(-len).reduce((s, p) => s + p.close, 0) / len;
  const ref = Math.max(atrApprox(data, len), price * 0.002);
  return clamp(50 + 50 * Math.tanh(((price - sma) / ref) * 0.5));
}

function scoreADX(data: BenchmarkHistoryPoint[], len = 14): number {
  if (data.length < len + 1) return 50;
  let pDM = 0, mDM = 0, tr = 0;
  for (let i = data.length - len; i < data.length; i++) {
    const h = data[i].high   ?? data[i].close   * 1.002;
    const l = data[i].low    ?? data[i].close   * 0.998;
    const ph = data[i-1].high ?? data[i-1].close * 1.002;
    const pl = data[i-1].low  ?? data[i-1].close * 0.998;
    const pc = data[i-1].close;
    const up = h - ph, dn = pl - l;
    if (up > dn && up > 0) pDM += up;
    if (dn > up && dn > 0) mDM += dn;
    tr += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  if (tr === 0) return 50;
  const pdi = (pDM / tr) * 100;
  const mdi = (mDM / tr) * 100;
  const tot = pdi + mdi;
  if (tot === 0) return 50;
  const dir = (pdi - mdi) / tot;
  const str = (Math.abs(pdi - mdi) / tot) * 100;
  return clamp(50 + dir * (str / 2));
}

function scoreMomentum(data: BenchmarkHistoryPoint[], len = 12): number {
  if (data.length < len * 2) return 50;
  const moms = data.slice(len).map((p, i) => p.close - data[i].close);
  const mn = Math.min(...moms), mx = Math.max(...moms);
  if (mx === mn) return 50;
  const last = moms[moms.length - 1];
  if (last === undefined) return 50;
  return clamp(((last - mn) / (mx - mn)) * 100);
}

// ─── Resolution mapping ─────────────────────────────────────────────────────
function toApiParams(tvRes: string) {
  if (tvRes === "1D" || tvRes === "D")
    return { resolution: "1D", rangeSeconds: 180 * 86400 };
  if (tvRes === "1W" || tvRes === "W")
    return { resolution: "1D", rangeSeconds: 365 * 86400 };
  const m = Number(tvRes);
  if (m >= 240) return { resolution: `${m}`, rangeSeconds: 120 * 86400 };
  if (m >= 60)  return { resolution: `${m}`, rangeSeconds:  90 * 86400 };
  return { resolution: `${m || 60}`, rangeSeconds: 30 * 86400 };
}

// ─── SVG radar geometry ──────────────────────────────────────────────────────
const VB   = 280;
const CX   = 140;
const CY   = 142;
const R    = 96;       // radius for score = 100
const LR   = 120;      // label radius

const AXES = [
  { key: "rsi", label: "RSI",     color: "#38bdf8" },
  { key: "ema", label: "EMA ×",   color: "#a78bfa" },
  { key: "sma", label: "SMA",     color: "#facc15" },
  { key: "adx", label: "ADX",     color: "#fb7185" },
  { key: "mom", label: "MTM",     color: "#4ade80" },
] as const;

const N_AX     = AXES.length;
const A_STEP   = (2 * Math.PI) / N_AX;
const A_START  = -Math.PI / 2;

function axPt(idx: number, score: number): [number, number] {
  const a = A_START + idx * A_STEP;
  const r = (score / 100) * R;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function pentagon(scores: number[]) {
  return scores
    .map((s, i) => axPt(i, s))
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ") + " Z";
}

function gridPentagon(pct: number) {
  return Array.from({ length: N_AX }, (_, i) => axPt(i, pct))
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ") + " Z";
}

function labelPos(idx: number): [number, number] {
  const a = A_START + idx * A_STEP;
  return [CX + LR * Math.cos(a), CY + LR * Math.sin(a)];
}

function textAnchorFor(idx: number) {
  const cosA = Math.cos(A_START + idx * A_STEP);
  if (Math.abs(cosA) < 0.22) return "middle";
  return cosA > 0 ? "start" : "end";
}

function groupOffset(idx: number): number {
  const sinA = Math.sin(A_START + idx * A_STEP);
  if (sinA < -0.5) return -15; // top — shift group up
  if (sinA >  0.5) return  4;  // bottom — shift group down slightly
  return -6;                    // sides
}

// ─── Component ──────────────────────────────────────────────────────────────
interface RadarSignalPanelProps {
  symbol: PolkadotSymbol;
  resolution?: string;
  tradingViewSymbol?: string;
}

export default function RadarSignalPanel({
  symbol,
  resolution = "1D",
  tradingViewSymbol,
}: RadarSignalPanelProps) {
  const [history, setHistory] = useState<BenchmarkHistoryPoint[]>([]);
  const [loading, setLoading]   = useState(true);
  const [lastUpdate, setLastUpdate] = useState("—");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const { resolution: res, rangeSeconds } = toApiParams(resolution);
    fetchPythBenchmarkHistory(symbol, {
      resolution: res,
      rangeSeconds,
      symbolOverride: tradingViewSymbol,
    })
      .then((data) => {
        if (!cancelled) {
          setHistory(data);
          setLastUpdate(new Date().toLocaleTimeString());
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    const timer = setInterval(() => {
      if (cancelled) return;
      fetchPythBenchmarkHistory(symbol, {
        resolution: res,
        rangeSeconds,
        symbolOverride: tradingViewSymbol,
      })
        .then((data) => {
          if (!cancelled) {
            setHistory(data);
            setLastUpdate(new Date().toLocaleTimeString());
          }
        })
        .catch(() => {});
    }, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [symbol, resolution, tradingViewSymbol]);

  const scores = useMemo<number[]>(() => {
    if (history.length < 30) return [50, 50, 50, 50, 50];
    return [
      scoreRSI(history),
      scoreEMACross(history),
      scoreSMA(history),
      scoreADX(history),
      scoreMomentum(history),
    ];
  }, [history]);

  const overall = scores.reduce((s, v) => s + v, 0) / scores.length;
  const bias =
    overall >= 62 ? "LONG" :
    overall <= 38 ? "SHORT" : "NEUTRAL";

  const biasColor  =
    bias === "LONG"  ? "#4ade80" :
    bias === "SHORT" ? "#f87171" : "#94a3b8";

  // Richer fill & stroke for the data polygon
  const fillInner =
    bias === "LONG"  ? "rgba(74,222,128,0.22)"  :
    bias === "SHORT" ? "rgba(248,113,113,0.22)" :
                       "rgba(99,102,241,0.18)";
  const fillOuter =
    bias === "LONG"  ? "rgba(74,222,128,0.06)"  :
    bias === "SHORT" ? "rgba(248,113,113,0.06)" :
                       "rgba(99,102,241,0.04)";
  const strokeColor =
    bias === "LONG"  ? "rgba(74,222,128,0.9)"   :
    bias === "SHORT" ? "rgba(248,113,113,0.9)"  :
                       "rgba(99,102,241,0.85)";

  const confidence = Math.abs(overall - 50) * 2;

  const gradId = `radarGrad-${bias}`;

  return (
    <div className="rounded-2xl border border-[#363a59] bg-[#0b0d1e] p-4 shadow-xl shadow-black/30">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#3d51ff]/20">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-300">
            Signal Radar
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">
            {symbol} · {resolution} · {lastUpdate}
          </span>
          {loading && (
            <div className="h-3 w-3 rounded-full border-2 border-t-transparent border-slate-500 animate-spin" />
          )}
        </div>
      </div>

      {/* Radar SVG */}
      <div className="flex justify-center">
        <svg viewBox={`0 0 ${VB} ${VB}`} width={VB} height={VB} style={{ overflow: "visible" }}>
          <defs>
            {/* Radial gradient for the data polygon fill */}
            <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={fillInner} />
              <stop offset="100%" stopColor={fillOuter} />
            </radialGradient>
          </defs>

          {/* Concentric grid pentagons */}
          {[20, 40, 60, 80, 100].map((pct) => (
            <path
              key={pct}
              d={gridPentagon(pct)}
              fill="none"
              stroke={pct === 50 ? "#3a3f62" : "#252840"}
              strokeWidth={pct === 50 ? 1.2 : 0.7}
              strokeDasharray={pct === 50 ? "4 3" : undefined}
            />
          ))}

          {/* Neutral 50% ring label */}
          <text
            x={(CX + axPt(0, 50)[0]) / 2 + 4}
            y={(CY + axPt(0, 50)[1]) / 2}
            fontSize="7.5" fill="#3a3f62" textAnchor="start"
          >
            50
          </text>

          {/* Axis spokes */}
          {AXES.map((ax, i) => {
            const [x, y] = axPt(i, 100);
            return (
              <line
                key={ax.key}
                x1={CX} y1={CY}
                x2={x.toFixed(1)} y2={y.toFixed(1)}
                stroke={ax.color}
                strokeWidth={1}
                strokeOpacity={0.45}
              />
            );
          })}

          {/* Filled data polygon — gradient */}
          <path
            d={pentagon(scores)}
            fill={`url(#${gradId})`}
            stroke={strokeColor}
            strokeWidth={2.2}
            strokeLinejoin="round"
          />

          {/* Score dots with inner glow ring */}
          {AXES.map((ax, i) => {
            const [x, y] = axPt(i, scores[i]);
            return (
              <g key={ax.key}>
                {/* glow ring */}
                <circle
                  cx={x.toFixed(1)} cy={y.toFixed(1)} r={8}
                  fill={ax.color} fillOpacity={0.15}
                />
                {/* solid dot */}
                <circle
                  cx={x.toFixed(1)} cy={y.toFixed(1)} r={5}
                  fill={ax.color}
                  stroke="#0b0d1e"
                  strokeWidth={1.5}
                />
              </g>
            );
          })}

          {/* Axis labels + score values */}
          {AXES.map((ax, i) => {
            const [lx, ly] = labelPos(i);
            const gOff = groupOffset(i);
            const anchor = textAnchorFor(i);
            const s = scores[i];
            const scoreColor = s >= 62 ? "#4ade80" : s <= 38 ? "#f87171" : "#94a3b8";
            return (
              <g key={ax.key} transform={`translate(${lx.toFixed(1)},${(ly + gOff).toFixed(1)})`}>
                {/* label */}
                <text
                  textAnchor={anchor}
                  fontSize="10"
                  fontWeight="700"
                  fill={ax.color}
                  letterSpacing="0.08em"
                  dy="0em"
                >
                  {ax.label}
                </text>
                {/* score value — brighter, colored by bias */}
                <text
                  textAnchor={anchor}
                  fontSize="10"
                  fontWeight="600"
                  fill={scoreColor}
                  dy="1.3em"
                >
                  {s.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Centre backdrop pill */}
          <rect
            x={CX - 36} y={CY - 22}
            width={72} height={44}
            rx={10}
            fill="rgba(11,13,30,0.75)"
          />

          {/* Centre: bias label */}
          <text x={CX} y={CY - 6} textAnchor="middle"
            fontSize="15" fontWeight="800" fill={biasColor} letterSpacing="0.07em">
            {bias}
          </text>
          {/* Centre: score */}
          <text x={CX} y={CY + 9} textAnchor="middle"
            fontSize="10" fontWeight="600" fill="#94a3b8">
            {overall.toFixed(0)} / 100
          </text>
          {/* Centre: confidence */}
          <text x={CX} y={CY + 21} textAnchor="middle"
            fontSize="8.5" fill="#64748b" letterSpacing="0.04em">
            {confidence.toFixed(0)}% conf.
          </text>
        </svg>
      </div>

      {/* Per-indicator score badges */}
      <div className="mt-1 grid grid-cols-5 gap-1.5">
        {AXES.map((ax, i) => {
          const s = scores[i];
          const isLong  = s >= 62;
          const isShort = s <= 38;
          const scoreColor = isLong ? "#4ade80" : isShort ? "#f87171" : "#94a3b8";
          const bgColor =
            isLong  ? "rgba(74,222,128,0.08)"  :
            isShort ? "rgba(248,113,113,0.08)" :
                      "rgba(148,163,184,0.05)";
          const borderColor =
            isLong  ? "rgba(74,222,128,0.25)"  :
            isShort ? "rgba(248,113,113,0.25)" :
                      "rgba(148,163,184,0.12)";
          return (
            <div
              key={ax.key}
              className="flex flex-col items-center rounded-xl py-2 px-1"
              style={{ background: bgColor, border: `1px solid ${borderColor}` }}
            >
              <span
                className="text-[9px] font-bold uppercase"
                style={{ color: ax.color, letterSpacing: "0.07em" }}
              >
                {ax.label}
              </span>
              <span
                className="mt-0.5 text-[16px] font-extrabold leading-none"
                style={{ color: scoreColor }}
              >
                {s.toFixed(0)}
              </span>
              <span
                className="mt-0.5 text-[8px] font-semibold uppercase"
                style={{ color: scoreColor, opacity: 0.85, letterSpacing: "0.05em" }}
              >
                {isLong ? "Long" : isShort ? "Short" : "Neutral"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend + Add to AI */}
      <div className="mt-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-400/70" />
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">0 = Short</span>
        </div>
        <span className="text-[9px] text-slate-600">50 = Neutral</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">100 = Long</span>
          <span className="h-2 w-2 rounded-full bg-green-400/70" />
        </div>
      </div>

      {/* Add to AI Chatbot */}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (typeof window === "undefined") return;
            const scoresLabel = AXES.map((ax, i) =>
              `${ax.label}: ${scores[i].toFixed(0)}`
            ).join(", ");
            const prompt = `Explain the current Signal Radar readings for ${symbol} (${resolution}): overall bias is ${bias} (${overall.toFixed(0)}/100, ${confidence.toFixed(0)}% confidence). Individual scores — ${scoresLabel}. What does this mean for a potential trade entry?`;
            window.dispatchEvent(
              new CustomEvent("ai-chatbot-request", {
                detail: { topic: "indicators", indicatorId: "radar", label: "Signal Radar", prompt },
              })
            );
          }}
          className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-100 shadow-lg shadow-indigo-500/40 transition hover:bg-white/20"
          style={{
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.3)",
          }}
          title="Ask Zenit AI about the current Signal Radar"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" className="inline-block">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>Add to AI</span>
        </button>
      </div>
    </div>
  );
}
