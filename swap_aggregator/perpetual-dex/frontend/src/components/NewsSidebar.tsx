/**
 * NewsSidebar – fixed right-side panel with three sections:
 *  1. Press  – CoinDesk & CoinTelegraph RSS (via CORS proxy)
 *  2. X / Twitter – curated KOL posts (live data requires Twitter API v2)
 *  3. YouTube – trending crypto channel videos via public YouTube RSS feeds
 *
 * Hover → summary tooltip   Click expand → full popup modal
 */

import { useEffect, useRef, useState, useCallback } from "react";

import { getAlloriginsGetProxyPrefix } from "@/lib/alloriginsUrl";

// ─── Types ────────────────────────────────────────────────────────────────────
interface NewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  sourceColor: string;
}

interface XPost {
  id: string;
  author: string;
  handle: string;
  content: string;
  likes: string;
  retweets: string;
  time: string;
  avatarColor: string;
  avatarUrl?: string;
  tweetUrl: string;
}

interface YTVideo {
  id: string;
  title: string;
  channel: string;
  channelColor: string;
  videoId: string;
  publishedAt: string;
  thumbnail: string;
}

// ─── CORS proxy + RSS feeds ───────────────────────────────────────────────────
const PROXY = getAlloriginsGetProxyPrefix();

const RSS_SOURCES = [
  {
    name: "CoinDesk",
    color: "#f97316",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
  },
  {
    name: "CoinTelegraph",
    color: "#38bdf8",
    url: "https://cointelegraph.com/rss",
  },
];

// YouTube public channel RSS (no API key needed)
const YT_CHANNELS = [
  { name: "Coin Bureau",    color: "#a78bfa", id: "UCqK_GSMbpiV8spgD3ZGloSw" },
  { name: "CoinDesk TV",   color: "#f97316", id: "UCvShE4m_MzRnsDByvge23tQ" },
  { name: "Cointelegraph", color: "#38bdf8", id: "UCkF9kQYyXr1VdUGf4K3PKNA" },
  { name: "Benjamin Cowen",color: "#34d399", id: "UCRvqjQPSeaWn-uEx-w0XOIg" },
  // Hedera ecosystem channels
  { name: "Hedera", color: "#6ee7b7", handle: "@HederaHashgraph" },
  { name: "HBAR Foundation", color: "#22d3ee", handle: "@HBARFoundation" },
  { name: "Hashgraph", color: "#34d399", handle: "@hashgraph" },
];

// ─── Fallback sample data (shown if RSS fails) ────────────────────────────────
const SAMPLE_NEWS: NewsItem[] = [
  { id: "s1", source: "CoinDesk", sourceColor: "#f97316", pubDate: "Just now",
    title: "Bitcoin above $71,000, ETH, SOL zoom higher as crypto shrugs off stock weakness",
    description: "Majors posted modest gains Friday with BTC hovering near the top of its month-long range even as equities struggle under rising energy prices and geopolitical stress.",
    link: "https://www.coindesk.com" },
  { id: "s2", source: "CoinDesk", sourceColor: "#f97316", pubDate: "1h ago",
    title: "BlackRock's new Ether ETF for yield-hungry investors debuts with $15M trading volume",
    description: "The new ETHB fund launched with over $100 million in assets and traded more than $15 million on day one, offering investors exposure to ethereum plus staking rewards.",
    link: "https://www.coindesk.com" },
  { id: "s3", source: "CoinTelegraph", sourceColor: "#38bdf8", pubDate: "2h ago",
    title: "XRP jumps 3% as breakout above $1.39 ends early-2026 downtrend",
    description: "Volume surged more than 300% during the move, per CoinDesk analytics data, with traders watching whether the token can hold the former resistance as support.",
    link: "https://cointelegraph.com" },
  { id: "s4", source: "CoinTelegraph", sourceColor: "#38bdf8", pubDate: "3h ago",
    title: "Pi rallies more than 30% after Kraken announces listing",
    description: "Bybit previously declined to list the mobile crypto mining platform, with CEO Ben Zhou citing warnings from Chinese police that the project is a scam.",
    link: "https://cointelegraph.com" },
  { id: "s5", source: "CoinDesk", sourceColor: "#f97316", pubDate: "4h ago",
    title: "SEC's advisory group backs tokenized securities push",
    description: "The committee that steers the U.S. securities regulator on investor issues voted to support a new effort to regulate stock transactions on blockchains.",
    link: "https://www.coindesk.com" },
];

