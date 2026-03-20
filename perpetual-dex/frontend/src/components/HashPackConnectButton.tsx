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

export default function HashPackConnectButton() {
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

  if (accountId) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <button
          onClick={onDisconnect}
          className="rounded-xl bg-[#1f2338] px-4 py-2 text-sm font-semibold text-white border border-[#363a59] hover:bg-[#2a2f4a]"
        >
          {accountId} (Disconnect)
        </button>
      </div>
    );
  }

  if (availability === "no") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <a
          href="https://www.hashpack.app/download"
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-[#1f2338] px-4 py-2 text-sm font-semibold text-white border border-[#363a59] hover:bg-[#2a2f4a]"
        >
          Install HashPack
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={onConnect}
        disabled={connecting}
        className="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-blue-600 hover:to-blue-700 disabled:opacity-60"
      >
        {connecting ? "Connecting..." : "Connect Wallet"}
      </button>
    </div>
  );
}

