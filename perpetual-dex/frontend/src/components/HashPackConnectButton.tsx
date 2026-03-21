import { useEffect, useState } from "react";
import { hashgraphWalletConnect } from "@/lib/hashgraphWalletConnect";

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
};

export default function HashPackConnectButton({ align = "end" }: HashPackConnectButtonProps) {
  const [accountId, setAccountId] = useState<string>(() => localStorage.getItem("zenit:wallet:accountId") ?? "");
  const [availability, setAvailability] = useState<"yes" | "no" | "unknown">("unknown");
  const [connecting, setConnecting] = useState<boolean>(false);

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
      const { accountId: nextAccount } = await hashgraphWalletConnect.connectHashPack();
      setAccountId(nextAccount);
      setAvailability("yes");
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
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
  };

  const wrap = align === "center" ? "items-center" : "items-end";

  if (accountId) {
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
          className="rounded-2xl border border-emerald-500/25 bg-emerald-950/30 px-5 py-2.5 text-sm font-semibold text-emerald-200 hover:border-emerald-400/35 hover:bg-emerald-950/50"
        >
          Install HashPack
        </a>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${wrap}`}>
      <button
        type="button"
        onClick={onConnect}
        disabled={connecting}
        className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 transition hover:from-emerald-500 hover:to-teal-400 disabled:opacity-60"
      >
        {connecting ? "Connecting…" : "Connect Wallet"}
      </button>
    </div>
  );
}

