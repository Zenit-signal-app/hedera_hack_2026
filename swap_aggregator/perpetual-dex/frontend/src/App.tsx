import { Routes, Route, NavLink, Link } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Trade from "./pages/Trade";
import Rewards from "./pages/Rewards";
import Stake from "./pages/Stake";
import LiquidityAggregator from "./pages/LiquidityAggregator";
import OnRamp from "./pages/OnRamp";
import NewsSidebar from "./components/NewsSidebar";
import SetupGuideWidget from "./components/SetupGuideWidget";
import CryptoEventsGlobe from "./components/CryptoEventsGlobe";
import BinanceBubbleChart from "./components/BinanceBubbleChart";
import HashPackConnectButton from "./components/HashPackConnectButton";
import zenitLogo from "../icon/Gemini_Generated_Image_jqqzfpjqqzfpjqqz.png";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0d0f18]">
      <header
        className="sticky top-0 z-50 px-6 py-3 flex items-center justify-between"
        style={{
          background: "linear-gradient(180deg, rgba(13,15,28,0.97) 0%, rgba(18,20,33,0.92) 100%)",
          borderBottom: "1px solid rgba(54,58,89,0.5)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 1px 32px rgba(0,0,0,0.4), inset 0 -1px 0 rgba(99,102,241,0.08)",
        }}
      >
        {/* ── Brand / Logo ── */}
        <Link to="/" className="flex items-center gap-3 group">
          {/* Logo ring */}
          <div
            className="relative w-12 h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
            style={{
              background: "radial-gradient(circle at 30% 30%, rgba(59,130,246,0.18), rgba(15,23,42,0.95))",
              border: "1px solid rgba(15,23,42,0.35)",
              boxShadow: "0 10px 40px rgba(15,23,42,0.35)",
            }}
          >
            <div className="absolute inset-0 rounded-full bg-white" />
            <img
              src={zenitLogo}
              alt="Zenit logo"
              className="relative w-11 h-11 rounded-full object-contain"
              decoding="async"
              style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.35))" }}
            />
          </div>

          {/* Brand text */}
          <div className="flex flex-col leading-none">
            <span
              className="text-[17px] font-bold tracking-wide"
              style={{
                background: "linear-gradient(90deg, #ffffff 30%, #c7d2fe 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Zenit
            </span>
            <span className="text-[10px] text-slate-500 tracking-[0.18em] uppercase hidden sm:block mt-0.5">
              Perpetual DEX
            </span>
          </div>
        </Link>

        {/* ── Nav links ── */}
        <nav className="flex items-center gap-1">
          {/* Trade */}
          <NavLink
            to="/"
            className={({ isActive }) =>
              `relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                isActive ? "text-white" : "text-slate-400 hover:text-slate-200"
              }`
            }
            style={({ isActive }) => isActive ? {
              background: "linear-gradient(135deg, rgba(61,81,255,0.25) 0%, rgba(56,189,248,0.15) 100%)",
              border: "1px solid rgba(99,102,241,0.35)",
              boxShadow: "0 0 14px rgba(61,81,255,0.2), inset 0 0 8px rgba(56,189,248,0.05)",
            } : {
              background: "transparent",
              border: "1px solid transparent",
            }}
          >
            {({ isActive }) => (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isActive ? "#818cf8" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                Trade
                {isActive && (
                  <span
                    className="absolute bottom-0.5 left-1/2 h-0.5 w-6 rounded-full"
                    style={{ background: "linear-gradient(to right, #6366f1, #38bdf8)", transform: "translateX(-50%)" }}
                  />
                )}
              </>
            )}
          </NavLink>

          {/* Rewards */}
          <NavLink
            to="/rewards"
            className={({ isActive }) =>
              `relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                isActive ? "text-white" : "text-slate-400 hover:text-slate-200"
              }`
            }
            style={({ isActive }) => isActive ? {
              background: "linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(251,146,60,0.12) 100%)",
              border: "1px solid rgba(245,158,11,0.3)",
              boxShadow: "0 0 14px rgba(245,158,11,0.15), inset 0 0 8px rgba(251,146,60,0.05)",
            } : {
              background: "transparent",
              border: "1px solid transparent",
            }}
          >
            {({ isActive }) => (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isActive ? "#fbbf24" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                Rewards
                {isActive && (
                  <span
                    className="absolute bottom-0.5 left-1/2 h-0.5 w-6 rounded-full"
                    style={{ background: "linear-gradient(to right, #f59e0b, #fb923c)", transform: "translateX(-50%)" }}
                  />
                )}
              </>
            )}
          </NavLink>

          {/* Stake zUSDC */}
          <NavLink
            to="/stake"
            className={({ isActive }) =>
              `relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                isActive ? "text-white" : "text-slate-400 hover:text-slate-200"
              }`
            }
            style={({ isActive }) =>
              isActive
                ? {
                    background: "linear-gradient(135deg, rgba(16,185,129,0.22) 0%, rgba(52,211,153,0.12) 100%)",
                    border: "1px solid rgba(52,211,153,0.35)",
                    boxShadow: "0 0 14px rgba(16,185,129,0.15)",
                  }
                : { background: "transparent", border: "1px solid transparent" }
            }
          >
            {({ isActive }) => (
              <>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isActive ? "#34d399" : "currentColor"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Stake
                {isActive && (
                  <span
                    className="absolute bottom-0.5 left-1/2 h-0.5 w-6 rounded-full"
                    style={{
                      background: "linear-gradient(to right, #10b981, #34d399)",
                      transform: "translateX(-50%)",
                    }}
                  />
                )}
              </>
            )}
          </NavLink>

          {/* Liquidity aggregator (beta) */}
          <NavLink
            to="/aggregate"
            className={({ isActive }) =>
              `relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                isActive ? "text-white" : "text-slate-400 hover:text-slate-200"
              }`
            }
            style={({ isActive }) =>
              isActive
                ? {
                    background: "linear-gradient(135deg, rgba(6,182,212,0.22) 0%, rgba(20,184,166,0.12) 100%)",
                    border: "1px solid rgba(34,211,238,0.35)",
                    boxShadow: "0 0 14px rgba(6,182,212,0.15)",
                  }
                : { background: "transparent", border: "1px solid transparent" }
            }
          >
            {({ isActive }) => (
              <>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isActive ? "#22d3ee" : "currentColor"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 3h5v5" />
                  <path d="M8 3H3v5" />
                  <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
                  <path d="m15 9 6-6" />
                </svg>
                Aggregate
                {isActive && (
                  <span
                    className="absolute bottom-0.5 left-1/2 h-0.5 w-6 rounded-full"
                    style={{
                      background: "linear-gradient(to right, #06b6d4, #14b8a6)",
                      transform: "translateX(-50%)",
                    }}
                  />
                )}
              </>
            )}
          </NavLink>

          {/* On-ramp (Onramper) */}
          <NavLink
            to="/onramp"
            className={({ isActive }) =>
              `relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                isActive ? "text-white" : "text-slate-400 hover:text-slate-200"
              }`
            }
            style={({ isActive }) =>
              isActive
                ? {
                    background: "linear-gradient(135deg, rgba(52,211,153,0.2) 0%, rgba(45,212,191,0.12) 100%)",
                    border: "1px solid rgba(45,212,191,0.35)",
                    boxShadow: "0 0 14px rgba(45,212,191,0.15)",
                  }
                : { background: "transparent", border: "1px solid transparent" }
            }
          >
            {({ isActive }) => (
              <>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isActive ? "#2dd4bf" : "currentColor"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                Buy crypto
                {isActive && (
                  <span
                    className="absolute bottom-0.5 left-1/2 h-0.5 w-6 rounded-full"
                    style={{
                      background: "linear-gradient(to right, #14b8a6, #2dd4bf)",
                      transform: "translateX(-50%)",
                    }}
                  />
                )}
              </>
            )}
          </NavLink>

          {/* Divider */}
          <div className="mx-2 h-6 w-px" style={{ background: "rgba(54,58,89,0.8)" }} />

          {/* Connect Button wrapper */}
          <div style={{ filter: "drop-shadow(0 0 8px rgba(99,102,241,0.2))" }}>
            <HashPackConnectButton />
          </div>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      <NewsSidebar />
      <CryptoEventsGlobe />
      <BinanceBubbleChart />
      <SetupGuideWidget />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<Trade />} />
          <Route path="/rewards" element={<Rewards />} />
          <Route path="/stake" element={<Stake />} />
          <Route path="/aggregate" element={<LiquidityAggregator />} />
          <Route path="/onramp" element={<OnRamp />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  );
}
