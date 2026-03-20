/**
 * BinanceBubbleChart – real-time crypto bubble heatmap powered by Binance APIs + D3 force.
 *
 * Architecture:
 *  - Data layer  : Binance REST (initial load) + WebSocket !miniTicker@arr (real-time)
 *  - Layout layer: d3-force simulation (gravity, collision) → each tick updates SVG attrs
 *  - Render layer: SVG drawn directly via D3 (bypasses React re-renders on every tick)
 *  - UI layer    : React for header, tooltip, controls, overlay
 */

import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";

// ─── Types ────────────────────────────────────────────────────────────────────
type Timeframe = "1H" | "4H" | "24H";
type SortMode  = "volume" | "change";

interface BubbleNode extends d3.SimulationNodeDatum {
  id: string;        // ticker, e.g. "BTC"
  fullId: string;    // full Binance symbol, e.g. "BTCUSDT"
  volume: number;    // quote volume in USDT
  priceChange: number; // % price change in selected timeframe
  delta: number;     // net buy-sell flow (positive = more buyers)
  price: number;
  radius: number;    // computed from volume
  color: string;     // computed from delta
  borderColor: string;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  node: BubbleNode | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const REST_BASE  = "https://api.binance.com/api/v3";
const WS_URL     = "wss://stream.binance.com:9443/ws/!miniTicker@arr";
const TOP_N      = 80;
const MIN_RADIUS = 24;
const MAX_RADIUS = 100;

// ─── Semantic trading color palette ───────────────────────────────────────────
// GREEN  = Active BUY flow dominant  (buyers aggressively lifting asks)
// RED    = Active SELL flow dominant  (sellers hitting bids / exit pressure)
// GREY   = Neutral / balanced supply-demand — neither side controls
//
// Saturation & Value gradient (3-tier per side):
//   Weak delta   →  dark, desaturated  (muted — doesn't draw the eye)
//   Medium delta →  standard vibrant   (clear buy/sell signal)
//   Strong delta →  neon electric      (screams "hotspot!" on screen)
// Uses HSL interpolation so saturation ramps naturally alongside lightness.
// ─── Colour palette matched to stockmap reference image ──────────────────────
// Green: classic forest green with bright green ring
// Red:   deep crimson with bright red ring
// Background: dark charcoal-blue slate
const NEUTRAL_COL  = "#3A3E4A";
const BG_COL       = "#1E2530";

const GREEN_WEAK   = "hsl(130, 40%, 12%)";   // very dark forest
const GREEN_MID    = "#2E7D32";               // rich forest green
const GREEN_VIVID  = "#43A047";               // vivid bright green

const RED_WEAK     = "hsl(0, 40%, 13%)";     // very dark maroon
const RED_MID      = "#B71C1C";               // deep crimson
const RED_VIVID    = "#D32F2F";               // vivid bright red

const greenLow  = d3.interpolateHsl(GREEN_WEAK, GREEN_MID);
const greenHigh = d3.interpolateHsl(GREEN_MID,  GREEN_VIVID);
const redLow    = d3.interpolateHsl(RED_WEAK,   RED_MID);
const redHigh   = d3.interpolateHsl(RED_MID,    RED_VIVID);

function bubbleColor(delta: number, maxAbs: number): string {
  if (maxAbs === 0 || Math.abs(delta) < maxAbs * 0.03) return NEUTRAL_COL;
  const t = Math.pow(Math.min(Math.abs(delta) / maxAbs, 1), 0.50);
  if (delta > 0) {
    return t <= 0.5 ? greenLow(t * 2) : greenHigh((t - 0.5) * 2);
  }
  return t <= 0.5 ? redLow(t * 2) : redHigh((t - 0.5) * 2);
}

function bubbleBorderColor(delta: number, maxAbs: number): string {
  if (maxAbs === 0 || Math.abs(delta) < maxAbs * 0.03) return "rgba(70,75,88,0.55)";
  const t  = Math.min(Math.abs(delta) / maxAbs, 1);
  const al = (0.65 + t * 0.35).toFixed(2);  // 0.65 → 1.00
  // Bright classic green #4CAF50 / red #F44336 like the reference
  if (delta > 0) return `rgba(76,175,80,${al})`;
  return `rgba(244,67,54,${al})`;
}

// Neon glow & bloom: 3-layer stacked drop-shadows.
// At extreme deltas the glow radius and alpha both max out, creating a
// visible "hot spot" beacon effect that draws the user's eye instantly.
function bubbleGlowFilter(delta: number, maxAbs: number): string {
  if (maxAbs === 0) return "none";
  const t = Math.min(Math.abs(delta) / maxAbs, 1);

  if (t < 0.04) {
    return "drop-shadow(0 0 3px rgba(70,75,88,0.20))";
  }

  // Warm subtle glow matching classic green/red ring colour
  const inner = Math.round(3 + t * 7);      // 3 → 10 px
  const outer = Math.round(8 + t * 14);     // 8 → 22 px
  const aIn   = (0.25 + t * 0.40).toFixed(2); // 0.25 → 0.65
  const aOu   = (0.06 + t * 0.16).toFixed(2); // 0.06 → 0.22

  const rgb = delta > 0 ? "76,175,80" : "244,67,54";

  return `drop-shadow(0 0 ${inner}px rgba(${rgb},${aIn})) ` +
         `drop-shadow(0 0 ${outer}px rgba(${rgb},${aOu}))`;
}

// ─── Radius scale (sqrt so area ∝ volume) ────────────────────────────────────
function makeRadiusScale(volumes: number[]) {
  const max = d3.max(volumes) ?? 1;
  return d3.scaleSqrt().domain([0, max]).range([MIN_RADIUS, MAX_RADIUS]).clamp(true);
}

// ─── Volume formatter ─────────────────────────────────────────────────────────
function fmtVol(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// ─── Binance REST fetchers ─────────────────────────────────────────────────────
async function fetch24H(): Promise<BubbleNode[]> {
  const res = await fetch(`${REST_BASE}/ticker/24hr`);
  if (!res.ok) throw new Error("Binance API unavailable");
  const raw: any[] = await res.json();

  const filtered = raw
    .filter(t =>
      t.symbol.endsWith("USDT") &&
      !t.symbol.includes("UPUSDT") &&
      !t.symbol.includes("DOWNUSDT") &&
      !t.symbol.includes("BULLUSDT") &&
      !t.symbol.includes("BEARUSDT") &&
      parseFloat(t.quoteVolume) > 0
    )
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, TOP_N);

  const volumes = filtered.map(t => parseFloat(t.quoteVolume));
  const rScale  = makeRadiusScale(volumes);

  // For 24H we approximate delta = volume * (priceChangePct / 100)
  // Positive % = more buyers drove price up = positive delta
  const deltas = filtered.map(t =>
    parseFloat(t.quoteVolume) * parseFloat(t.priceChangePercent) / 100
  );
  const maxAbs = d3.max(deltas.map(Math.abs)) ?? 1;

  return filtered.map((t, i) => ({
    id:          t.symbol.replace("USDT", ""),
    fullId:      t.symbol,
    volume:      parseFloat(t.quoteVolume),
    priceChange: parseFloat(t.priceChangePercent),
    delta:       deltas[i],
    price:       parseFloat(t.lastPrice),
    radius:      rScale(parseFloat(t.quoteVolume)),
    color:       bubbleColor(deltas[i], maxAbs),
    borderColor: bubbleBorderColor(deltas[i], maxAbs),
  }));
}

async function fetchKlines(interval: "1h" | "4h"): Promise<BubbleNode[]> {
  // Step 1 – get top 60 symbols by 24h volume
  const tickerRes = await fetch(`${REST_BASE}/ticker/24hr`);
  const allTickers: any[] = await tickerRes.json();

  const topSymbols = allTickers
    .filter(t =>
      t.symbol.endsWith("USDT") &&
      !t.symbol.includes("UPUSDT") &&
      !t.symbol.includes("DOWNUSDT") &&
      parseFloat(t.quoteVolume) > 0
    )
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, 60)
    .map(t => t.symbol);

