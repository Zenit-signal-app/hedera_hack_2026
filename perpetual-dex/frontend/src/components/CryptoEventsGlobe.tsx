/**
 * CryptoEventsGlobe – full-screen 3D globe showing upcoming crypto events worldwide.
 * Uses react-globe.gl (ThreeJS/WebGL). Lazy-loaded to keep initial bundle small.
 * Event data includes official websites + X/Twitter handles.
 * Live X posts are fetched via Nitter RSS (same approach as NewsSidebar).
 */

import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";

const Globe = lazy(() => import("react-globe.gl"));

// ─── Types ────────────────────────────────────────────────────────────────────
interface CryptoEvent {
  id: string;
  name: string;
  type: string;
  date: string;
  endDate?: string;
  description: string;
  website: string;     // Official event website (used for "Visit Website" link)
  cmcUrl: string;      // CoinMarketCap events page
  xHandle?: string;    // Twitter/X handle WITHOUT @, e.g. "token2049"
}

interface CityPoint {
  lat: number;
  lng: number;
  city: string;
  country: string;
  events: CryptoEvent[];
}

interface XPost {
  text: string;
  url: string;
  date: string;
}

// ─── Curated 2026 crypto events ───────────────────────────────────────────────
const CITY_EVENTS: CityPoint[] = [
  {
    lat: 25.2048, lng: 55.2708, city: "Dubai", country: "UAE",
    events: [
      { id: "d1", name: "TOKEN2049 Dubai", type: "Conference",
        date: "Apr 30, 2026", endDate: "May 1, 2026",
        description: "One of the world's largest crypto conferences with 20,000+ attendees and 300+ speakers covering Web3 trends, DeFi, and emerging L1/L2 ecosystems.",
        website: "https://www.token2049.com/dubai",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "token2049" },
      { id: "d2", name: "ETH Dubai", type: "Hackathon",
        date: "Apr 28, 2026",
        description: "Ethereum Foundation-backed hackathon bringing developers, founders, and researchers together for 48 hours of building.",
        website: "https://ethdubai.xyz",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "ETHDubai" },
    ]
  },
  {
    lat: 48.8566, lng: 2.3522, city: "Paris", country: "France",
    events: [
      { id: "p1", name: "Paris Blockchain Week 2026", type: "Conference",
        date: "Apr 8, 2026", endDate: "Apr 10, 2026",
        description: "Europe's premier blockchain conference gathering institutional investors, founders, and regulators to discuss the future of digital assets.",
        website: "https://www.parisblockchainweek.com",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "ParisBlockchain" },
    ]
  },
  {
    lat: 30.2672, lng: -97.7431, city: "Austin", country: "USA",
    events: [
      { id: "a1", name: "Consensus 2026 by CoinDesk", type: "Conference",
        date: "May 12, 2026", endDate: "May 14, 2026",
        description: "The world's longest-running crypto conference. Three days of panels, workshops, and networking for the entire Web3 ecosystem.",
        website: "https://consensus.coindesk.com",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "CoinDesk" },
    ]
  },
  {
    lat: 39.7392, lng: -104.9903, city: "Denver", country: "USA",
    events: [
      { id: "de1", name: "ETHDenver 2026", type: "Conference + Hackathon",
        date: "Feb 24, 2026", endDate: "Mar 1, 2026",
        description: "The world's largest and longest-running Ethereum event. 20,000+ BUIDLers gather for a week of building, learning, and community.",
        website: "https://www.ethdenver.com",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "ETHDenver" },
    ]
  },
  {
    lat: 25.7617, lng: -80.1918, city: "Miami", country: "USA",
    events: [
      { id: "m1", name: "Bitcoin 2026 Conference", type: "Conference",
        date: "Jul 22, 2026", endDate: "Jul 25, 2026",
        description: "The world's premier Bitcoin-focused event bringing together industry leaders, investors, and enthusiasts to celebrate and advance Bitcoin adoption.",
        website: "https://b.tc/conference",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "TheBitcoinConf" },
    ]
  },
  {
    lat: 40.7128, lng: -74.0060, city: "New York", country: "USA",
    events: [
      { id: "ny1", name: "NFT NYC 2026", type: "Conference",
        date: "Jun 2, 2026", endDate: "Jun 4, 2026",
        description: "The global gathering for the NFT ecosystem. Art, gaming, music, and technology converge with the world's top creators and collectors.",
        website: "https://www.nft.nyc",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "NFT_NYC" },
      { id: "ny2", name: "Permissionless III", type: "Conference",
        date: "Oct 7, 2026", endDate: "Oct 9, 2026",
        description: "DeFi-focused conference featuring deep technical dives into protocols, on-chain infrastructure, and the open financial system.",
        website: "https://blockworks.co/event/permissionless",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "Blockworks_" },
    ]
  },
  {
    lat: 1.3521, lng: 103.8198, city: "Singapore", country: "Singapore",
    events: [
      { id: "sg1", name: "TOKEN2049 Singapore", type: "Conference",
        date: "Sep 17, 2026", endDate: "Sep 18, 2026",
        description: "Asia's premier crypto conference returning to Singapore with 20,000+ attendees. The most anticipated Web3 event in the Asia-Pacific region.",
        website: "https://www.token2049.com",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "token2049" },
      { id: "sg2", name: "Singapore Fintech Festival 2026", type: "Conference",
        date: "Nov 12, 2026", endDate: "Nov 14, 2026",
        description: "World's largest fintech event bringing together financial services, technology, and policy leaders. Crypto and blockchain are a key focus.",
        website: "https://www.fintechfestival.sg",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "FinFestSG" },
    ]
  },
  {
    lat: 37.5665, lng: 126.9780, city: "Seoul", country: "South Korea",
    events: [
      { id: "se1", name: "Korea Blockchain Week (KBW) 2026", type: "Conference",
        date: "Sep 7, 2026", endDate: "Sep 13, 2026",
        description: "Korea's largest blockchain event week featuring DevConnect, side events, and the flagship conference with global crypto leaders.",
        website: "https://koreablockchainweek.com",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "KBWofficial" },
      { id: "se2", name: "Seoul Web3 Meetup", type: "Meetup",
        date: "Mar 14, 2026",
        description: "OpenClaw and ACP expanding to Korea. Developers and founders from leading Layer 1 protocols gathering in Seoul for networking and presentations.",
        website: "https://coinmarketcap.com/events/",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "virtuals_io" },
    ]
  },
  {
    lat: 22.3193, lng: 114.1694, city: "Hong Kong", country: "Hong Kong",
    events: [
      { id: "hk1", name: "Hong Kong Web3 Festival 2026", type: "Conference",
        date: "Apr 14, 2026", endDate: "Apr 17, 2026",
        description: "Hong Kong's flagship Web3 event exploring the intersection of traditional finance and digital assets in Asia's financial hub.",
        website: "https://www.web3festival.org",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "HKWeb3Festival" },
    ]
  },
  {
    lat: 35.6762, lng: 139.6503, city: "Tokyo", country: "Japan",
    events: [
      { id: "to1", name: "Japan Blockchain Conference 2026", type: "Conference",
        date: "Jun 15, 2026", endDate: "Jun 16, 2026",
        description: "Japan's largest blockchain conference connecting enterprise, gaming, and DeFi ecosystems with a strong focus on NFTs and Web3 gaming.",
        website: "https://jbc.global",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "jbconference" },
    ]
  },
  {
    lat: 13.7563, lng: 100.5018, city: "Bangkok", country: "Thailand",
    events: [
      { id: "bk1", name: "Devcon 8 – Southeast Asia", type: "Conference",
        date: "Nov 10, 2026", endDate: "Nov 13, 2026",
        description: "Ethereum Foundation's flagship developer conference. Four days of technical talks, workshops, and community events for Ethereum builders worldwide.",
        website: "https://devcon.org",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "EFDevcon" },
    ]
  },
  {
    lat: 38.7169, lng: -9.1399, city: "Lisbon", country: "Portugal",
    events: [
      { id: "li1", name: "ETH Lisbon 2026", type: "Hackathon",
        date: "Oct 20, 2026", endDate: "Oct 22, 2026",
        description: "Ethereum-focused hackathon and conference in Portugal's tech capital. 1,000+ developers competing for prizes and building the next generation of dApps.",
        website: "https://ethlisbon.org",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "ethlisbon" },
      { id: "li2", name: "Web Summit 2026", type: "Conference",
        date: "Nov 2, 2026", endDate: "Nov 5, 2026",
        description: "One of the world's largest tech conferences with 80,000+ attendees. Crypto and Web3 are major tracks alongside AI and deep tech.",
        website: "https://websummit.com",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "WebSummit" },
    ]
  },
  {
    lat: 41.3851, lng: 2.1734, city: "Barcelona", country: "Spain",
    events: [
      { id: "ba1", name: "European Blockchain Convention 2026", type: "Conference",
        date: "Sep 23, 2026", endDate: "Sep 24, 2026",
        description: "Europe's leading blockchain business event with 5,000+ professionals from 80+ countries discussing enterprise adoption and regulation.",
        website: "https://ebc.finance",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "EBCBarcelona" },
    ]
  },
  {
    lat: 51.5074, lng: -0.1278, city: "London", country: "UK",
    events: [
      { id: "lo1", name: "London Blockchain Conference 2026", type: "Conference",
        date: "May 20, 2026", endDate: "May 22, 2026",
        description: "Europe's leading enterprise blockchain event focusing on scalability and mainstream blockchain adoption across industries.",
        website: "https://londonblockchain.net",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "LBCofficial" },
    ]
  },
  {
    lat: 47.3769, lng: 8.5417, city: "Zürich", country: "Switzerland",
    events: [
      { id: "z1", name: "Swiss Web3 Fest 2026", type: "Conference",
        date: "Aug 10, 2026", endDate: "Aug 12, 2026",
        description: "Zug's Crypto Valley comes alive for Switzerland's premier Web3 festival blending institutional finance with cutting-edge DeFi innovation.",
        website: "https://swissweb3fest.ch",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "SwissWeb3Fest" },
    ]
  },
  {
    lat: -33.8688, lng: 151.2093, city: "Sydney", country: "Australia",
    events: [
      { id: "sy1", name: "Blockchain Week Sydney 2026", type: "Conference",
        date: "Jul 7, 2026", endDate: "Jul 11, 2026",
        description: "Australia's flagship blockchain week featuring enterprise, DeFi, and regulatory panels with 3,000+ attendees from across the Asia-Pacific region.",
        website: "https://blockchainaustralia.org",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "BlockchainAust" },
    ]
  },
  {
    lat: -23.5505, lng: -46.6333, city: "São Paulo", country: "Brazil",
    events: [
      { id: "sp1", name: "Blockchain Summit Brasil 2026", type: "Conference",
        date: "Aug 25, 2026",
        description: "Latin America's largest blockchain conference showcasing startups, DeFi protocols, and regulatory developments across South America.",
        website: "https://blockchainsummitbrasil.com",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "BSBrasil_" },
    ]
  },
  {
    lat: 19.4326, lng: -99.1332, city: "Mexico City", country: "Mexico",
    events: [
      { id: "mx1", name: "Bitcoin Beach Summit LATAM 2026", type: "Conference",
        date: "Oct 15, 2026",
        description: "Latin American Bitcoin adoption summit featuring grassroots communities, Lightning Network workshops, and the growing LATAM crypto ecosystem.",
        website: "https://bitcoinbeachfoundation.com",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "BitcoinBeach" },
    ]
  },
  {
    lat: 52.3676, lng: 4.9041, city: "Amsterdam", country: "Netherlands",
    events: [
      { id: "am1", name: "Dutch Blockchain Week 2026", type: "Conference",
        date: "Jun 22, 2026", endDate: "Jun 26, 2026",
        description: "Annual blockchain celebration across Amsterdam with hackathons, summits, and side events exploring DeFi, NFTs, and digital identity.",
        website: "https://dutchblockchainweek.nl",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "DutchBlockchain" },
    ]
  },
  {
    lat: 43.6532, lng: -79.3832, city: "Toronto", country: "Canada",
    events: [
      { id: "tr1", name: "Blockchain Futurist Conference 2026", type: "Conference",
        date: "Aug 12, 2026", endDate: "Aug 13, 2026",
        description: "Canada's largest blockchain event with 7,000+ attendees, 150+ speakers, and a wide range of DeFi, Web3, and crypto industry discussions.",
        website: "https://futurist.events",
        cmcUrl: "https://coinmarketcap.com/events/",
        xHandle: "BitcoinFuturist" },
    ]
  },
];

