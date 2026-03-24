import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FngPoint {
  value: number;
  value_classification: string;
  timestamp: number; // unix seconds
}

// ─── Colour helpers ───────────────────────────────────────────────────────────
function scoreColor(v: number): string {
  if (v <= 24) return "#ef4444"; // Extreme Fear
  if (v <= 44) return "#f97316"; // Fear
  if (v <= 54) return "#eab308"; // Neutral
  if (v <= 74) return "#84cc16"; // Greed
  return "#22c55e";              // Extreme Greed
}

function scoreLabel(v: number): string {
  if (v <= 24) return "Extreme Fear";
  if (v <= 44) return "Fear";
  if (v <= 54) return "Neutral";
  if (v <= 74) return "Greed";
  return "Extreme Greed";
}

// ─── Gauge arc (semicircle, 180°) ─────────────────────────────────────────────
const GW = 260;
const GH = 145;
const GCX = GW / 2;
const GCY = GH - 8;
const GR_OUTER = 110;
const GR_INNER = 76;

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as [number, number];
}

/** Builds an SVG arc path for a donut slice (angles in degrees, 0 = right) */
function arcSlice(cx: number, cy: number, ro: number, ri: number, startDeg: number, endDeg: number) {
  const [ox1, oy1] = polarPoint(cx, cy, ro, startDeg);
  const [ox2, oy2] = polarPoint(cx, cy, ro, endDeg);
  const [ix1, iy1] = polarPoint(cx, cy, ri, endDeg);
  const [ix2, iy2] = polarPoint(cx, cy, ri, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `A ${ro} ${ro} 0 ${large} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
    `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    `A ${ri} ${ri} 0 ${large} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
    "Z",
  ].join(" ");
}

const ZONES = [
  { from: 0,  to: 25, color: "#ef4444", label: "Extreme\nFear" },
  { from: 25, to: 45, color: "#f97316", label: "Fear" },
  { from: 45, to: 55, color: "#eab308", label: "Neutral" },
  { from: 55, to: 75, color: "#84cc16", label: "Greed" },
  { from: 75, to: 100, color: "#22c55e", label: "Extreme\nGreed" },
];

function valueToDeg(v: number) {
  // 0 → -180deg (left), 100 → 0deg (right), mapped over semicircle
  return -180 + (v / 100) * 180;
}

function Gauge({ value }: { value: number }) {
  const needleDeg = valueToDeg(value);
  const [nx, ny] = polarPoint(GCX, GCY, GR_INNER - 8, needleDeg);
  const color = scoreColor(value);

  return (
    <svg viewBox={`0 0 ${GW} ${GH}`} width={GW} height={GH} className="overflow-visible">
      {/* Background track */}
      <path
        d={arcSlice(GCX, GCY, GR_OUTER, GR_INNER, -180, 0)}
        fill="rgba(255,255,255,0.05)"
      />

      {/* Colored zone slices */}
      {ZONES.map((z) => {
        const sDeg = valueToDeg(z.from);
        const eDeg = valueToDeg(z.to);
        return (
          <path
            key={z.label}
            d={arcSlice(GCX, GCY, GR_OUTER, GR_INNER, sDeg, eDeg)}
            fill={z.color}
            fillOpacity={0.2}
          />
        );
      })}

      {/* Active filled slice from 0 to current value */}
      <path
        d={arcSlice(GCX, GCY, GR_OUTER, GR_INNER, -180, needleDeg)}
        fill={color}
        fillOpacity={0.55}
      />

      {/* Outer border arc */}
      <path
        d={arcSlice(GCX, GCY, GR_OUTER + 1, GR_OUTER - 1, -180, 0)}
        fill="rgba(255,255,255,0.06)"
      />

      {/* Zone separator ticks */}
      {ZONES.map((z) => {
        const deg = valueToDeg(z.from);
        const [x1, y1] = polarPoint(GCX, GCY, GR_INNER - 2, deg);
        const [x2, y2] = polarPoint(GCX, GCY, GR_OUTER + 2, deg);
        return (
          <line
            key={z.label}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="rgba(255,255,255,0.15)" strokeWidth={1}
          />
        );
      })}

      {/* Needle */}
      <line
        x1={GCX} y1={GCY}
        x2={nx.toFixed(2)} y2={ny.toFixed(2)}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={GCX} cy={GCY} r={7} fill={color} />
      <circle cx={GCX} cy={GCY} r={4} fill="#0b0d1e" />

      {/* Zone labels on arc edges */}
      {[
        { v: 0,   label: "0" },
        { v: 25,  label: "25" },
        { v: 50,  label: "50" },
        { v: 75,  label: "75" },
        { v: 100, label: "100" },
      ].map(({ v, label }) => {
        const deg = valueToDeg(v);
        const [lx, ly] = polarPoint(GCX, GCY, GR_OUTER + 12, deg);
        return (
          <text
            key={label}
            x={lx.toFixed(1)}
            y={ly.toFixed(1)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="8"
            fill="rgba(148,163,184,0.7)"
          >
            {label}
          </text>
        );
      })}

      {/* Center value */}
      <text x={GCX} y={GCY - 26} textAnchor="middle" fontSize="28" fontWeight="800" fill={color}>
        {value}
      </text>
      <text x={GCX} y={GCY - 10} textAnchor="middle" fontSize="10" fontWeight="600" fill={color} letterSpacing="0.05em">
        {scoreLabel(value).toUpperCase()}
      </text>
    </svg>
  );
}

// ─── Bar history chart ─────────────────────────────────────────────────────────
function HistoryBars({ data }: { data: FngPoint[] }) {
  if (!data.length) return null;
  const BAR_W = 8;
  const BAR_GAP = 3;
  const H = 64;
  const total = data.length;
  const W = total * (BAR_W + BAR_GAP);

  const dateStr = (ts: number) => {
    const d = new Date(ts * 1000);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div style={{ overflowX: "auto" }} className="mt-1">
      <svg viewBox={`0 0 ${W} ${H + 18}`} width={W} height={H + 18} style={{ display: "block" }}>
        {data.map((pt, i) => {
          const bh = Math.max(3, (pt.value / 100) * H);
          const x = i * (BAR_W + BAR_GAP);
          const y = H - bh;
          const c = scoreColor(pt.value);
          const showLabel = i === 0 || i === Math.floor(total / 2) || i === total - 1;
          return (
            <g key={pt.timestamp}>
              <rect x={x} y={y} width={BAR_W} height={bh} rx={2} fill={c} fillOpacity={0.75} />
              {showLabel && (
                <text
                  x={x + BAR_W / 2}
                  y={H + 13}
                  textAnchor="middle"
                  fontSize="7"
                  fill="rgba(148,163,184,0.6)"
                >
                  {dateStr(pt.timestamp)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FearGreedIndex() {
  const [current, setCurrent] = useState<FngPoint | null>(null);
  const [history, setHistory] = useState<FngPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("—");
  const [error, setError] = useState(false);

  async function fetchData() {
    try {
      const res = await fetch("https://api.alternative.me/fng/?limit=30&format=json");
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      const raw: { value: string; value_classification: string; timestamp: string }[] =
        json.data ?? [];
      const points: FngPoint[] = raw.map((r) => ({
        value: Number(r.value),
        value_classification: r.value_classification,
        timestamp: Number(r.timestamp),
      }));
      if (!points.length) throw new Error("no data");
      setCurrent(points[0]);
      // reverse so oldest → newest for the bar chart
      setHistory([...points].reverse());
      setLastUpdate(new Date().toLocaleTimeString());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 60_000);
    return () => clearInterval(timer);
  }, []);

  const openChatbot = () => {
    if (!current || typeof window === "undefined") return;
    const prompt = `The Crypto Fear & Greed Index is currently at ${current.value} (${current.value_classification}). What does this mean for the market and how should a trader react?`;
    window.dispatchEvent(
      new CustomEvent("ai-chatbot-request", {
        detail: { topic: "indicators", indicatorId: "fng", label: "Fear & Greed Index", prompt },
      })
    );
  };

  return (
    <div className="rounded-2xl border border-[#363a59] bg-[#0b0d1e] p-4 shadow-xl shadow-black/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#3d51ff]/20">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-300">
            Fear &amp; Greed Index
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">
            crypto · {lastUpdate}
          </span>
          {loading && (
            <div className="h-3 w-3 rounded-full border-2 border-t-transparent border-slate-500 animate-spin" />
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-center py-8 text-[12px] text-slate-500">
          Unable to load data. Check network connection.
        </div>
      )}

      {!error && current && (
        <>
          {/* Gauge */}
          <div className="flex justify-center mt-1">
            <Gauge value={current.value} />
          </div>

          {/* Yesterday / Last week comparison */}
          <div className="mt-1 grid grid-cols-3 gap-2 text-center text-[10px]">
            {[
              { label: "Now",       pt: history[history.length - 1] },
              { label: "Yesterday", pt: history[history.length - 2] },
              { label: "Last Week", pt: history[history.length - 7] },
            ].map(({ label, pt }) =>
              pt ? (
                <div key={label} className="rounded-xl py-2 px-1"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="text-slate-500 mb-0.5">{label}</div>
                  <div className="text-[16px] font-extrabold leading-none" style={{ color: scoreColor(pt.value) }}>
                    {pt.value}
                  </div>
                  <div className="text-[9px] mt-0.5 font-semibold uppercase" style={{ color: scoreColor(pt.value), opacity: 0.8 }}>
                    {scoreLabel(pt.value)}
                  </div>
                </div>
              ) : null
            )}
          </div>

          {/* 30-day history bars */}
          <div className="mt-3">
            <div className="text-[9px] text-slate-600 uppercase tracking-widest mb-1">30-day history</div>
            <HistoryBars data={history} />
          </div>

          {/* Zone legend */}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {ZONES.map((z) => (
              <div key={z.label} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: z.color }} />
                <span className="text-[9px] text-slate-500">{z.label.replace("\n", " ")}</span>
              </div>
            ))}
          </div>

          {/* Add to AI */}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={openChatbot}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-100 shadow-lg shadow-indigo-500/40 transition hover:bg-white/20"
              style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}
              title="Ask Zenit AI about the Fear & Greed Index"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" className="inline-block">
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span>Add to AI</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