const X_HANDLES = [
  // ── KOLs / Founders ──
  { handle: "@VitalikButerin", avatarColor: "#8b5cf6" },
  { handle: "@cz_binance", avatarColor: "#f59e0b" },
  { handle: "@aeyakovenko", avatarColor: "#14b8a6" },
  { handle: "@IOHK_Charles", avatarColor: "#6366f1" },
  { handle: "@saylor", avatarColor: "#f97316" },
  { handle: "@haydenzadams", avatarColor: "#e879f9" },
  // ── Foundation / Protocol official accounts ──
  { handle: "@Polkadot", avatarColor: "#e6007a" },
  { handle: "@solana", avatarColor: "#9945ff" },
  { handle: "@ethereum", avatarColor: "#627eea" },
  { handle: "@Aptos", avatarColor: "#2dd4bf" },
  { handle: "@BNBCHAIN", avatarColor: "#f0b90b" },
  { handle: "@nearprotocol", avatarColor: "#00ec97" },
  { handle: "@SuiNetwork", avatarColor: "#4da2ff" },
  { handle: "@cosmos", avatarColor: "#6f7390" },
  { handle: "@arbitrum", avatarColor: "#28a0f0" },
  { handle: "@Optimism", avatarColor: "#ff0420" },
  // ── Hedera ecosystem (requested) ──
  { handle: "@hedera", avatarColor: "#6ee7b7" },
  { handle: "@HBAR_foundation", avatarColor: "#22d3ee" },
  { handle: "@hashgraph", avatarColor: "#34d399" },
  { handle: "@leemonbaird", avatarColor: "#818cf8" },
  { handle: "@manceharmon", avatarColor: "#fda4af" },
];

const SAMPLE_X: XPost[] = [
  { id: "x1", author: "Vitalik Buterin", handle: "@VitalikButerin", avatarColor: "#8b5cf6",
    avatarUrl: "https://unavatar.io/twitter/VitalikButerin",
    tweetUrl: "https://twitter.com/VitalikButerin",
    content: "Ethereum should be used as a simple digital bulletin board. Stop forcing blockchain into every problem and start treating it as a reliable, shared memory for the digital world. The goal is maximal simplicity and maximum reliability.",
    likes: "12.4K", retweets: "3.2K", time: "2h" },
  { id: "x2", author: "CZ 🔶 Binance", handle: "@cz_binance", avatarColor: "#f59e0b",
    avatarUrl: "https://unavatar.io/twitter/cz_binance",
    tweetUrl: "https://twitter.com/cz_binance",
    content: "Crypto is more resilient than people think. Every major drawdown has been followed by a stronger recovery. Stay #SAFU. Build. Don't panic sell. The ecosystem is fundamentally stronger than ever.",
    likes: "28.1K", retweets: "5.6K", time: "4h" },
  { id: "x3", author: "Anatoly Yakovenko", handle: "@aeyakovenko", avatarColor: "#14b8a6",
    avatarUrl: "https://unavatar.io/twitter/aeyakovenko",
    tweetUrl: "https://twitter.com/aeyakovenko",
    content: "Solana TPS just hit a new all-time record during the latest stress test. The network handled it beautifully. This is what permissionless global scale looks like. We're just getting started.",
    likes: "9.3K", retweets: "1.8K", time: "5h" },
  { id: "x4", author: "Charles Hoskinson", handle: "@IOHK_Charles", avatarColor: "#6366f1",
    avatarUrl: "https://unavatar.io/twitter/IOHK_Charles",
    tweetUrl: "https://twitter.com/IOHK_Charles",
    content: "Cardano's governance is live. On-chain voting, treasury management, and constitutional committee are now operational. This is what blockchain democracy looks like. Voltaire era has arrived.",
    likes: "7.2K", retweets: "1.4K", time: "6h" },
  { id: "x5", author: "Michael Saylor", handle: "@saylor", avatarColor: "#f97316",
    avatarUrl: "https://unavatar.io/twitter/saylor",
    tweetUrl: "https://twitter.com/saylor",
    content: "Bitcoin is the exit. Every other asset depreciates relative to hard money over a long enough time horizon. The question is not if, but how much Bitcoin you own.",
    likes: "31.5K", retweets: "7.8K", time: "8h" },
  { id: "x6", author: "Hayden Adams", handle: "@haydenzadams", avatarColor: "#e879f9",
    avatarUrl: "https://unavatar.io/twitter/haydenzadams",
    tweetUrl: "https://twitter.com/haydenzadams",
    content: "Uniswap v4 hooks are unlocking entirely new categories of AMM design. The permissive architecture means anyone can build on top of the liquidity pool. DeFi composability at its best.",
    likes: "5.1K", retweets: "1.1K", time: "10h" },
  { id: "x7", author: "Polkadot", handle: "@Polkadot", avatarColor: "#e6007a",
    avatarUrl: "https://unavatar.io/twitter/Polkadot",
    tweetUrl: "https://twitter.com/Polkadot",
    content: "Polkadot 2.0 is here. Agile Coretime, async backing, and elastic scaling are live. Build cross-chain apps with shared security and zero gas wars. The multi-chain future starts now.",
    likes: "6.8K", retweets: "2.1K", time: "3h" },
  { id: "x8", author: "Solana", handle: "@solana", avatarColor: "#9945ff",
    avatarUrl: "https://unavatar.io/twitter/solana",
    tweetUrl: "https://twitter.com/solana",
    content: "Firedancer validator client is going live on mainnet. Dual-client diversity makes Solana one of the most resilient L1s. Speed + reliability = unstoppable.",
    likes: "14.2K", retweets: "3.9K", time: "4h" },
  { id: "x9", author: "Ethereum", handle: "@ethereum", avatarColor: "#627eea",
    avatarUrl: "https://unavatar.io/twitter/ethereum",
    tweetUrl: "https://twitter.com/ethereum",
    content: "EIP-4844 blobs have reduced L2 costs by 100x. Ethereum's rollup-centric roadmap is delivering real results for users. The modular future is here.",
    likes: "18.5K", retweets: "4.7K", time: "5h" },
  { id: "x10", author: "Aptos", handle: "@Aptos", avatarColor: "#2dd4bf",
    avatarUrl: "https://unavatar.io/twitter/Aptos",
    tweetUrl: "https://twitter.com/Aptos",
    content: "Aptos just processed 30,000 TPS in the latest benchmark. Move language + Block-STM parallel execution engine is the real deal for on-chain performance.",
    likes: "4.3K", retweets: "980", time: "6h" },
  { id: "x11", author: "BNB Chain", handle: "@BNBCHAIN", avatarColor: "#f0b90b",
    avatarUrl: "https://unavatar.io/twitter/BNBCHAIN",
    tweetUrl: "https://twitter.com/BNBCHAIN",
    content: "BNB Chain opBNB processes 4,000+ TPS with sub-cent fees. Combined with Greenfield for decentralized storage, the full-stack Web3 infra is ready. Build and ship.",
    likes: "8.1K", retweets: "2.3K", time: "7h" },
  { id: "x12", author: "Arbitrum", handle: "@arbitrum", avatarColor: "#28a0f0",
    avatarUrl: "https://unavatar.io/twitter/arbitrum",
    tweetUrl: "https://twitter.com/arbitrum",
    content: "Arbitrum Stylus is live — write smart contracts in Rust, C, C++ alongside Solidity. EVM+ is the next evolution. Lower gas, faster execution, more languages.",
    likes: "7.5K", retweets: "1.9K", time: "9h" },
];