// Major world cities (dim markers, no events)
const WORLD_CITIES = [
  { lat: 55.7558, lng: 37.6173, city: "Moscow" },
  { lat: 39.9042, lng: 116.4074, city: "Beijing" },
  { lat: 31.2304, lng: 121.4737, city: "Shanghai" },
  { lat: 28.6139, lng: 77.2090, city: "New Delhi" },
  { lat: -34.6037, lng: -58.3816, city: "Buenos Aires" },
  { lat: 6.5244, lng: 3.3792, city: "Lagos" },
  { lat: -1.2921, lng: 36.8219, city: "Nairobi" },
  { lat: 30.0444, lng: 31.2357, city: "Cairo" },
  { lat: 41.0082, lng: 28.9784, city: "Istanbul" },
  { lat: 59.9139, lng: 10.7522, city: "Oslo" },
  { lat: 48.2082, lng: 16.3738, city: "Vienna" },
  { lat: 52.5200, lng: 13.4050, city: "Berlin" },
  { lat: 45.4642, lng: 9.1900, city: "Milan" },
  { lat: 40.4168, lng: -3.7038, city: "Madrid" },
  { lat: 59.3293, lng: 18.0686, city: "Stockholm" },
  { lat: 60.1699, lng: 24.9384, city: "Helsinki" },
  { lat: 50.0755, lng: 14.4378, city: "Prague" },
  { lat: 47.4979, lng: 19.0402, city: "Budapest" },
  { lat: 50.4501, lng: 30.5234, city: "Kyiv" },
  { lat: 24.8607, lng: 67.0011, city: "Karachi" },
  { lat: 3.1390, lng: 101.6869, city: "Kuala Lumpur" },
  { lat: 14.5995, lng: 120.9842, city: "Manila" },
  { lat: -6.2088, lng: 106.8456, city: "Jakarta" },
  { lat: 33.8688, lng: -84.3877, city: "Atlanta" },
  { lat: 41.8781, lng: -87.6298, city: "Chicago" },
  { lat: 34.0522, lng: -118.2437, city: "Los Angeles" },
  { lat: 37.7749, lng: -122.4194, city: "San Francisco" },
  { lat: 49.2827, lng: -123.1207, city: "Vancouver" },
  { lat: -37.8136, lng: 144.9631, city: "Melbourne" },
  { lat: 36.2048, lng: 138.2529, city: "Osaka" },
  { lat: 4.2105, lng: 101.9758, city: "Johor" },
];

