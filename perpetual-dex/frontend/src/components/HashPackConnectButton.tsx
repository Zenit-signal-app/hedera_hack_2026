import { useEffect, useState } from "react";
import { hashgraphWalletConnect } from "@/lib/hashgraphWalletConnect";
import { activeEvmNetwork } from "@/config/wagmi";

function detectHashPackInjected(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  const eth = w?.ethereum;
  const lower = (v: unknown) => String(v ?? "").toLowerCase();
  const isHashPackLike = (p: any): boolean => {
    if (!p) return false;
    if (p.isHashPack || p.isHashpack) return true;
    if (lower(p.providerInfo?.name).includes("hashpack")) return true;
    if (lower(p.providerInfo?.rdns).includes("hashpack")) return true;
    if (lower(p.name).includes("hashpack")) return true;
    if (lower(p.constructor?.name).includes("hashpack")) return true;
    return false;
  };

  if (isHashPackLike(eth)) return true;
  if (eth && typeof eth.request === "function") return true;
  const providers = Array.isArray(eth?.providers) ? eth.providers : [];
  if (providers.some((p: any) => isHashPackLike(p) || typeof p?.request === "function")) return true;
  if (
    isHashPackLike(w?.hashpack?.ethereum) ||
    isHashPackLike(w?.hashpack?.provider) ||
    typeof w?.hashpack?.ethereum?.request === "function" ||
    typeof w?.hashpack?.provider?.request === "function"
  ) return true;
  if (
    isHashPackLike(w?.hashPack?.ethereum) ||
    isHashPackLike(w?.hashPack?.provider) ||
    typeof w?.hashPack?.ethereum?.request === "function" ||
    typeof w?.hashPack?.provider?.request === "function"
  ) return true;
  if (
    isHashPackLike(w?.hedera?.ethereum) ||
    isHashPackLike(w?.hedera?.provider) ||
    typeof w?.hedera?.ethereum?.request === "function" ||
    typeof w?.hedera?.provider?.request === "function"
  ) return true;
  return false;
}

type HashPackConnectButtonProps = {
  /** Use `center` inside centered cards (e.g. Stake); default `end` matches the header bar. */
  align?: "center" | "end";
  /** Compact pill + account id + close (swap widgets). */
  variant?: "default" | "pill";
};

export default function HashPackConnectButton({ align = "end", variant = "default" }: HashPackConnectButtonProps) {
  const [accountId, setAccountId] = useState<string>(() => localStorage.getItem("zenit:wallet:accountId") ?? "");
  const [availability, setAvailability] = useState<"yes" | "no" | "unknown">("unknown");
  const [connecting, setConnecting] = useState<boolean>(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    hashgraphWalletConnect
      .init()
      .then(async (extensions) => {
        if (!mounted) return;
        const hasHashPackExtension = extensions.some(
          (e) =>
            e.id === "gjagmgiddbbciopjhllkdnddhcglnemk" ||
            String(e.name ?? "").toLowerCase().includes("hashpack"),
        );
        setAvailability(hasHashPackExtension || detectHashPackInjected() ? "yes" : "unknown");
        const restored = await hashgraphWalletConnect.restoreSession().catch(() => null);
        if (restored?.accountId) setAccountId(restored.accountId);
      })
      .catch((err) => {
        if (!mounted) return;
        setAvailability(detectHashPackInjected() ? "yes" : "unknown");
        console.warn("HashPack init failed:", err);
      });
    const poll = setInterval(() => {
      if (!mounted) return;
      if (detectHashPackInjected()) setAvailability("yes");
    }, 1500);
    const onWallet = (ev: Event) => {
      const detail = (ev as CustomEvent<{ accountId?: string }>).detail;
      setAccountId(String(detail?.accountId ?? ""));
      if (detail?.accountId) setConnectError(null);
    };
    window.addEventListener("zenit-hashgraph-wallet", onWallet as EventListener);
    return () => {
      mounted = false;
      clearInterval(poll);
      window.removeEventListener("zenit-hashgraph-wallet", onWallet as EventListener);
    };
  }, []);

  const onConnect = async () => {
    try {
      setConnecting(true);
      setConnectError(null);
      const { accountId: nextAccount } = await hashgraphWalletConnect.connectHashPack();
      setAccountId(nextAccount);
      setAvailability("yes");
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const msg = raw.toLowerCase();
      setConnectError(raw.length > 220 ? `${raw.slice(0, 220)}…` : raw);
      if (
        msg.includes("extension") ||
        msg.includes("no provider") ||
        msg.includes("walletconnect not initialized")
      ) {
        setAvailability("no");
      }
      console.warn("HashPack connect failed:", err);
    } finally {
      setConnecting(false);
    }
  };

  const onDisconnect = async () => {
    await hashgraphWalletConnect.disconnect();
    setAccountId("");
    setConnectError(null);
  };

  const wrap = align === "center" ? "items-center" : "items-end";
  const netLabel = activeEvmNetwork === "mainnet" ? "Mainnet" : "Testnet";

  if (accountId) {
    if (variant === "pill") {
      return (
        <div className={`flex flex-col gap-1.5 ${wrap}`}>
          <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#14151a] py-1 pl-1.5 pr-1 shadow-[0_0_20px_rgba(0,0,0,0.35)]">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2d6a4f] to-[#1b4332] text-[10px] font-bold text-white"
              aria-hidden
            >
              ℏ
            </span>
            <span className="max-w-[120px] truncate font-mono text-xs font-medium text-slate-100" title={`${netLabel} · ${accountId}`}>
              {accountId}
            </span>
            <span className="shrink-0 rounded bg-white/5 px-1 py-0.5 text-[9px] font-semibold uppercase text-slate-400">
              {netLabel}
            </span>
            <button
              type="button"
              onClick={onDisconnect}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg leading-none text-slate-500 transition hover:bg-white/5 hover:text-white"
              aria-label="Disconnect wallet"
            >
              ×
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className={`flex flex-col gap-1.5 ${wrap}`}>
        <button
          type="button"
          onClick={onDisconnect}
          className="rounded-2xl border border-slate-600/50 bg-[#12151f] px-4 py-2.5 text-sm font-semibold text-slate-100 shadow-inner hover:border-slate-500/60 hover:bg-[#1a1f2e]"
        >
          {accountId} (Disconnect)
        </button>
      </div>
    );
  }

  if (availability === "no") {
    return (
      <div className={`flex flex-col gap-1.5 ${wrap}`}>
        <a
          href="https://www.hashpack.app/download"
          target="_blank"
          rel="noreferrer"
          className={`rounded-2xl border border-emerald-500/25 bg-emerald-950/30 font-semibold text-emerald-200 hover:border-emerald-400/35 hover:bg-emerald-950/50 ${
            variant === "pill" ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm"
          }`}
        >
          Install HashPack
        </a>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${wrap}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting}
          className={`rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:from-emerald-500 hover:to-teal-400 disabled:opacity-60 ${
            variant === "pill" ? "px-4 py-2 text-xs" : "rounded-2xl px-6 py-2.5 text-sm"
          }`}
        >
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
        <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-medium text-slate-400" title="Ledger cho WalletConnect (VITE_HEDERA_EVM_NETWORK)">
          WC → {netLabel}
        </span>
      </div>
      {connectError && (
        <p className="max-w-[min(100%,320px)] rounded-lg border border-rose-500/35 bg-rose-950/40 px-2.5 py-1.5 text-left text-[10px] leading-snug text-rose-100/95">
          {connectError}
        </p>
      )}
    </div>
  );
}