const SAMPLE_YT: YTVideo[] = [
  { id: "y1", channel: "Coin Bureau", channelColor: "#a78bfa",
    title: "Bitcoin $100K Is BACK On The Table! Here's Why...",
    videoId: "dQw4w9WgXcQ", publishedAt: "3h ago",
    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg" },
  { id: "y2", channel: "Benjamin Cowen", channelColor: "#34d399",
    title: "Crypto Market Update: Bull Run Incoming?",
    videoId: "dQw4w9WgXcQ", publishedAt: "5h ago",
    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg" },
  { id: "y3", channel: "CoinDesk TV", channelColor: "#f97316",
    title: "BlackRock's Ethereum ETF Launch Day Coverage",
    videoId: "dQw4w9WgXcQ", publishedAt: "7h ago",
    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg" },
];

// ─── RSS parser ───────────────────────────────────────────────────────────────
function getItemLink(item: Element): string {
  const linkEl = item.getElementsByTagName("link")[0];
  if (linkEl?.textContent?.trim()) return linkEl.textContent.trim();
  const guidEl = item.getElementsByTagName("guid")[0];
  if (guidEl?.textContent?.trim()) return guidEl.textContent.trim();
  return "";
}

function parseRSS(xml: string, source: string, color: string): NewsItem[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const items = Array.from(doc.querySelectorAll("item")).slice(0, 8);
    return items.map((item, i) => {
      const getText = (tag: string) => item.querySelector(tag)?.textContent?.trim() ?? "";
      const raw = getText("description").replace(/<[^>]+>/g, "").trim();
      const pub = getText("pubDate");
      return {
        id: `${source}-${i}`,
        title: getText("title"),
        description: raw.slice(0, 320) + (raw.length > 320 ? "…" : ""),
        link: getItemLink(item),
        pubDate: pub ? new Date(pub).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
        source,
        sourceColor: color,
      };
    });
  } catch {
    return [];
  }
}

// ─── YouTube RSS parser ───────────────────────────────────────────────────────
function parseYTRSS(xml: string, channel: string, color: string): YTVideo[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const entries = Array.from(doc.querySelectorAll("entry")).slice(0, 4);
    return entries.map((entry, i) => {
      const getText = (tag: string) => entry.querySelector(tag)?.textContent?.trim() ?? "";
      const videoId = getText("videoId") || entry.querySelector("id")?.textContent?.split(":").pop() || "";
      const pubRaw = getText("published");
      const pub = pubRaw ? new Date(pubRaw).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
      return {
        id: `${channel}-${i}`,
        title: getText("title"),
        channel,
        channelColor: color,
        videoId,
        publishedAt: pub,
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      };
    });
  } catch {
    return [];
  }
}

async function resolveYouTubeFeedUrl(ch: { id?: string; handle?: string }): Promise<string | null> {
  if (ch.id && ch.id.startsWith("UC")) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`;
  }
  if (!ch.handle) return null;
  try {
    const handleUrl = `https://www.youtube.com/${ch.handle}`;
    const res = await fetch(`${PROXY}${encodeURIComponent(handleUrl)}`);
    const json = await res.json();
    const html = String((json as { contents?: string }).contents ?? "");
    const m = html.match(/"channelId":"(UC[A-Za-z0-9_-]{20,})"/);
    if (!m?.[1]) return null;
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${m[1]}`;
  } catch {
    return null;
  }
}

function parseXRSS(xml: string, handle: string, color: string): XPost[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const entries = Array.from(doc.querySelectorAll("item")).slice(0, 6);
    const key = handle.replace(/^@/, "");
    return entries.map((entry, i) => {
      const getText = (tag: string) => entry.querySelector(tag)?.textContent?.trim() ?? "";
      const raw = getText("description").replace(/<[^>]+>/g, "").trim();
      const pub = getText("pubDate");
      const linkFromRSS = getItemLink(entry);
      const tweetUrl = linkFromRSS
        ? linkFromRSS.replace("nitter.net", "x.com")
        : `https://x.com/${key}`;
      return {
        id: `${key}-${i}`,
        author: key.replace(/_/g, " "),
        handle,
        content: raw.slice(0, 260) + (raw.length > 260 ? "…" : ""),
        likes: "—",
        retweets: "—",
        time: pub ? new Date(pub).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
        avatarColor: color,
        avatarUrl: `https://unavatar.io/twitter/${key}`,
        tweetUrl,
      };
    });
  } catch {
    return [];
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
type Tab = "news" | "x" | "youtube";

interface PopupItem {
  type: Tab;
  data: NewsItem | XPost | YTVideo;
}

interface TooltipState {
  rect: DOMRect;
  node: React.ReactNode;
}

export default function NewsSidebar() {
  const [open, setOpen]     = useState(false);
  const [tab, setTab]       = useState<Tab>("news");
  const [news, setNews]     = useState<NewsItem[]>(SAMPLE_NEWS);
  const [xPosts, setXPosts] = useState<XPost[]>(SAMPLE_X);
  const [videos, setVideos] = useState<YTVideo[]>(SAMPLE_YT);
  const [loading, setLoading] = useState(false);
  const [popup, setPopup]   = useState<PopupItem | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch RSS ──────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);

    // News RSS
    const newsItems: NewsItem[] = [];
    for (const src of RSS_SOURCES) {
      try {
        const res = await fetch(`${PROXY}${encodeURIComponent(src.url)}`);
        const json = await res.json();
        newsItems.push(...parseRSS(json.contents as string, src.name, src.color));
      } catch {
        /* fall through – use sample */
      }
    }
    if (newsItems.length > 0) {
      newsItems.sort((a, b) =>
        new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
      );
      setNews(newsItems);
    }

    // YouTube RSS
    const ytItems: YTVideo[] = [];
    for (const ch of YT_CHANNELS) {
      try {
        const ytUrl = await resolveYouTubeFeedUrl(ch);
        if (!ytUrl) continue;
        const res = await fetch(`${PROXY}${encodeURIComponent(ytUrl)}`);
        const json = await res.json();
        ytItems.push(...parseYTRSS(json.contents as string, ch.name, ch.color));
      } catch {
        /* fall through */
      }
    }
    if (ytItems.length > 0) setVideos(ytItems.slice(0, 12));

    // X / Twitter RSS (via Nitter)
    const xItems: XPost[] = [];
    for (const source of X_HANDLES) {
      const handleKey = source.handle.replace(/^@/, "");
      try {
        const rssUrl = `https://nitter.net/${handleKey}/rss`;
        const res = await fetch(`${PROXY}${encodeURIComponent(rssUrl)}`);
        const json = await res.json();
        xItems.push(...parseXRSS(json.contents as string, source.handle, source.avatarColor));
      } catch {
        /* fall through */
      }
    }
    if (xItems.length > 0) setXPosts(xItems.slice(0, 18));

    setLoading(false);
  }, []);

  // Fetch on mount + auto-refresh every 10 minutes (background)
  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 600_000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  // ── Close popup on Escape ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPopup(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onCardEnter(e: React.MouseEvent, node: React.ReactNode) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverTimer.current = setTimeout(() => setTooltip({ rect, node }), 220);
  }
  function onCardLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setTooltip(null);
  }

  // ─── Subcomponents ─────────────────────────────────────────────────────────
  function SourceBadge({ color, name }: { color: string; name: string }) {
    return (
      <span
        className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
        style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
      >
        {name}
      </span>
    );
  }