  // Step 2 – fetch klines in parallel (browser handles concurrency)
  const settled = await Promise.allSettled(
    topSymbols.map(sym =>
      fetch(`${REST_BASE}/klines?symbol=${sym}&interval=${interval}&limit=1`)
        .then(r => r.json())
        .then((k: any[]) => {
          if (!k?.[0]) return null;
          const open       = parseFloat(k[0][1]);
          const close      = parseFloat(k[0][4]);
          const quoteVol   = parseFloat(k[0][7]);   // total quoteAsset traded
          const takerBuy   = parseFloat(k[0][10]);  // taker buy quoteAsset volume
          const change     = open > 0 ? (close - open) / open * 100 : 0;
          // Real delta: taker buy (aggressive buyers) minus taker sell
          const delta      = 2 * takerBuy - quoteVol;
          return { symbol: sym, volume: quoteVol, priceChange: change, delta, price: close };
        })
    )
  );

  const valid = settled
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
    .map(r => r.value)
    .sort((a, b) => b.volume - a.volume);

  const rScale  = makeRadiusScale(valid.map((d: any) => d.volume));
  const maxAbs  = d3.max(valid.map((d: any) => Math.abs(d.delta))) ?? 1;

  return valid.map((d: any) => ({
    id:          d.symbol.replace("USDT", ""),
    fullId:      d.symbol,
    volume:      d.volume,
    priceChange: d.priceChange,
    delta:       d.delta,
    price:       d.price,
    radius:      rScale(d.volume),
    color:       bubbleColor(d.delta, maxAbs),
    borderColor: bubbleBorderColor(d.delta, maxAbs),
  }));
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BinanceBubbleChart() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>("24H");
  const [sortMode, setSortMode] = useState<SortMode>("volume");
  const [search, setSearch]     = useState("");
  const [wsLive, setWsLive]     = useState(false);
  const [nodeCount, setNodeCount] = useState(0);
  const [tooltip, setTooltip]   = useState<TooltipState>({ visible: false, x: 0, y: 0, node: null });

