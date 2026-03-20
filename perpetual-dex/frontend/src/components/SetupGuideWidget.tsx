import { useState, useCallback } from "react";

const ZUSDC_TOKEN_ID =
  (import.meta.env.VITE_ZUSDC_TOKEN_ID as string | undefined) ||
  "0.0.8271323";
const EXPLORER = "https://hashscan.io/testnet/transaction";
const YOUTUBE_LINK = "https://www.youtube.com/watch?v=tJ2measnTc0&list=RDtJ2measnTc0&start_radio=1";
const KEEPER_URL =
  (import.meta.env.VITE_KEEPER_URL as string | undefined) ||
  "http://localhost:3100";
const COOLDOWN_KEY = "zenit:faucet:cooldown";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_LOCAL_CLAIMS_PER_24H = 5;

function parseRecipientAddress(input: string): { recipientAddress: string; cooldownKey: string } {
  const trimmed = input.trim();

  // Hedera Account ID: 0.0.x
  if (/^0\.0\.\d+$/.test(trimmed)) {
    return { recipientAddress: trimmed, cooldownKey: trimmed.toLowerCase() };
  }

  // EVM address: accept both no-checksum and checksum
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return { recipientAddress: trimmed, cooldownKey: trimmed.toLowerCase() };
  }

  throw new Error("Invalid recipient format. Use Hedera Account ID (0.0.x) or EVM address (0x...).");
}

type Step = 1 | 2 | 3;

type FaucetState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "sending" }
  | { status: "confirming"; txHash: string }
  | { status: "success"; txHash: string }
  | { status: "error"; message: string };

// ─── Small reusable pieces ─────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="ml-2 shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition"
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function CodeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-[#0a0c17] border border-[#2a2d45] px-3 py-2 text-xs">
      <span className="text-slate-500 shrink-0 w-28">{label}</span>
      <span className="font-mono text-emerald-400 truncate flex-1">{value}</span>
      <CopyButton text={value} />
    </div>
  );
}