// ─── Nitter RSS fetcher (same pattern as NewsSidebar) ─────────────────────────
const ALLORIGINS = "https://api.allorigins.win/get?url=";

function getItemLink(item: Element): string {
  // Try <link> element (text node after CDATA)
  const linkNodes = item.getElementsByTagName("link");
  for (let i = 0; i < linkNodes.length; i++) {
    const txt = linkNodes[i].textContent?.trim() ?? "";
    if (txt.startsWith("http")) return txt;
  }
  // Fallback: <guid>
  return item.getElementsByTagName("guid")[0]?.textContent?.trim() ?? "";
}

async function fetchXPostsForHandle(handle: string): Promise<XPost[]> {
  try {
    const rssUrl = encodeURIComponent(`https://nitter.net/${handle}/rss`);
    const res = await fetch(`${ALLORIGINS}${rssUrl}`, {
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    const { contents } = await res.json();
    const doc = new DOMParser().parseFromString(contents as string, "text/xml");
    const items = Array.from(doc.getElementsByTagName("item")).slice(0, 3);
    return items.map((item) => {
      const rawTitle = item.getElementsByTagName("title")[0]?.textContent ?? "";
      // Strip "Username: " prefix that Nitter adds
      const text = rawTitle.replace(/^[^:]+:\s*/, "").trim();
      const rawLink = getItemLink(item).replace("nitter.net", "x.com");
      const pubDate = item.getElementsByTagName("pubDate")[0]?.textContent ?? "";
      const date = pubDate
        ? new Date(pubDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "";
      return { text, url: rawLink, date };
    });
  } catch {
    return [];
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CryptoEventsGlobe() {
  const [open, setOpen]       = useState(false);
  const [hovered, setHovered] = useState<CityPoint | null>(null);
  const [pinned, setPinned]   = useState<CityPoint | null>(null);
  const [pinnedPos, setPinnedPos] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
  // X posts keyed by handle
  const [xPosts, setXPosts]   = useState<Record<string, XPost[]>>({});
  const [loadingX, setLoadingX] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout>>();

  // Reset pinned state when overlay closes
  useEffect(() => {
    if (!open) {
      setPinned(null);
      setHovered(null);
    }
  }, [open]);

  // Fetch X posts for all event handles when globe opens
  useEffect(() => {
    if (!open) return;

    const handles = new Set<string>();
    CITY_EVENTS.forEach((city) =>
      city.events.forEach((ev) => { if (ev.xHandle) handles.add(ev.xHandle); })
    );

    setLoadingX(true);
    Promise.all(
      Array.from(handles).map(async (handle) => {
        const posts = await fetchXPostsForHandle(handle);
        return [handle, posts] as const;
      })
    ).then((results) => {
      const map: Record<string, XPost[]> = {};
      results.forEach(([h, posts]) => { map[h] = posts; });
      setXPosts(map);
      setLoadingX(false);
    });
  }, [open]);

  // Compute window size for Globe
  useEffect(() => {
    function update() { setDimensions({ w: window.innerWidth, h: window.innerHeight }); }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Escape key: unpin first, then close overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pinned) setPinned(null);
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  // Debounced hover — 200 ms grace period to stop flicker
  const handlePointHover = useCallback((point: any) => {
    clearTimeout(hoverClearTimer.current);
    if (point && (point as CityPoint).events?.length > 0) {
      setHovered(point as CityPoint);
    } else {
      hoverClearTimer.current = setTimeout(() => setHovered(null), 200);
    }
  }, []);

  // Click pins the box
  const handlePointClick = useCallback((point: any) => {
    if (point && (point as CityPoint).events?.length > 0) {
      setPinned(point as CityPoint);
      setPinnedPos({ x: mousePos.x, y: mousePos.y });
      setHovered(null);
    }
  }, [mousePos]);

  // Globe point data
  const eventPoints = CITY_EVENTS.map((c) => ({ ...c, color: "#ffd700", altitude: 0.06, radius: 1.5 }));
  const bgPoints    = WORLD_CITIES.map((c) => ({ ...c, events: [], color: "#1e3a5f", altitude: 0.01, radius: 0.4 }));
  const allPoints   = [...bgPoints, ...eventPoints];
  const rings       = CITY_EVENTS.map((c) => ({ lat: c.lat, lng: c.lng }));

  // Tooltip positioning helpers
  const TOOLTIP_W = 340;
  const clampX = (x: number) =>
    x + 22 + TOOLTIP_W > window.innerWidth ? x - TOOLTIP_W - 14 : x + 22;
  const clampY = (y: number, h: number) =>
    y + h + 12 > window.innerHeight ? y - h - 12 : y + 12;

  const activeCity = pinned ?? hovered;
  const isPinned   = !!pinned;

  return (
    <>
      {/* ── Trigger / toggle button ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed right-0 z-[90] flex flex-col items-center gap-1.5 rounded-l-2xl px-2 py-4 text-white transition-all duration-300"
        style={{
          top: "62%",
          transform: "translateY(-50%)",
          background: open
            ? "linear-gradient(180deg, #e6007a 0%, #b3005f 100%)"
            : "linear-gradient(180deg, #1a1c2e 0%, #0d0f1e 100%)",
          border: "1px solid",
          borderRight: "none",
          borderColor: open ? "#e6007a" : "rgba(54,58,89,0.7)",
          boxShadow: open ? "-4px 0 20px rgba(230,0,122,0.4)" : "-4px 0 24px rgba(0,0,0,0.4)",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke={open ? "#fff" : "#e6007a"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: open ? "#fce7f3" : "#64748b" }}>
          Events
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-pink-500 animate-pulse" />
      </button>

      {/* ── Full-screen Globe overlay ─────────────────────────────────────── */}
      {open && (
        <div
          ref={containerRef}
          className="fixed inset-0 z-[160] overflow-hidden"
          style={{ background: "#000008" }}
          onMouseMove={handleMouseMove}
        >
          {/* Header */}
          <div
            className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-3"
            style={{ background: "linear-gradient(180deg, rgba(0,0,10,0.95) 0%, transparent 100%)" }}
          >
            <div className="flex items-center gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="#e6007a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              <div>
                <h1 className="text-white font-bold text-base tracking-wide">Crypto Events World Map</h1>
                <p className="text-slate-500 text-[10px]">
                  {CITY_EVENTS.length} cities · {CITY_EVENTS.reduce((s, c) => s + c.events.length, 0)} events
                  {loadingX
                    ? " · Fetching X posts…"
                    : isPinned
                      ? " · Click × to unpin"
                      : " · Hover to preview · Click to pin"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-4 text-[10px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ffd700", boxShadow: "0 0 6px #ffd700" }} />
                  Event city
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#1e3a5f" }} />
                  Major city
                </div>
              </div>

              <a href="https://coinmarketcap.com/events/" target="_blank" rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1 text-[9px] text-slate-600 hover:text-slate-400 transition">
                Source: CoinMarketCap Events ↗
              </a>

              <button onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#363a59] text-slate-400 hover:text-white hover:bg-white/10 transition"
                title="Close (Esc)">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M1 1l12 12M13 1L1 13"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Globe */}
          <Suspense fallback={
            <div className="flex h-full w-full items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 rounded-full border-4 border-pink-500/30 border-t-pink-500 animate-spin" />
                <p className="text-slate-500 text-sm">Loading globe…</p>
              </div>
            </div>
          }>
            {dimensions.w > 0 && (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <Globe
                width={dimensions.w}
                height={dimensions.h}
                backgroundColor="#000008"
                globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
                bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
                showAtmosphere
                atmosphereColor="#1a0a2e"
                atmosphereAltitude={0.18}
                pointsData={allPoints}
                pointLat={(d: any) => d.lat}
                pointLng={(d: any) => d.lng}
                pointColor={(d: any) => d.color}
                pointAltitude={(d: any) => d.altitude}
                pointRadius={(d: any) => d.radius}
                pointResolution={12}
                pointsMerge={false}
                onPointHover={handlePointHover}
                onPointClick={handlePointClick}
                ringsData={rings}
                ringColor={() => ["rgba(255,215,0,0)", "rgba(255,215,0,0.5)", "rgba(255,215,0,0)"]}
                ringMaxRadius={3}
                ringPropagationSpeed={2}
                ringRepeatPeriod={1200}
                labelsData={CITY_EVENTS}
                labelLat={(d: any) => d.lat}
                labelLng={(d: any) => d.lng}
                labelText={(d: any) => d.city}
                labelSize={0.38}
                labelColor={() => "rgba(255,215,0,0.85)"}
                labelDotRadius={0.25}
                labelAltitude={0.01}
                enablePointerInteraction
              />
            )}
          </Suspense>

          {/* ── Tooltip / Info box ─────────────────────────────────────────── */}
          {activeCity && (() => {
            const estimatedH = 120 + activeCity.events.length * 180;
            const boxLeft = isPinned ? clampX(pinnedPos.x) : clampX(mousePos.x);
            const boxTop  = isPinned ? clampY(pinnedPos.y, estimatedH) : clampY(mousePos.y, estimatedH);

            return (
              <div
                className="fixed z-20 rounded-2xl border bg-[#0a0c1a]/97 p-4 shadow-2xl backdrop-blur-sm"
                style={{
                  left: boxLeft,
                  top: boxTop,
                  width: TOOLTIP_W,
                  pointerEvents: isPinned ? "auto" : "none",
                  borderColor: isPinned ? "rgba(230,0,122,0.5)" : "rgba(54,58,89,0.7)",
                  boxShadow: isPinned
                    ? "0 8px 40px rgba(0,0,0,0.9), 0 0 0 1px rgba(230,0,122,0.35)"
                    : "0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(230,0,122,0.15)",
                }}
              >
                {/* City header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: "#ffd700", boxShadow: "0 0 8px #ffd700" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm leading-tight truncate">{activeCity.city}</p>
                    <p className="text-slate-500 text-[9px]">
                      {activeCity.country} · {activeCity.events.length} event{activeCity.events.length > 1 ? "s" : ""}
                      {isPinned && <span className="ml-1 text-pink-500">· pinned</span>}
                    </p>
                  </div>
                  {isPinned && (
                    <button
                      onClick={() => setPinned(null)}
                      className="shrink-0 flex h-6 w-6 items-center justify-center rounded-lg border border-[#363a59] text-slate-500 hover:text-white hover:border-pink-500 hover:bg-pink-500/10 transition"
                      title="Close (Esc)"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M1 1l8 8M9 1L1 9"/>
                      </svg>
                    </button>
                  )}
                </div>

                {!isPinned && (
                  <p className="text-[8px] text-slate-600 mb-2 italic">Click to pin and open links</p>
                )}

                {/* Events list */}
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-0.5">
                  {activeCity.events.map((ev) => {
                    const posts = ev.xHandle ? (xPosts[ev.xHandle] ?? []) : [];
                    return (
                      <div key={ev.id} className="rounded-xl bg-[#0e1225] border border-[#1d2142] p-3">

                        {/* Event name + type */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-[11px] font-semibold text-white leading-snug">{ev.name}</p>
                          <span
                            className="shrink-0 text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                            style={{ background: "#e6007a22", color: "#e6007a", border: "1px solid #e6007a44" }}
                          >
                            {ev.type}
                          </span>
                        </div>

                        {/* Date */}
                        <div className="flex items-center gap-1 mb-1.5">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round">
                            <rect x="3" y="4" width="18" height="18" rx="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                          <p className="text-[9px] text-amber-400 font-medium">
                            {ev.date}{ev.endDate ? ` → ${ev.endDate}` : ""}
                          </p>
                        </div>

                        {/* Description */}
                        <p className="text-[10px] text-slate-400 leading-relaxed mb-2">{ev.description}</p>

                        {/* Action buttons */}
                        {isPinned && (
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {/* Official website */}
                            <a
                              href={ev.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-400 hover:text-emerald-300 transition"
                            >
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="2" y1="12" x2="22" y2="12"/>
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                              </svg>
                              Official Website ↗
                            </a>
                            {/* CMC link */}
                            <a
                              href={ev.cmcUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[9px] font-semibold text-pink-400 hover:text-pink-300 transition"
                            >
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                              CoinMarketCap ↗
                            </a>
                            {/* X handle link */}
                            {ev.xHandle && (
                              <a
                                href={`https://x.com/${ev.xHandle}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[9px] font-semibold text-sky-400 hover:text-sky-300 transition"
                              >
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                @{ev.xHandle} ↗
                              </a>
                            )}
                          </div>
                        )}

                        {/* X Posts section — only when pinned */}
                        {isPinned && ev.xHandle && (
                          <div className="mt-1 border-t border-[#1d2142] pt-2">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="#64748b">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                              </svg>
                              <p className="text-[8px] font-semibold uppercase tracking-widest text-slate-600">
                                Latest from @{ev.xHandle}
                              </p>
                              {loadingX && (
                                <span className="ml-1 h-2 w-2 rounded-full border border-sky-500 border-t-transparent animate-spin" />
                              )}
                            </div>

                            {posts.length > 0 ? (
                              <div className="space-y-1.5">
                                {posts.map((post, i) => (
                                  <a
                                    key={i}
                                    href={post.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block rounded-lg bg-[#080a18] border border-[#1a1f3a] p-2 hover:border-sky-500/40 hover:bg-[#0c0f20] transition group"
                                  >
                                    <p className="text-[9px] text-slate-300 leading-relaxed line-clamp-3 group-hover:text-white transition">
                                      {post.text || "(no text)"}
                                    </p>
                                    {post.date && (
                                      <p className="text-[8px] text-slate-600 mt-1">{post.date}</p>
                                    )}
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[8px] text-slate-700 italic">
                                {loadingX ? "Fetching posts…" : "No posts available right now."}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Bottom hint */}
          <div
            className="absolute bottom-4 left-1/2 text-[10px] text-slate-600 text-center select-none"
            style={{ transform: "translateX(-50%)" }}
          >
            Drag to rotate · Scroll to zoom · Hover to preview · Click to pin &amp; open links
          </div>
        </div>
      )}
    </>
  );
}