  const svgRef      = useRef<SVGSVGElement>(null);
  const simRef      = useRef<d3.Simulation<BubbleNode, undefined> | null>(null);
  const nodesRef    = useRef<BubbleNode[]>([]);
  const wsRef       = useRef<WebSocket | null>(null);
  const batchTimer  = useRef<ReturnType<typeof setTimeout>>();
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // Window size
  useEffect(() => {
    const upd = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, []);

  // Cleanup when overlay closes
  useEffect(() => {
    if (!open) {
      simRef.current?.stop();
      wsRef.current?.close();
      wsRef.current = null;
      setWsLive(false);
      defsReady.current = false;
    }
  }, [open]);

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ── Shared defs + text sizing helpers ─────────────────────────────────────
  const FONT = "'Inter','SF Pro Text',-apple-system,BlinkMacSystemFont,sans-serif";
  const tickerFS  = (r: number) => Math.max(8,  Math.min(r * 0.40, 26));
  const subFS     = (r: number) => Math.max(6,  Math.min(r * 0.26, 14));
  const lineGap   = (r: number) => tickerFS(r) * 1.15 + subFS(r) * 0.5;

  // Adaptive opacity: text fades out smoothly instead of hard show/hide
  const tickerOp  = (r: number) => r < 16 ? 0 : r < 22 ? (r - 16) / 6 : 1;
  const subOp     = (r: number) => r < 26 ? 0 : r < 32 ? (r - 26) / 6 : 1;
  const volOp     = (r: number) => r < 28 ? 0 : r < 36 ? (r - 28) / 8 : 1;

  // Track whether defs (grid, shared gradients, css) are already injected
  const defsReady = useRef(false);

  // ── D3 draw/update (enter/update/exit for smooth timeframe transitions) ──
  const initD3 = useCallback((nodes: BubbleNode[]) => {
    const svg = d3.select(svgRef.current!);
    const maxAbsDelta = d3.max(nodes.map(n => Math.abs(n.delta))) ?? 1;

    // ── One-time: inject defs, CSS, grid, shared gradients ───────────────
    if (!defsReady.current || svg.select("defs").empty()) {
      svg.selectAll("*").remove();
      defsReady.current = true;

      const defs = svg.append("defs");

      defs.append("style").text(`
        .bubble .body,
        .bubble .ring,
        .bubble .shine,
        .bubble .glass,
        .bubble .glass-outer,
        .bubble .vignette {
          transition: r 0.55s cubic-bezier(0.34,1.56,0.64,1);
        }
        .bubble .body {
          transition: r 0.55s cubic-bezier(0.34,1.56,0.64,1),
                      fill 0.5s ease,
                      stroke 0.5s ease;
        }
        .bubble text {
          transition: opacity 0.4s ease, font-size 0.4s ease, y 0.4s ease;
          font-family: ${FONT};
        }
        .bubble .label-ticker {
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.85))
                  drop-shadow(0 0  4px rgba(0,0,0,0.50));
        }
        .bubble .label-top,
        .bubble .label-vol {
          filter: drop-shadow(0 1px 1px rgba(0,0,0,0.70));
        }
      `);

      const gridPat = defs.append("pattern")
        .attr("id", "bg-grid").attr("width", "44").attr("height", "44")
        .attr("patternUnits", "userSpaceOnUse");
      gridPat.append("line")
        .attr("x1", "0").attr("y1", "44").attr("x2", "44").attr("y2", "44")
        .attr("stroke", "rgba(255,255,255,0.018)").attr("stroke-width", "0.5");
      gridPat.append("line")
        .attr("x1", "44").attr("y1", "0").attr("x2", "44").attr("y2", "44")
        .attr("stroke", "rgba(255,255,255,0.018)").attr("stroke-width", "0.5");

      svg.append("rect").attr("class", "bg-grid-rect")
        .attr("width", dims.w).attr("height", dims.h)
        .attr("fill", "url(#bg-grid)").attr("pointer-events", "none");

      // Subtle specular highlight — just a gentle luminosity at upper-left
      const sg = defs.append("radialGradient").attr("id", "shine-shared")
        .attr("cx", "30%").attr("cy", "28%").attr("r", "42%");
      sg.append("stop").attr("offset",  "0%").attr("stop-color", "rgba(255,255,255,0.22)");
      sg.append("stop").attr("offset", "40%").attr("stop-color", "rgba(255,255,255,0.06)");
      sg.append("stop").attr("offset","100%").attr("stop-color", "rgba(255,255,255,0)");

      // Vignette (edge darkening) — helps separate overlapping bubbles
      const vg = defs.append("radialGradient").attr("id", "vignette-shared")
        .attr("cx", "50%").attr("cy", "50%").attr("r", "50%");
      vg.append("stop").attr("offset", "50%").attr("stop-color", "rgba(0,0,0,0)");
      vg.append("stop").attr("offset", "85%").attr("stop-color", "rgba(0,0,0,0.18)");
      vg.append("stop").attr("offset","100%").attr("stop-color", "rgba(0,0,0,0.45)");
    }

    // Update bg-grid size on resize
    svg.select(".bg-grid-rect").attr("width", dims.w).attr("height", dims.h);

    // ── Per-bubble radial gradient — subtle highlight matching reference ─
    const defs = svg.select("defs");
    nodes.forEach(n => {
      const base      = d3.color(n.color) ?? d3.rgb(58, 62, 74);
      const hotspot   = (base as d3.RGBColor).brighter(1.2).formatRgb();
      const mid       = n.color;
      const shadow    = (base as d3.RGBColor).darker(0.8).formatRgb();
      const edge      = (base as d3.RGBColor).darker(1.8).formatRgb();

      const existing = defs.select(`#fill-${n.id}`);
      if (existing.empty()) {
        const fg = defs.append("radialGradient")
          .attr("id", `fill-${n.id}`)
          .attr("cx", "35%").attr("cy", "30%").attr("r", "72%");
        fg.append("stop").attr("offset",  "0%").attr("stop-color", hotspot);
        fg.append("stop").attr("offset", "30%").attr("stop-color", mid);
        fg.append("stop").attr("offset", "70%").attr("stop-color", shadow);
        fg.append("stop").attr("offset","100%").attr("stop-color", edge);
      } else {
        const stops = existing.selectAll("stop");
        stops.filter((_d: unknown, i: number) => i === 0).attr("stop-color", hotspot);
        stops.filter((_d: unknown, i: number) => i === 1).attr("stop-color", mid);
        stops.filter((_d: unknown, i: number) => i === 2).attr("stop-color", shadow);
        stops.filter((_d: unknown, i: number) => i === 3).attr("stop-color", edge);
      }
    });

    // ── Helper: apply all visual attrs for a <g> selection (enter or update) ─
    const DUR = 600;

    const applyBubbleAttrs = (
      sel: d3.Selection<SVGGElement, BubbleNode, any, any>,
      animated: boolean,
    ) => {
      sel.style("cursor", "pointer")
         .style("filter", d => bubbleGlowFilter(d.delta, maxAbsDelta));

      const t = animated ? (s: any) => s.transition().duration(DUR).ease(d3.easeCubicOut) : (s: any) => s;

      // Ring
      t(sel.select(".ring"))
        .attr("r",  (d: BubbleNode) => d.radius + 2.5)
        .attr("stroke", (d: BubbleNode) => d.borderColor);
      // Body
      t(sel.select(".body"))
        .attr("r",    (d: BubbleNode) => d.radius)
        .attr("fill", (d: BubbleNode) => `url(#fill-${d.id})`);
      // Shine, vignette, glass
      t(sel.select(".shine")).attr("r", (d: BubbleNode) => d.radius);
      t(sel.select(".vignette")).attr("r", (d: BubbleNode) => d.radius);
      t(sel.select(".glass-outer")).attr("r", (d: BubbleNode) => d.radius);
      t(sel.select(".glass")).attr("r", (d: BubbleNode) => d.radius * 0.92)
        .attr("stroke-dasharray", (d: BubbleNode) => {
          const circ = 2 * Math.PI * d.radius * 0.92;
          return `${circ * 0.38} ${circ * 0.62}`;
        })
        .attr("stroke-dashoffset", (d: BubbleNode) => {
          const circ = 2 * Math.PI * d.radius * 0.92;
          return `${circ * 0.82}`;
        });

      // ── Adaptive text: font-size scales, opacity fades smoothly ─────────
      // Helper for text elements: applies attrs either directly or via transition
      const applyText = (
        textSel: d3.Selection<any, BubbleNode, any, any>,
        attrs: Record<string, (d: BubbleNode) => string>,
      ) => {
        if (animated) {
          const tr = textSel.transition().duration(DUR);
          for (const [k, fn] of Object.entries(attrs)) {
            if (k.startsWith("s:")) tr.style(k.slice(2), fn as any);
            else tr.attr(k, fn as any);
          }
        } else {
          for (const [k, fn] of Object.entries(attrs)) {
            if (k.startsWith("s:")) textSel.style(k.slice(2), fn as any);
            else textSel.attr(k, fn as any);
          }
        }
      };

      // % change (top line) — soft white, secondary to the ticker
      const topSel = sel.select<SVGTextElement>(".label-top");
      applyText(topSel, {
        "fill":       () => "rgba(220,225,230,0.70)",
        "s:font-size":(d: BubbleNode) => `${subFS(d.radius)}px`,
        "s:opacity":  (d: BubbleNode) => String(subOp(d.radius)),
        "y":          (d: BubbleNode) => String(d.radius >= 30 ? -lineGap(d.radius) : 0),
      });
      topSel.text((d: BubbleNode) =>
        `${d.priceChange >= 0 ? "▲" : "▼"} ${Math.abs(d.priceChange).toFixed(2)}%`);

      // Ticker (center)
      const tkSel = sel.select<SVGTextElement>(".label-ticker");
      applyText(tkSel, {
        "s:font-size":(d: BubbleNode) => `${tickerFS(d.radius)}px`,
        "s:opacity":  (d: BubbleNode) => String(tickerOp(d.radius)),
        "y":          (d: BubbleNode) => String(d.radius >= 30 ? -subFS(d.radius) * 0.35 : 0),
      });

      // Volume (bottom line)
      const vlSel = sel.select<SVGTextElement>(".label-vol");
      applyText(vlSel, {
        "s:font-size":(d: BubbleNode) => `${subFS(d.radius)}px`,
        "s:opacity":  (d: BubbleNode) => String(volOp(d.radius)),
        "y":          (d: BubbleNode) =>
          String(d.radius >= 30 ? lineGap(d.radius) - subFS(d.radius) * 0.5 : 0),
      });
      vlSel.text((d: BubbleNode) => `v/${fmtVol(d.volume)}`);
    };

    // Helper: create the full set of child elements inside a <g>
    const createBubbleChildren = (enterSel: d3.Selection<SVGGElement, BubbleNode, any, any>) => {
      enterSel.append("circle").attr("class", "ring")
        .attr("fill", "none").attr("stroke-width", 2.8).attr("opacity", 0.92);
      enterSel.append("circle").attr("class", "body").attr("opacity", 0.97);
      enterSel.append("circle").attr("class", "shine")
        .attr("fill", "url(#shine-shared)").attr("pointer-events", "none");
      enterSel.append("circle").attr("class", "vignette")
        .attr("fill", "url(#vignette-shared)").attr("pointer-events", "none");
      enterSel.append("circle").attr("class", "glass-outer")
        .attr("fill", "none").attr("stroke", "rgba(255,255,255,0.04)")
        .attr("stroke-width", 1.0).attr("pointer-events", "none");
      enterSel.append("circle").attr("class", "glass")
        .attr("fill", "none").attr("stroke", "rgba(255,255,255,0.06)")
        .attr("stroke-width", 0.5).attr("pointer-events", "none");
      // Text labels
      enterSel.append("text").attr("class", "label-top")
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .attr("font-family", FONT).attr("font-weight", "500")
        .style("pointer-events", "none");
      enterSel.append("text").attr("class", "label-ticker")
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .attr("fill", "#ffffff").attr("font-family", FONT)
        .attr("font-weight", "800").style("letter-spacing", "0.04em")
        .style("text-transform", "uppercase").style("pointer-events", "none");
      enterSel.append("text").attr("class", "label-vol")
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .attr("fill", "rgba(200,210,220,0.60)").attr("font-family", FONT)
        .attr("font-weight", "400").style("pointer-events", "none");
      // Set ticker text (doesn't change across timeframes)
      enterSel.select(".label-ticker").text((d: BubbleNode) => d.id);
    };

    // ── D3 data join: enter / update / exit ──────────────────────────────
    const join = svg.selectAll<SVGGElement, BubbleNode>("g.bubble")
      .data(nodes, d => d.id);

    // EXIT: bubbles that no longer exist — shrink + fade out, then remove
    join.exit<BubbleNode>()
      .transition().duration(DUR).ease(d3.easeCubicIn)
      .style("opacity", "0")
      .each(function () {
        d3.select(this).selectAll("circle")
          .transition().duration(DUR).attr("r", 0);
      })
      .remove();

    // ENTER: new bubbles — start at radius 0, fully transparent
    const enter = join.enter()
      .append("g").attr("class", "bubble").style("opacity", "0");
    createBubbleChildren(enter);
    applyBubbleAttrs(enter, false); // set initial values at 0 before animating
    // Start circles at r=0 for grow-in animation
    enter.selectAll("circle").attr("r", 0);
    enter.selectAll("text").style("opacity", "0");
    // Animate in
    enter.transition().duration(DUR).ease(d3.easeCubicOut).style("opacity", "1");
    // After the group is visible, grow circles to final size
    setTimeout(() => applyBubbleAttrs(enter, true), 20);

    // UPDATE: existing bubbles — smoothly morph to new radius/color
    const update = join;
    applyBubbleAttrs(update, true);
    // Also refresh ticker text in case symbol set changed
    update.select(".label-ticker").text((d: BubbleNode) => d.id);

    // Merged selection for hover binding + simulation tick
    const merged = enter.merge(join);

    // ── Hover / click ─────────────────────────────────────────────────────
    const hoverGlow = (d: BubbleNode) =>
      d.delta >= 0
        ? "drop-shadow(0 0 6px rgba(76,175,80,0.80)) drop-shadow(0 0 16px rgba(76,175,80,0.30))"
        : "drop-shadow(0 0 6px rgba(244,67,54,0.80)) drop-shadow(0 0 16px rgba(244,67,54,0.30))";

    const expandAll = (sel: d3.Selection<SVGGElement, BubbleNode, any, any>,
                       d: BubbleNode, scale: number, dur: number) => {
      const r = d.radius * scale;
      sel.select(".body")       .transition().duration(dur).attr("r", r);
      sel.select(".ring")       .transition().duration(dur).attr("r", r + 2.5);
      sel.select(".shine")      .transition().duration(dur).attr("r", r);
      sel.select(".glass")      .transition().duration(dur).attr("r", r * 0.92);
      sel.select(".glass-outer").transition().duration(dur).attr("r", r);
      sel.select(".vignette")   .transition().duration(dur).attr("r", r);
    };

    merged.on("mouseenter", function (event, d) {
        d3.select(this).transition().duration(100).style("filter", hoverGlow(d));
        d3.select(this).select(".ring").transition().duration(100).attr("opacity", 1);
        expandAll(d3.select(this), d, 1.09, 100);
        setTooltip({ visible: true, x: event.clientX, y: event.clientY, node: d });
      })
      .on("mousemove", (event) => {
        setTooltip(prev => ({ ...prev, x: event.clientX, y: event.clientY }));
      })
      .on("mouseleave", function (_event, d) {
        d3.select(this).transition().duration(180)
          .style("filter", bubbleGlowFilter(d.delta, maxAbsDelta));
        d3.select(this).select(".ring").transition().duration(180).attr("opacity", 0.80);
        expandAll(d3.select(this), d, 1.0, 180);
        setTooltip(prev => ({ ...prev, visible: false }));
      })
      .on("click", (_event, d) => {
        window.open(`https://www.binance.com/en/trade/${d.id}_USDT`, "_blank");
      });

    // ── Force simulation — elastic bounce + fluid motion + gravity ──────
    const cx = dims.w / 2;
    const cy = dims.h / 2 - 20;

    const brownianForce = () => {
      const jitterStrength = 0.15;
      const force: d3.Force<BubbleNode, undefined> & { initialize?: (n: BubbleNode[]) => void } = () => {
        nodes.forEach(n => {
          n.vx = (n.vx ?? 0) + (Math.random() - 0.5) * jitterStrength;
          n.vy = (n.vy ?? 0) + (Math.random() - 0.5) * jitterStrength;
        });
      };
      force.initialize = () => {};
      return force as d3.Force<BubbleNode, undefined>;
    };

    // Stop any previous simulation before creating a new one
    simRef.current?.stop();

    const sim = d3.forceSimulation<BubbleNode>(nodes)
      .force("radial",   d3.forceRadial<BubbleNode>(0, cx, cy).strength(0.035))
      .force("center",   d3.forceCenter(cx, cy).strength(0.02))
      .force("charge",   d3.forceManyBody<BubbleNode>().strength(-4))
      .force("collide",  d3.forceCollide<BubbleNode>(d => d.radius + 3)
                            .strength(0.78).iterations(4))
      .force("brownian", brownianForce())
      .alphaDecay(0.005)
      .alphaMin(0.008)
      .velocityDecay(0.18)
      .on("tick", () => {
        merged.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

    simRef.current = sim;
  }, [dims.w, dims.h]);

  // ── WebSocket real-time updates ──────────────────────────────────────────────
  const connectWS = useCallback((maxAbs: number, rScale: (v: number) => number) => {
    wsRef.current?.close();
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen  = () => setWsLive(true);
    ws.onclose = () => setWsLive(false);
    ws.onerror = () => setWsLive(false);

    ws.onmessage = (ev) => {
      try {
        const tickers: any[] = JSON.parse(ev.data);
        if (!Array.isArray(tickers)) return;

        const lookup  = new Map(nodesRef.current.map(n => [n.fullId, n]));
        // Track which nodes had a volume spike for pulse animation
        const spiked: string[] = [];
        let changed = false;

        tickers.forEach(t => {
          const node = lookup.get(t.s);
          if (!node) return;
          const c = parseFloat(t.c), o = parseFloat(t.o), q = parseFloat(t.q);
          const prevRadius     = node.radius;
          node.priceChange     = o > 0 ? (c - o) / o * 100 : 0;
          node.volume          = q;
          node.delta           = q * node.priceChange / 100;
          node.price           = c;
          node.radius          = rScale(q);
          node.color           = bubbleColor(node.delta, maxAbs);
          node.borderColor     = bubbleBorderColor(node.delta, maxAbs);
          // Volume spike: radius grew > 18% — trigger pulse animation
          if (node.radius > prevRadius * 1.18 && node.radius > prevRadius + 4) {
            spiked.push(node.id);
          }
          changed = true;
        });

        if (!changed || !svgRef.current) return;

        // Batch DOM updates every 800 ms to prevent thrashing
        clearTimeout(batchTimer.current);
        batchTimer.current = setTimeout(() => {
          if (!svgRef.current) return;
          const svg       = d3.select(svgRef.current);
          const newMaxAbs = d3.max(nodesRef.current.map(n => Math.abs(n.delta))) ?? 1;
          const subFS     = (r: number) => Math.max(7, Math.min(r * 0.26, 14));
          const tickerFS  = (r: number) => Math.max(9, Math.min(r * 0.40, 26));
          const lineGap   = (r: number) => tickerFS(r) * 1.15 + subFS(r) * 0.5;

          nodesRef.current.forEach(node => {
            const grp      = svg.selectAll<SVGGElement, BubbleNode>("g.bubble")
              .filter(d => d.id === node.id);
            const isSpiked = spiked.includes(node.id);

            // Update 4-stop fill gradient
            const baseCol = d3.color(node.color);
            if (baseCol) {
              const hotspot   = (baseCol as d3.RGBColor).brighter(1.2).formatRgb();
              const shadow    = (baseCol as d3.RGBColor).darker(0.8).formatRgb();
              const edge      = (baseCol as d3.RGBColor).darker(1.8).formatRgb();
              const stops     = svg.selectAll(`#fill-${node.id} stop`);
              stops.filter((_d: unknown, i: number) => i === 0).attr("stop-color", hotspot);
              stops.filter((_d: unknown, i: number) => i === 1).attr("stop-color", node.color);
              stops.filter((_d: unknown, i: number) => i === 2).attr("stop-color", shadow);
              stops.filter((_d: unknown, i: number) => i === 3).attr("stop-color", edge);
            }

            // Update stroke colors
            grp.select(".body").attr("stroke", node.borderColor);
            grp.select(".ring").attr("stroke", node.borderColor);

            // Update glow
            grp.style("filter", bubbleGlowFilter(node.delta, newMaxAbs));

            // Update text labels — adaptive opacity + font size
            grp.select(".label-top")
              .attr("fill", "rgba(220,225,230,0.70)")
              .style("font-size", `${subFS(node.radius)}px`)
              .style("opacity", String(subOp(node.radius)))
              .attr("y", node.radius >= 30 ? -lineGap(node.radius) : 0)
              .text(`${node.priceChange >= 0 ? "▲" : "▼"} ${Math.abs(node.priceChange).toFixed(2)}%`);

            grp.select(".label-ticker")
              .style("font-size", `${tickerFS(node.radius)}px`)
              .style("opacity", String(tickerOp(node.radius)))
              .attr("y", node.radius >= 30 ? -subFS(node.radius) * 0.35 : 0);

            grp.select(".label-vol")
              .style("font-size", `${subFS(node.radius)}px`)
              .style("opacity", String(volOp(node.radius)))
              .attr("y", node.radius >= 30 ? lineGap(node.radius) - subFS(node.radius) * 0.5 : 0)
              .text(`v/${fmtVol(node.volume)}`);

            // ── Volume spike animation ─────────────────────────────────────
            if (isSpiked) {
              const peak = node.radius * 1.32;
              grp.select(".body")
                .transition().duration(200).ease(d3.easeQuadOut).attr("r", peak)
                .transition().duration(420).ease(d3.easeBounceOut).attr("r", node.radius);
              grp.select(".ring")
                .transition().duration(200).attr("r", peak + 2.5).attr("opacity", 1)
                .transition().duration(420).attr("r", node.radius + 2.5).attr("opacity", 0.80);
              grp.select(".shine")
                .transition().duration(200).attr("r", peak)
                .transition().duration(420).attr("r", node.radius);
              grp.select(".glass")
                .transition().duration(200).attr("r", peak * 0.92)
                .transition().duration(420).attr("r", node.radius * 0.92);
              grp.select(".glass-outer")
                .transition().duration(200).attr("r", peak)
                .transition().duration(420).attr("r", node.radius);
              grp.select(".vignette")
                .transition().duration(200).attr("r", peak)
                .transition().duration(420).attr("r", node.radius);
            } else {
              grp.select(".body").attr("r", node.radius);
              grp.select(".ring").attr("r", node.radius + 2.5);
              grp.select(".shine").attr("r", node.radius);
              grp.select(".glass").attr("r", node.radius * 0.92);
              grp.select(".glass-outer").attr("r", node.radius);
              grp.select(".vignette").attr("r", node.radius);
            }
          });

          // Re-apply collide with updated radii + give a visible energy kick
          // so the newly-resized bubbles bounce apart elastically
          simRef.current?.force("collide",
            d3.forceCollide<BubbleNode>(d => d.radius + 3).strength(0.78).iterations(4)
          );
          simRef.current?.alpha(0.25).restart();
        }, 800);
      } catch { /* ignore */ }
    };
  }, []);

  // ── Main fetch + init effect ────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !svgRef.current || dims.w === 0) return;

    // Only show full loading spinner on first open (no existing bubbles).
    // When switching timeframes, existing bubbles morph smoothly in-place.
    const hasExistingBubbles = nodesRef.current.length > 0;
    if (!hasExistingBubbles) setLoading(true);
    setError("");
    setTooltip({ visible: false, x: 0, y: 0, node: null });

    const controller = new AbortController();

    (async () => {
      try {
        let nodes: BubbleNode[];
        if (timeframe === "24H") {
          nodes = await fetch24H();
        } else {
          nodes = await fetchKlines(timeframe === "1H" ? "1h" : "4h");
        }

        if (controller.signal.aborted) return;

        // Apply sort
        if (sortMode === "change") {
          nodes.sort((a, b) => Math.abs(b.priceChange) - Math.abs(a.priceChange));
        }

        nodesRef.current = nodes;
        setNodeCount(nodes.length);
        initD3(nodes);
        setLoading(false);

        const volumes  = nodes.map(n => n.volume);
        const rScale   = makeRadiusScale(volumes);
        const allDeltas = nodes.map(n => Math.abs(n.delta));
        const maxAbs   = d3.max(allDeltas) ?? 1;
        connectWS(maxAbs, v => rScale(v));
      } catch (e) {
        if (!controller.signal.aborted) {
          setError("Could not reach Binance API. Check your internet connection.");
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
      simRef.current?.stop();
      wsRef.current?.close();
      clearTimeout(batchTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, timeframe, sortMode, dims.w, dims.h]);

  // ── Search filter: fade non-matching bubbles ────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const q = search.toLowerCase().trim();
    d3.select(svgRef.current)
      .selectAll<SVGGElement, BubbleNode>("g.bubble")
      .transition().duration(200)
      .style("opacity", d => (!q || d.id.toLowerCase().includes(q)) ? 1 : 0.1);
  }, [search]);

  // ── Tooltip positioning ─────────────────────────────────────────────────────
  const TT_W = 210;
  const ttLeft = tooltip.x + 14 + TT_W > window.innerWidth ? tooltip.x - TT_W - 10 : tooltip.x + 14;
  const ttTop  = Math.min(tooltip.y - 10, window.innerHeight - 220);

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Left-edge trigger button (below the "Chart" indicators button) ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed left-0 z-[200] flex flex-col items-center justify-center gap-1.5 transition-all duration-200"
        title="Bubble Chart – Binance flow map"
        style={{
          top: "63%",
          transform: "translateY(-50%)",
          width: 28,
          paddingTop: 14,
          paddingBottom: 14,
          borderRadius: "0 10px 10px 0",
          background: open
            ? "linear-gradient(180deg,#e6007a 0%,#b3005f 100%)"
            : "linear-gradient(180deg,#1a1d2e 0%,#141625 100%)",
          border: "1px solid",
          borderLeft: "none",
          borderColor: open ? "#e6007a" : "#363a59",
          boxShadow: open ? "2px 0 16px rgba(230,0,122,0.4)" : "2px 0 8px rgba(0,0,0,0.4)",
        }}
      >
        {/* Bubble icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="5" fill={open ? "#fff" : "#e6007a"} opacity="0.9" />
          <circle cx="5"  cy="7"  r="3" fill={open ? "#fce7f3" : "#7c3aed"} opacity="0.7" />
          <circle cx="19" cy="7"  r="2" fill={open ? "#fce7f3" : "#22d3ee"} opacity="0.7" />
          <circle cx="5"  cy="17" r="2" fill={open ? "#fce7f3" : "#4ade80"} opacity="0.7" />
          <circle cx="19" cy="17" r="3" fill={open ? "#fce7f3" : "#f97316"} opacity="0.7" />
        </svg>
        <span
          className="select-none font-semibold"
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: 8,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: open ? "#fce7f3" : "#475569",
          }}
        >
          Bubble
        </span>
      </button>

      {/* ── Full-screen overlay ─────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-[170] overflow-hidden"
          style={{ background: BG_COL }}
        >
          {/* Subtle vignette — darker edges for focus */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 80% 70% at 50% 50%, transparent 0%, rgba(0,0,0,0.25) 100%)",
            }}
          />

          {/* ── Header bar ─────────────────────────────────────────────────── */}
          <div
            className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-2.5 gap-3"
            style={{
              background: "linear-gradient(180deg,rgba(30,37,48,0.96) 0%,rgba(30,37,48,0.60) 65%,transparent 100%)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Title */}
            <div className="flex items-center gap-2.5 shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="5" fill="#e6007a"/>
                <circle cx="5"  cy="7"  r="3" fill="#7c3aed"/>
                <circle cx="19" cy="7"  r="2" fill="#22d3ee"/>
                <circle cx="5"  cy="17" r="2" fill="#4ade80"/>
                <circle cx="19" cy="17" r="3" fill="#f97316"/>
              </svg>
              <div>
                <h1 className="text-white font-bold text-sm tracking-wide leading-none">
                  Binance Bubble Chart
                </h1>
                <p className="text-[9px] mt-0.5" style={{ color: "rgba(200,210,220,0.50)" }}>
                  {nodeCount} pairs · Size = Volume · <span style={{color:"#4CAF50"}}>Green</span> = Buy · <span style={{color:"#F44336"}}>Red</span> = Sell · Grey = Balanced
                  {wsLive && <span className="ml-1.5" style={{ color: "#4CAF50" }}>● LIVE</span>}
                  {!wsLive && <span className="ml-1.5" style={{ color: "rgba(200,210,220,0.35)" }}>○ connecting…</span>}
                </p>
              </div>
            </div>

            {/* Controls group */}
            <div className="flex items-center gap-2 flex-wrap">

              {/* Timeframe buttons */}
              <div className="flex items-center gap-1 rounded-lg border border-[#2d3340] p-0.5">
                {(["1H", "4H", "24H"] as Timeframe[]).map(tf => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className="px-2.5 py-1 rounded-md text-[10px] font-bold transition"
                    style={{
                      background: timeframe === tf ? "#e6007a" : "transparent",
                      color: timeframe === tf ? "#fff" : "#6B7280",
                    }}
                  >
                    {tf}
                  </button>
                ))}
              </div>

              {/* Sort buttons */}
              <div className="flex items-center gap-1 rounded-lg border border-[#2d3340] p-0.5">
                {(["volume", "change"] as SortMode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setSortMode(m)}
                    className="px-2.5 py-1 rounded-md text-[10px] font-semibold capitalize transition"
                    style={{
                      background: sortMode === m ? "#3d51ff" : "transparent",
                      color: sortMode === m ? "#fff" : "#6B7280",
                    }}
                  >
                    {m === "volume" ? "Volume" : "% Change"}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search BTC…"
                  className="h-7 rounded-lg border border-[#2d3340] bg-[#161b24] px-2.5 pr-7 text-[10px] text-white placeholder-slate-600 outline-none focus:border-[#4CAF50] transition"
                  style={{ width: 110 }}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition"
                  >
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M1 1l8 8M9 1L1 9"/>
                    </svg>
                  </button>
                )}
              </div>

              {/* Semantic color legend */}
              <div className="hidden md:flex items-center gap-3.5 text-[9px]" style={{ color: "#667788" }}>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{
                    background: "#4CAF50",
                    boxShadow: "0 0 4px rgba(76,175,80,0.35)",
                  }}/>
                  <span style={{ color: "#4CAF50" }}>Buy Flow</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{
                    background: "#3A3E4A",
                  }}/>
                  <span style={{ color: "rgba(200,210,220,0.55)" }}>Balanced</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{
                    background: "#F44336",
                    boxShadow: "0 0 4px rgba(244,67,54,0.35)",
                  }}/>
                  <span style={{ color: "#F44336" }}>Sell Flow</span>
                </div>
              </div>

              {/* Binance link */}
              <a
                href="https://www.binance.com/en/markets/overview"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden lg:flex items-center gap-1 text-[9px] text-slate-600 hover:text-slate-400 transition"
              >
                Binance Markets ↗
              </a>

              {/* Close */}
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#2d3340] text-slate-500 hover:text-white hover:bg-white/10 transition"
                title="Close (Esc)"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M1 1l12 12M13 1L1 13"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── Loading overlay ─────────────────────────────────────────────── */}
          {loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4">
              <div className="h-14 w-14 rounded-full border-4 animate-spin"
                style={{ borderColor: "rgba(76,175,80,0.15)", borderTopColor: "#4CAF50",
                  boxShadow: "0 0 14px rgba(76,175,80,0.25)" }} />
              <p className="text-sm" style={{ color: "#81C784" }}>
                {timeframe !== "24H" ? `Fetching ${timeframe} klines for top 60 pairs…` : "Fetching Binance 24H data…"}
              </p>
            </div>
          )}

          {/* ── Error state ─────────────────────────────────────────────────── */}
          {error && !loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef5350" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="#ef5350"/>
              </svg>
              <p className="text-slate-400 text-sm">{error}</p>
              <button
                onClick={() => { setError(""); setLoading(true); setOpen(false); setTimeout(() => setOpen(true), 100); }}
                className="px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold transition"
              >
                Retry
              </button>
            </div>
          )}

          {/* ── SVG canvas ──────────────────────────────────────────────────── */}
          <svg
            ref={svgRef}
            width={dims.w}
            height={dims.h}
            className="absolute inset-0"
            style={{ opacity: loading ? 0 : 1, transition: "opacity 0.4s" }}
          />

          {/* ── Tooltip ─────────────────────────────────────────────────────── */}
          {tooltip.visible && tooltip.node && (() => {
            const n       = tooltip.node;
            const isBull  = n.delta >= 0;
            const accentC = isBull ? "#4CAF50" : "#F44336";
            const accentS = isBull ? "rgba(76,175,80,0.15)" : "rgba(244,67,54,0.15)";
            return (
              <div
                className="pointer-events-none fixed z-30 rounded-xl px-3.5 py-3 backdrop-blur-md"
                style={{
                  left:   ttLeft,
                  top:    ttTop,
                  width:  TT_W,
                  background: "rgba(22,26,34,0.95)",
                  border: `1px solid ${accentC}30`,
                  boxShadow: `0 0 0 1px ${accentC}18, 0 12px 36px rgba(0,0,0,0.70), 0 0 18px ${accentC}10`,
                }}
              >
                {/* Accent top bar */}
                <div className="absolute top-0 left-4 right-4 h-[1.5px] rounded-full"
                  style={{ background: `linear-gradient(90deg,transparent,${accentC},transparent)` }} />

                {/* Header row */}
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full shrink-0"
                      style={{ background: accentC, boxShadow: `0 0 10px ${accentC}` }} />
                    <p className="text-white font-bold text-sm tracking-wide"
                      style={{ fontFamily: "'Inter',sans-serif" }}>
                      {n.id}
                      <span className="font-normal text-xs" style={{ color: "#6B7280" }}>/USDT</span>
                    </p>
                  </div>
                  <span className="text-xs font-bold rounded-md px-1.5 py-0.5"
                    style={{ color: accentC, background: accentS }}>
                    {n.priceChange >= 0 ? "▲" : "▼"} {Math.abs(n.priceChange).toFixed(2)}%
                  </span>
                </div>

                {/* Divider */}
                <div className="h-px mb-2" style={{ background: `${accentC}18` }} />

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]"
                  style={{ fontFamily: "'Inter',sans-serif" }}>
                  <div>
                    <p style={{ color: "#6B7280" }}>Price</p>
                    <p className="text-white font-semibold font-mono">
                      ${n.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "#6B7280" }}>{timeframe} Volume</p>
                    <p className="text-white font-semibold font-mono">{fmtVol(n.volume)}</p>
                  </div>
                  <div>
                    <p style={{ color: "#6B7280" }}>Net Flow (Δ)</p>
                    <p className="font-semibold font-mono" style={{ color: accentC }}>
                      {n.delta >= 0 ? "+" : ""}{fmtVol(Math.abs(n.delta))}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "#6B7280" }}>Flow</p>
                    <p className="font-bold" style={{ color: accentC }}>
                      {Math.abs(n.priceChange) < 0.5 ? "Balanced" : isBull ? "Buy Dominant" : "Sell Dominant"}
                    </p>
                  </div>
                </div>

                <p className="text-center mt-2.5" style={{ fontSize: 9, color: "rgba(107,114,128,0.50)" }}>
                  Click to trade on Binance ↗
                </p>
              </div>
            );
          })()}

          {/* Bottom hint */}
          <div
            className="absolute bottom-3 left-1/2 text-[8px] text-center select-none"
            style={{ transform: "translateX(-50%)", color: "rgba(200,210,220,0.22)", letterSpacing: "0.06em" }}
          >
            Size = {timeframe} volume &nbsp;·&nbsp; <span style={{color:"rgba(76,175,80,0.45)"}}>Green</span> = Buy dominant &nbsp;·&nbsp; <span style={{color:"rgba(244,67,54,0.45)"}}>Red</span> = Sell dominant &nbsp;·&nbsp; <span style={{color:"rgba(200,210,220,0.30)"}}>Grey</span> = Balanced &nbsp;·&nbsp; Click to trade
          </div>
        </div>
      )}
    </>
  );
}