function StepBadge({ n, active, done }: { n: Step; active: boolean; done: boolean }) {
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition ${
        done
          ? "bg-emerald-500 text-white"
          : active
          ? "bg-blue-500 text-white"
          : "bg-[#1e2033] text-slate-500 border border-[#363a59]"
      }`}
    >
      {done ? "✓" : n}
    </div>
  );
}

// ─── Step 1: Install EVM Wallet ─────────────────────────────────────────────

function Step1() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Use <span className="text-blue-400 font-semibold">HashPack</span> wallet for Hedera.
        If you connect an EVM wallet, use the Hedera Testnet settings below.
      </p>

      <div className="space-y-2">
        <CodeRow label="Network name" value="Hedera Testnet" />
        <CodeRow label="RPC URL" value="https://testnet.hashio.io/api" />
        <CodeRow label="Chain ID" value="296" />
        <CodeRow label="Currency symbol" value="HBAR" />
        <CodeRow label="Block explorer" value="https://hashscan.io/testnet" />
      </div>

    </div>
  );
}

// ─── Step 2: Get HBAR Faucet ────────────────────────────────────────────────

function Step2() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        You need a small amount of <span className="text-amber-400 font-semibold">HBAR</span>{" "}
        (native token) to pay for gas fees on Hedera Testnet. Use Hedera Portal Faucet
        to get free testnet tokens.
      </p>

      <div className="rounded-xl border border-[#363a59] bg-[#0a0c17] p-4 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Faucet URL</span>
          <a
            href="https://portal.hedera.com/faucet"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 hover:underline"
          >
            portal.hedera.com/faucet ↗
          </a>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Network</span>
          <span className="text-white">Hedera Testnet</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Chain</span>
          <span className="text-white">EVM (Chain ID 296)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Amount</span>
          <span className="text-emerald-400 font-semibold">Portal-defined test HBAR amount</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Cooldown</span>
          <span className="text-white">Once every 24 hours</span>
        </div>
      </div>

      <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
        <li>Open the faucet link above.</li>
        <li>Select <strong className="text-white">Hedera Testnet</strong> as the network.</li>
        <li>Use your Hedera Account ID (format <strong className="text-white">0.0.x</strong>).</li>
        <li>Enter your Account ID and complete the captcha.</li>
        <li>Click <strong className="text-white">Request test HBAR</strong>.</li>
      </ol>

      <a
        href="https://portal.hedera.com/faucet"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold transition text-sm"
      >
        Open Hedera Faucet ↗
      </a>
    </div>
  );
}

// ─── Step 3: Get zUSDC ──────────────────────────────────────────────────────

function checkLocalCooldown(addr: string): { ok: boolean; remainingHours: number } {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    if (!raw) return { ok: true, remainingHours: 0 };
    const map: Record<string, number[]> = JSON.parse(raw);
    const now = Date.now();
    const recent = (map[addr.toLowerCase()] ?? []).filter((ts) => now - ts < COOLDOWN_MS);
    if (recent.length < MAX_LOCAL_CLAIMS_PER_24H) return { ok: true, remainingHours: 0 };
    const oldest = recent[0];
    return { ok: false, remainingHours: Math.ceil((COOLDOWN_MS - (now - oldest)) / 3_600_000) };
  } catch {
    return { ok: true, remainingHours: 0 };
  }
}

function markLocalCooldown(addr: string) {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    const map: Record<string, number[]> = raw ? JSON.parse(raw) : {};
    const key = addr.toLowerCase();
    const now = Date.now();
    const recent = (map[key] ?? []).filter((ts) => now - ts < COOLDOWN_MS);
    recent.push(now);
    map[key] = recent;
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map));
  } catch { /* quota */ }
}


function Step3() {
  const [walletInput, setWalletInput] = useState("");
  const [faucet, setFaucet] = useState<FaucetState>({ status: "idle" });

  const isValidAddr = /^0\.0\.\d+$/.test(walletInput.trim()) || /^0x[0-9a-fA-F]{40}$/.test(walletInput.trim());

  const handleClaim = useCallback(async () => {
    if (!isValidAddr) return;
    const parsed = parseRecipientAddress(walletInput);

    // 1. Check 24h cooldown stored in localStorage
    setFaucet({ status: "checking" });
    const cooldown = checkLocalCooldown(parsed.cooldownKey);
    if (!cooldown.ok) {
      setFaucet({
        status: "error",
        message: `Rate limit reached: this wallet already claimed 5 times in 24h. Try again in ~${cooldown.remainingHours}h.`,
      });
      return;
    }

    setFaucet({ status: "sending" });
    try {
      const resp = await fetch(`${KEEPER_URL}/faucet/zusdc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: walletInput.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.success || !data?.txHash) {
        throw new Error(data?.error || `Faucet request failed (${resp.status})`);
      }
      setFaucet({ status: "confirming", txHash: String(data.txHash) });
      markLocalCooldown(parsed.cooldownKey);
      setFaucet({ status: "success", txHash: String(data.txHash) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setFaucet({
        status: "error",
        message: msg.length > 250 ? msg.slice(0, 250) + "..." : msg,
      });
    }
  }, [walletInput, isValidAddr]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        To trade on Zenit Perpetual DEX you need{" "}
        <span className="text-blue-400 font-semibold">zUSDC</span> as collateral. Request{" "}
        <strong className="text-white">1,000 zUSDC</strong> for free below (up to 5 claims every 24 hours per wallet).
      </p>

      {/* Add token instruction */}
      <div className="rounded-xl border border-[#363a59] bg-[#0a0c17] p-3 space-y-2 text-xs">
        <p className="text-slate-400 font-semibold">
          Step A — Add zUSDC token to your wallet first:
        </p>
        <CodeRow label="Token ID" value={ZUSDC_TOKEN_ID} />
        <p className="text-slate-500 mt-1">
          In wallet/token import, use this token ID on Hedera Testnet.
        </p>
      </div>

      {/* Claim form */}
      <div className="space-y-2">
        <label className="block text-xs text-slate-400">Step B — Enter Hedera Account ID (0.0.x) or EVM address (0x...) to receive zUSDC:</label>
        <input
          type="text"
          value={walletInput}
          onChange={(e) => {
            setWalletInput(e.target.value);
            setFaucet({ status: "idle" });
          }}
          placeholder="0.0.x or 0x..."
          className={`w-full px-4 py-3 rounded-xl bg-[#121421] border text-white text-sm placeholder-slate-600 focus:outline-none transition ${
            walletInput.length > 0 && !isValidAddr
              ? "border-rose-500"
              : "border-[#363a59] focus:border-blue-500"
          }`}
        />
        {walletInput.length > 0 && !isValidAddr && (
          <p className="text-xs text-rose-400">Please enter valid `0.0.x` or `0x...` (no checksum/with checksum are both supported).</p>
        )}
      </div>

      <button
        type="button"
        onClick={handleClaim}
        disabled={!isValidAddr || faucet.status === "sending" || faucet.status === "checking" || faucet.status === "confirming" || faucet.status === "success"}
        className="w-full py-3 rounded-xl font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
      >
        {faucet.status === "checking"
          ? "Checking eligibility…"
          : faucet.status === "sending"
          ? "Broadcasting transaction…"
          : faucet.status === "confirming"
          ? "⏳ Waiting for on-chain confirmation…"
          : faucet.status === "success"
          ? "✓ 1,000 zUSDC Sent!"
          : "Get 1,000 zUSDC"}
      </button>

      {/* Confirming — TX broadcast, waiting for block */}
      {faucet.status === "confirming" && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-semibold">
            <svg className="h-5 w-5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            </svg>
            Transaction sent — waiting for confirmation…
          </div>
          <p className="text-slate-400 text-xs">
            Hedera Testnet can take 1-3 minutes to confirm. You can track the transaction:
          </p>
          <a
            href={`${EXPLORER}/${faucet.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-400 text-xs hover:text-blue-300 hover:underline font-mono break-all"
          >
            {faucet.txHash}
          </a>
        </div>
      )}

      {/* Success */}
      {faucet.status === "success" && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            1,000 zUSDC successfully sent to your wallet!
          </div>
          <p className="text-slate-400 text-xs">
            It may take a few seconds to appear. Confirm the transaction on-chain:
          </p>
          <a
            href={`${EXPLORER}/${faucet.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-400 text-xs hover:text-blue-300 hover:underline font-mono break-all"
          >
            {faucet.txHash}
          </a>
          <div className="pt-2 border-t border-[#363a59]">
            <p className="text-slate-400 text-xs mb-2">
              You are now ready to trade! Watch the tutorial to get started:
            </p>
            <a
              href={YOUTUBE_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 w-full justify-center py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              Watch Tutorial on YouTube ↗
            </a>
          </div>
        </div>
      )}

      {/* Error */}
      {faucet.status === "error" && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-3 text-xs space-y-2">
          <p className="text-rose-400 font-semibold">Request failed</p>
          <p className="text-slate-400">{faucet.message}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main widget ────────────────────────────────────────────────────────────

export default function SetupGuideWidget() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);

  const steps: { label: string; desc: string }[] = [
    { label: "Install Wallet", desc: "Connect HashPack to Hedera Testnet" },
    { label: "Get HBAR", desc: "Claim gas tokens from Hedera Faucet" },
    { label: "Get zUSDC", desc: "Receive 1,000 zUSDC test collateral" },
  ];

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-50 group flex items-center gap-2 rounded-full border border-blue-500/40 bg-[#0d0f18]/90 px-4 py-2.5 text-sm font-semibold text-blue-400 shadow-lg shadow-blue-900/20 backdrop-blur-md transition hover:bg-blue-600 hover:text-white hover:border-blue-400"
        aria-label="Open setup guide"
      >
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Setup Guide</span>
        {/* Pulse dot */}
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
        </span>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-start sm:items-center sm:justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-[#0d0f18] border border-[#363a59] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#363a59] shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">Getting Started</h2>
                <p className="text-xs text-slate-500 mt-0.5">Follow these steps to start trading on Zenit Perp DEX</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-white transition"
                aria-label="Close guide"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            {/* Step tabs */}
            <div className="flex gap-1 px-6 pt-4 pb-2 shrink-0">
              {steps.map((s, i) => {
                const n = (i + 1) as Step;
                const isActive = step === n;
                const isDone = step > n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStep(n)}
                    className={`flex-1 flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-center transition border ${
                      isActive
                        ? "border-blue-500/50 bg-blue-500/10"
                        : isDone
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-[#1e2033] bg-transparent hover:bg-[#1a1d2e]"
                    }`}
                  >
                    <StepBadge n={n} active={isActive} done={isDone} />
                    <span className={`text-[10px] font-semibold leading-tight ${isActive ? "text-blue-400" : isDone ? "text-emerald-400" : "text-slate-500"}`}>
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Step title */}
            <div className="px-6 pt-2 pb-3 shrink-0">
              <h3 className="text-base font-semibold text-white">
                Step {step}: {steps[step - 1].label}
              </h3>
              <p className="text-xs text-slate-500">{steps[step - 1].desc}</p>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 px-6 pb-4">
              {step === 1 && <Step1 />}
              {step === 2 && <Step2 />}
              {step === 3 && <Step3 />}
            </div>

            {/* Footer nav */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#363a59] shrink-0">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(1, s - 1) as Step)}
                disabled={step === 1}
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-[#363a59] text-slate-400 hover:text-white hover:bg-[#1e2033] disabled:opacity-30 transition"
              >
                ← Back
              </button>
              <span className="text-xs text-slate-600">{step} / 3</span>
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(3, s + 1) as Step)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
                >
                  Done ✓
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