function XAvatar({ item, size = 28 }: { item: XPost; size?: number }) {
  const fallback = item.author[0];
  const handleKey = item.handle.replace(/^@/, "");
  const avatarSrc = item.avatarUrl ?? (handleKey ? `https://unavatar.io/twitter/${handleKey}` : undefined);
  const [showImage, setShowImage] = useState(Boolean(avatarSrc));
  return (
    <span
      className="relative flex items-center justify-center rounded-full text-[11px] font-bold text-white overflow-hidden"
      style={{
        width: size,
        height: size,
        background: item.avatarColor,
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {!showImage && <span className="relative z-10">{fallback}</span>}
      {avatarSrc && (
        <img
          src={avatarSrc}
          alt={`${item.author} avatar`}
          className={`absolute inset-0 h-full w-full object-cover ${showImage ? "opacity-100" : "opacity-0"}`}
          onError={() => setShowImage(false)}
          onLoad={() => setShowImage(true)}
        />
      )}
    </span>
  );
}

  function NewsCard({ item }: { item: NewsItem }) {
    const tooltipNode = (
      <div style={{ boxShadow: `0 0 24px ${item.sourceColor}22` }}>
        <SourceBadge color={item.sourceColor} name={item.source} />
        <p className="mt-1.5 text-[12px] text-slate-200 font-semibold leading-snug">{item.title}</p>
        <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">{item.description}</p>
        <p className="mt-2 text-[9px] text-slate-600">{item.pubDate}</p>
      </div>
    );
    return (
      <div
        className="rounded-xl border border-[#1d2142] bg-[#0d0f1e] p-3 cursor-pointer transition-all duration-150 hover:border-[#363a59]"
        onMouseEnter={(e) => onCardEnter(e, tooltipNode)}
        onMouseLeave={onCardLeave}
      >
        <div className="flex items-center justify-between mb-1.5">
          <SourceBadge color={item.sourceColor} name={item.source} />
          <span className="text-[9px] text-slate-600">{item.pubDate}</span>
        </div>
        <p className="text-[11px] text-slate-200 leading-snug line-clamp-2 font-medium">{item.title}</p>
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest transition hover:opacity-80"
          style={{ color: item.sourceColor }}
          onClick={(e) => { e.stopPropagation(); setTooltip(null); }}
        >
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3 9L9 3M9 3H5M9 3v4"/>
          </svg>
          Full Article
        </a>
      </div>
    );
  }

  function XCard({ item }: { item: XPost }) {
    const tooltipNode = (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <XAvatar item={item} size={28} />
          <div>
            <p className="text-[12px] font-semibold text-white">{item.author}</p>
            <p className="text-[9px] text-slate-500">{item.handle} · {item.time}</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed">{item.content}</p>
        <div className="flex gap-3 mt-2 text-[9px] text-slate-500">
          <span>♥ {item.likes}</span><span>↻ {item.retweets}</span>
        </div>
      </div>
    );
    return (
      <div
        className="rounded-xl border border-[#1d2142] bg-[#0d0f1e] p-3 cursor-pointer transition-all duration-150 hover:border-[#363a59]"
        onMouseEnter={(e) => onCardEnter(e, tooltipNode)}
        onMouseLeave={onCardLeave}
      >
        <div className="flex items-center gap-2 mb-2">
          <XAvatar item={item} size={30} />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-white truncate">{item.author}</p>
            <p className="text-[9px] text-slate-500">{item.handle} · {item.time}</p>
          </div>
          <svg className="ml-auto shrink-0 opacity-30" width="11" height="11" viewBox="0 0 24 24" fill="white">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.731-8.83L1.254 2.25H8.08l4.213 5.567L18.244 2.25zM17.083 19.77h1.833L7.084 4.126H5.117L17.083 19.77z"/>
          </svg>
        </div>
        <p className="text-[10px] text-slate-300 leading-relaxed line-clamp-2">{item.content}</p>
        <div className="flex items-center gap-3 mt-1.5 text-[9px] text-slate-600">
          <span>♥ {item.likes}</span>
          <span>↻ {item.retweets}</span>
        </div>
        <a
          href={item.tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-slate-500 transition hover:text-white"
          onClick={(e) => { e.stopPropagation(); setTooltip(null); }}
        >
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3 9L9 3M9 3H5M9 3v4"/>
          </svg>
          View Post
        </a>
      </div>
    );
  }

  function YTCard({ item }: { item: YTVideo }) {
    const tooltipNode = (
      <div>
        <SourceBadge color={item.channelColor} name={item.channel} />
        <p className="mt-1.5 text-[12px] text-slate-200 font-semibold leading-snug">{item.title}</p>
        <p className="mt-1 text-[9px] text-slate-500">Published: {item.publishedAt}</p>
        <p className="mt-1.5 text-[9px] text-slate-600">Click Watch to play video inline</p>
      </div>
    );
    return (
      <div
        className="rounded-xl border border-[#1d2142] bg-[#0d0f1e] overflow-hidden cursor-pointer transition-all duration-150 hover:border-[#363a59]"
        onMouseEnter={(e) => onCardEnter(e, tooltipNode)}
        onMouseLeave={onCardLeave}
      >
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <img
            src={item.thumbnail}
            alt={item.title}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 shadow-lg">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="white"><polygon points="4,2 10,6 4,10"/></svg>
            </div>
          </div>
        </div>
        <div className="p-2.5">
          <SourceBadge color={item.channelColor} name={item.channel} />
          <p className="mt-1 text-[11px] text-slate-200 font-medium leading-snug line-clamp-2">{item.title}</p>
          <p className="mt-0.5 text-[9px] text-slate-600">{item.publishedAt}</p>
        </div>
        <button
          className="mx-2.5 mb-2.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-red-400 transition hover:text-red-300"
          onClick={(e) => { e.stopPropagation(); setTooltip(null); setPopup({ type: "youtube", data: item }); }}
        >
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M1 1h4M1 1v4M11 11H7M11 11V7M1 11v-4M1 11h4M11 1H7M11 1v4"/>
          </svg>
          Watch
        </button>
      </div>
    );
  }

  // ─── Full-content popup ────────────────────────────────────────────────────
  function FullPopup() {
    if (!popup) return null;
    return (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-6"
        style={{ background: "rgba(3,5,18,0.85)", backdropFilter: "blur(8px)" }}
        onClick={() => setPopup(null)}
      >
        <div
          className="relative w-full max-w-2xl rounded-2xl border border-[#363a59] bg-[#0d0f1e] shadow-2xl overflow-hidden"
          style={{ maxHeight: "80vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#1d2142] px-5 py-4">
            {popup.type === "news" && (
              <SourceBadge color={(popup.data as NewsItem).sourceColor} name={(popup.data as NewsItem).source} />
            )}
            {popup.type === "x" && (
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: (popup.data as XPost).avatarColor }}>{(popup.data as XPost).author[0]}</span>
                <span className="text-[12px] font-semibold text-white">{(popup.data as XPost).author}</span>
                <span className="text-[10px] text-slate-500">{(popup.data as XPost).handle}</span>
              </div>
            )}
            {popup.type === "youtube" && (
              <SourceBadge color={(popup.data as YTVideo).channelColor} name={(popup.data as YTVideo).channel} />
            )}
            <button onClick={() => setPopup(null)} className="ml-auto flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M1 1l12 12M13 1L1 13"/>
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto" style={{ maxHeight: "calc(80vh - 120px)" }}>
            {popup.type === "news" && (() => {
              const item = popup.data as NewsItem;
              return (
                <div className="p-5">
                  <h2 className="text-base font-bold text-white leading-snug mb-3">{item.title}</h2>
                  <p className="text-[11px] text-slate-500 mb-4">{item.pubDate}</p>
                  <p className="text-[13px] text-slate-300 leading-relaxed">{item.description}</p>
                  <a href={item.link} target="_blank" rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[11px] font-semibold transition"
                    style={{ background: `${item.sourceColor}22`, color: item.sourceColor, border: `1px solid ${item.sourceColor}44` }}>
                    Read full article on {item.source}
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9L9 3M9 3H5M9 3v4"/></svg>
                  </a>
                </div>
              );
            })()}

            {popup.type === "x" && (() => {
              const item = popup.data as XPost;
              return (
                <div className="p-5">
                  <p className="text-[14px] text-slate-200 leading-relaxed mb-4">{item.content}</p>
                  <div className="flex gap-4 mb-5 text-[12px] text-slate-500">
                    <span>♥ {item.likes}</span>
                    <span>↻ {item.retweets}</span>
                    <span className="ml-auto">{item.time}</span>
                  </div>
                  <p className="mb-3 text-[10px] text-slate-600 italic">
                    * Live X/Twitter data requires Twitter API v2 integration. Showing curated sample posts.
                  </p>
                  <a href={item.tweetUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-black px-4 py-2 text-[11px] font-semibold text-white border border-[#363a59] transition hover:bg-[#1d2142]">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.731-8.83L1.254 2.25H8.08l4.213 5.567L18.244 2.25z"/></svg>
                    View on X (Twitter)
                  </a>
                </div>
              );
            })()}

            {popup.type === "youtube" && (() => {
              const item = popup.data as YTVideo;
              return (
                <div className="p-5">
                  <h2 className="text-base font-bold text-white leading-snug mb-3">{item.title}</h2>
                  <p className="text-[11px] text-slate-500 mb-4">
                    {item.channel} · {item.publishedAt}
                  </p>
                  {item.videoId && item.videoId !== "dQw4w9WgXcQ" ? (
                    <div className="relative w-full rounded-xl overflow-hidden" style={{ paddingBottom: "56.25%" }}>
                      <iframe
                        className="absolute inset-0 w-full h-full"
                        src={`https://www.youtube.com/embed/${item.videoId}?autoplay=1&rel=0`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title={item.title}
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl bg-[#1a1c2e] p-8 text-center">
                      <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-red-600 mb-3 shadow-lg">
                        <svg width="24" height="24" viewBox="0 0 12 12" fill="white"><polygon points="4,2 10,6 4,10"/></svg>
                      </div>
                      <p className="text-slate-300 text-sm mb-2">{item.title}</p>
                      <a href={`https://www.youtube.com/watch?v=${item.videoId}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 rounded-xl bg-red-600 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-red-700">
                        Watch on YouTube ↗
                      </a>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Footer */}
          <div className="border-t border-[#1d2142] px-5 py-3 text-[9px] text-slate-700">
            Source: {popup.type === "news" ? (popup.data as NewsItem).source :
                     popup.type === "x" ? "X / Twitter" : (popup.data as YTVideo).channel}
            {" · "}Zenit News Feed
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Trigger tab ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed right-0 top-1/2 z-[90] flex flex-col items-center gap-1.5 rounded-l-2xl px-2 py-4 text-white transition-all duration-300"
        style={{
          transform: "translateY(-50%)",
          background: open
            ? "linear-gradient(180deg, #3d51ff 0%, #2d3fd0 100%)"
            : "linear-gradient(180deg, #1a1c2e 0%, #0d0f1e 100%)",
          border: "1px solid",
          borderRight: "none",
          borderColor: open ? "#3d51ff" : "rgba(54,58,89,0.7)",
          boxShadow: open
            ? "-4px 0 20px rgba(61,81,255,0.4)"
            : "-4px 0 24px rgba(0,0,0,0.4)",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke={open ? "#fff" : "#38bdf8"} strokeWidth="2" strokeLinecap="round">
          <path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
          <path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
        <span
          className="text-[9px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: open ? "#c7d2fe" : "#64748b" }}
        >
          {open ? "Close" : "News"}
        </span>
        <span className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-amber-400 animate-pulse" : "bg-green-400 animate-pulse"}`} />
      </button>

      {/* ── Dim backdrop (same as left sidebar) ── */}
      <div
        className="fixed inset-0 z-[75] transition-opacity duration-300"
        style={{
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
        onClick={() => setOpen(false)}
      />

      {/* ── Sidebar panel ── */}
      <div
        className="fixed right-0 top-0 bottom-0 z-[80] flex flex-col"
        style={{
          width: 320,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
          background: "linear-gradient(180deg, #0d0f1e 0%, #080a14 100%)",
          borderLeft: "1px solid rgba(54,58,89,0.6)",
          boxShadow: open ? "-16px 0 56px rgba(0,0,0,0.7), -4px 0 16px rgba(99,102,241,0.08)" : "none",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-[#1d2142] shrink-0"
          style={{ background: "rgba(13,15,30,0.95)", backdropFilter: "blur(12px)" }}
        >
          <div className="flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round">
              <path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
              <path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
            <span className="text-[12px] font-semibold text-white">Crypto News Feed</span>
            {loading && <div className="h-3 w-3 rounded-full border-2 border-t-transparent border-sky-400 animate-spin" />}
          </div>
          <button onClick={() => setOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l10 10M11 1L1 11"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 py-2 border-b border-[#1d2142] shrink-0">
          {([
            { key: "news",    label: "Press",    color: "#f97316",
              icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"/><path d="M16 2v4H8M8 14h8M8 10h8"/></svg> },
            { key: "x",       label: "X Posts",  color: "#e2e8f0",
              icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.731-8.83L1.254 2.25H8.08l4.213 5.567L18.244 2.25z"/></svg> },
            { key: "youtube", label: "YouTube",  color: "#ef4444",
              icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M23 7s-.3-2-1.2-2.8c-1.1-1.2-2.4-1.2-3-1.3C16.2 2.8 12 2.8 12 2.8s-4.2 0-6.8.2c-.6.1-1.9.1-3 1.3C1.3 5 1 7 1 7S.7 9.1.7 11.3v2c0 2.2.3 4.3.3 4.3s.3 2 1.2 2.8c1.1 1.2 2.6 1.1 3.3 1.2C7.7 21.8 12 21.8 12 21.8s4.2 0 6.8-.3c.6-.1 1.9-.1 3-1.3.9-.8 1.2-2.8 1.2-2.8s.3-2.1.3-4.3v-2C23.3 9.1 23 7 23 7zM9.7 15.5V8.4l8.1 3.6-8.1 3.5z"/></svg> },
          ] as const).map(({ key, label, color, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 text-[10px] font-semibold transition-all duration-150"
              style={tab === key ? {
                background: `${color}18`,
                color,
                border: `1px solid ${color}33`,
              } : {
                background: "transparent",
                color: "#475569",
                border: "1px solid transparent",
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {tab === "news"    && news.map((item) => <NewsCard key={item.id} item={item} />)}
          {tab === "x"       && xPosts.map((item) => <XCard key={item.id} item={item} />)}
          {tab === "youtube" && videos.map((item) => <YTCard key={item.id} item={item} />)}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#1d2142] px-4 py-2.5 text-[9px] text-slate-700 leading-relaxed">
          {tab === "news" && "Sources: CoinDesk · CoinTelegraph (RSS). Hover for summary, click Full Article for details."}
          {tab === "x"    && "Curated posts from crypto KOLs on X/Twitter. Live feed requires Twitter API v2."}
          {tab === "youtube" && "Videos from crypto YouTube channels. Click Watch to play inline."}
        </div>
      </div>

      {/* ── Fixed hover tooltip (outside sidebar overflow) ── */}
      {tooltip && (() => {
        const TOOLTIP_W = 288;
        const GAP = 10;
        const left = tooltip.rect.left - TOOLTIP_W - GAP;
        const top  = Math.max(8, Math.min(
          tooltip.rect.top,
          window.innerHeight - 300
        ));
        return (
          <div
            className="rounded-2xl border border-[#363a59] bg-[#0d0f1e]/97 p-4 shadow-2xl backdrop-blur-sm pointer-events-none"
            style={{
              position: "fixed",
              zIndex: 300,
              left: Math.max(8, left),
              top,
              width: TOOLTIP_W,
              boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.15)",
            }}
          >
            {/* Arrow pointing right */}
            <div
              className="absolute"
              style={{
                right: -7,
                top: 16,
                width: 0,
                height: 0,
                borderTop: "6px solid transparent",
                borderBottom: "6px solid transparent",
                borderLeft: "7px solid #363a59",
              }}
            />
            <div
              className="absolute"
              style={{
                right: -5,
                top: 17,
                width: 0,
                height: 0,
                borderTop: "5px solid transparent",
                borderBottom: "5px solid transparent",
                borderLeft: "6px solid #0d0f1e",
              }}
            />
            {tooltip.node}
          </div>
        );
      })()}

      {/* ── Full popup ── */}
      <FullPopup />
    </>
  );
}
