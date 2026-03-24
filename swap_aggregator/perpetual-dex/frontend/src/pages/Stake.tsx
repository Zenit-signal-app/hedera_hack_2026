import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { BaseError, formatUnits, parseUnits } from "viem";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CONTRACTS, STAKING_CONTRACT_HEDERA_ID, hashscanTestnetContract } from "@/config/contracts";
import { ERC20_ABI } from "@/abis/Token";
import { ZUSDC_STAKING_ABI } from "@/abis/ZUSDCStaking";
import { hashgraphWalletConnect } from "@/lib/hashgraphWalletConnect";
import HashPackConnectButton from "@/components/HashPackConnectButton";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** Seconds in a Julian year (common for DeFi APR). */
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

const POLL_MS = 4_000;

/** Mirror REST base (testnet default). Override with VITE_HEDERA_MIRROR_REST if needed. */
const MIRROR_REST =
  (import.meta.env.VITE_HEDERA_MIRROR_REST as string | undefined)?.trim() || "https://testnet.mirrornode.hedera.com";
const ZUSDC_HTS_ID = (import.meta.env.VITE_ZUSDC_TOKEN_ID as string | undefined)?.trim();

/** Approve allowance cap (human zUSDC). Avoids maxUint256 which some Hedera HTS ERC-20 facades reject. */
const APPROVE_CAP_HUMAN = "100000000";

/** Contract calls routed through `exec` / wagmi / HashPack. */
type StakeExecFn = "approve" | "stake" | "withdraw" | "getReward" | "exit";

function normTokenId(s: string): string {
  return s.replace(/\s/g, "");
}

function isConfiguredStaking(addr: string | undefined): addr is `0x${string}` {
  return Boolean(addr && addr.toLowerCase() !== ZERO.toLowerCase());
}

/** Pool APR % = (rewardRate / totalStaked) * secondsPerYear * 100 */
function poolAprPercent(rewardRate: bigint, totalStaked: bigint): number | null {
  if (totalStaked <= 0n || rewardRate <= 0n) return null;
  const r = Number(rewardRate);
  const t = Number(totalStaked);
  if (!Number.isFinite(r) || !Number.isFinite(t) || t === 0) return null;
  return (r / t) * SECONDS_PER_YEAR * 100;
}

/** APR % if `additionalStake` is added (marginal pool size). */
function marginalAprPercent(rewardRate: bigint, totalStaked: bigint, additionalStake: bigint): number | null {
  const next = totalStaked + additionalStake;
  return poolAprPercent(rewardRate, next);
}

/**
 * Continuous-compounding APY from APR %.
 * For very large APR (thin pool), e^APR overflows — return null and show "—" for APY.
 */
function apyFromAprPercent(aprPercent: number): number | null {
  if (!Number.isFinite(aprPercent) || aprPercent > 10_000) return null;
  const r = aprPercent / 100;
  if (r > 700) return null;
  const apy = (Math.exp(r) - 1) * 100;
  return Number.isFinite(apy) ? apy : null;
}

/** Token amount from `formatUnits`: integer part with thousands separators, fractional trimmed (max `maxFrac` digits). */
function formatUnitsPretty(unitsStr: string, maxFrac = 8): string {
  const [w, f = ""] = unitsStr.split(".");
  const intPart = w === "" ? "0" : w;
  let frac = f.slice(0, maxFrac).replace(/0+$/, "");
  try {
    const intFmt = BigInt(intPart).toLocaleString("en-US");
    if (!frac) return intFmt;
    return `${intFmt}.${frac}`;
  } catch {
    return unitsStr;
  }
}

/** APR / APY % with thousands separators and fixed decimal places (e.g. 202,916.63%). */
function formatPct(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n > 1e6) return ">1,000,000%";
  return `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/** RPC eth_call simulation often surfaces a clearer revert than the wallet receipt. */
function formatSimulateError(e: unknown): string {
  if (e instanceof BaseError) {
    return [e.shortMessage, e.details].filter(Boolean).join(" — ") || e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

function formatStakeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** `0.0.123@456.789` → HashScan path segment */
function hederaTxIdToHashscanUrl(txId: string): string {
  const normalized = txId.trim().replace("@", "-");
  return `https://hashscan.io/testnet/transaction/${normalized}`;
}

function extractHederaTxId(text: string): string | null {
  const m = text.match(/0\.0\.\d+@\d+\.\d+/);
  return m ? m[0] : null;
}

type RevertHelpProps = {
  rawMessage: string;
  stakingContractHasZusdc: boolean | null;
  parsedStakeAmount: bigint | null;
  allowance: bigint;
  walletBal: bigint | undefined;
  fmt: (v: bigint) => string;
};

function StakeRevertHelp({
  rawMessage,
  stakingContractHasZusdc,
  parsedStakeAmount,
  allowance,
  walletBal,
  fmt,
}: RevertHelpProps) {
  const txId = extractHederaTxId(rawMessage);
  const amt = parsedStakeAmount;
  const allowanceOk = amt != null ? allowance >= amt : null;
  const balanceOk = amt != null && walletBal !== undefined ? walletBal >= amt : null;

  return (
    <div className="space-y-3 text-sm text-rose-100/95">
      <p className="font-medium text-white">Transaction reverted (CONTRACT_REVERT_EXECUTED)</p>
      <p className="text-xs text-rose-200/80">
        HashPack often hides the real reason. Use the checklist and HashScan. If you already ran <code className="rounded bg-black/30 px-1">associateTokens</code> on the staking contract,
        the problem is usually: <strong className="text-white">Approve</strong>, <strong className="text-white">zUSDC associated in your wallet</strong>, or <strong className="text-white">balance</strong>.
        Withdraw/Claim also need your wallet associated to <strong className="text-white">receive</strong> zUSDC.
      </p>
      {txId && (
        <a
          href={hederaTxIdToHashscanUrl(txId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs font-medium text-sky-300 underline hover:text-sky-200"
        >
          Open transaction on HashScan →
        </a>
      )}
      <ul className="list-inside list-disc space-y-1.5 rounded-lg bg-black/30 px-3 py-2 text-xs text-rose-100/90">
        <li>
          Staking contract ↔ zUSDC (Mirror):{" "}
          {stakingContractHasZusdc === null ? (
            <span className="text-slate-400">checking…</span>
          ) : stakingContractHasZusdc ? (
            <span className="text-emerald-300">OK</span>
          ) : (
            <span className="text-amber-300">missing — owner runs associateStakingTokens script once</span>
          )}
        </li>
        <li>
          Allowance for this amount:{" "}
          {amt == null ? (
            <span className="text-slate-400">enter stake amount</span>
          ) : allowanceOk ? (
            <span className="text-emerald-300">OK</span>
          ) : (
            <span className="text-amber-300">too low — click Approve zUSDC</span>
          )}
        </li>
        <li>
          Wallet balance vs stake:{" "}
          {amt == null ? (
            <span className="text-slate-400">enter stake amount</span>
          ) : walletBal === undefined ? (
            <span className="text-slate-400">loading…</span>
          ) : balanceOk ? (
            <span className="text-emerald-300">OK ({fmt(walletBal)} zUSDC)</span>
          ) : (
            <span className="text-amber-300">
              insufficient ({fmt(walletBal)} &lt; {fmt(amt)})
            </span>
          )}
        </li>
      </ul>
      <p className="break-all font-mono text-[10px] text-rose-300/70">{rawMessage}</p>
    </div>
  );
}

export default function Stake() {
  const { address: wagmiAddress } = useAccount();
  const [wcAddress, setWcAddress] = useState(() => localStorage.getItem("zenit:wallet:evmAddress") ?? "");
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [stakeInput, setStakeInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  /** null = unknown / loading; false = mirror says staking contract has no zUSDC token relationship (stake will revert). */
  const [stakingContractHasZusdc, setStakingContractHasZusdc] = useState<boolean | null>(null);
  const [stakingLinkCheckNote, setStakingLinkCheckNote] = useState<string | null>(null);
  /** User Hedera account ↔ zUSDC (HTS) — required before ERC-20 approve often works in HashPack. */
  const [userHtsHasZusdc, setUserHtsHasZusdc] = useState<boolean | null>(null);
  /** Pre-claim confirmation dialog (full stake + reward summary). */
  const [claimConfirmOpen, setClaimConfirmOpen] = useState(false);
  /** exit() = withdraw all staked + getReward in one tx — confirmation dialog. */
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  /** withdraw(staked) — principal only — confirmation dialog. */
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);

  useEffect(() => {
    const onWallet = (e: Event) => {
      const d = (e as CustomEvent<{ evmAddress?: string }>).detail;
      if (d?.evmAddress != null) setWcAddress(d.evmAddress);
    };
    window.addEventListener("zenit-hashgraph-wallet", onWallet as EventListener);
    return () => window.removeEventListener("zenit-hashgraph-wallet", onWallet as EventListener);
  }, []);

  /** Keep wc EVM in sync if session was restored before this page mounted. */
  useEffect(() => {
    let cancelled = false;
    void hashgraphWalletConnect
      .restoreSession()
      .then((r) => {
        if (cancelled || !r?.evmAddress) return;
        if (/^0x[0-9a-fA-F]{40}$/i.test(r.evmAddress)) setWcAddress(r.evmAddress);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!claimConfirmOpen && !exitConfirmOpen && !withdrawConfirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setClaimConfirmOpen(false);
        setExitConfirmOpen(false);
        setWithdrawConfirmOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [claimConfirmOpen, exitConfirmOpen, withdrawConfirmOpen]);

  const hashPackConnected = hashgraphWalletConnect.isConnected();
  const isEvmAddr = (v: string | undefined): v is `0x${string}` =>
    Boolean(v && /^0x[0-9a-fA-F]{40}$/.test(v));

  /**
   * Must match the account that signs txs. When HashPack WC is active, prefer its EVM (`wcAddress`)
   * over wagmi — otherwise `earned`/`staked` can track account A while `getReward` executes as account B.
   */
  const address = (
    hashPackConnected && isEvmAddr(wcAddress)
      ? wcAddress
      : isEvmAddr(wagmiAddress)
        ? wagmiAddress
        : isEvmAddr(wcAddress)
          ? wcAddress
          : undefined
  ) as `0x${string}` | undefined;

  const stakingAddr = CONTRACTS.STAKING;
  const hasStaking = isConfiguredStaking(stakingAddr);

  /** Hedera: if staking contract is not associated with zUSDC (HTS), transferFrom reverts. */
  useEffect(() => {
    if (!hasStaking || !ZUSDC_HTS_ID) {
      setStakingContractHasZusdc(null);
      setStakingLinkCheckNote(
        ZUSDC_HTS_ID ? null : "Set VITE_ZUSDC_TOKEN_ID in frontend/.env to auto-check staking contract ↔ zUSDC association.",
      );
      return;
    }
    let cancelled = false;
    const targetId = normTokenId(ZUSDC_HTS_ID);

    const run = async () => {
      try {
        const url = `${MIRROR_REST}/api/v1/accounts/${stakingAddr}/tokens?limit=200`;
        const resp = await fetch(url);
        if (!resp.ok) {
          if (!cancelled) {
            setStakingContractHasZusdc(null);
            setStakingLinkCheckNote(`Mirror could not list tokens for staking contract (${resp.status}).`);
          }
          return;
        }
        const data = (await resp.json()) as { tokens?: { token_id?: string }[] };
        const tokens = data.tokens ?? [];
        const found = tokens.some((t) => t.token_id && normTokenId(t.token_id) === targetId);
        if (!cancelled) {
          setStakingContractHasZusdc(found);
          setStakingLinkCheckNote(null);
        }
      } catch (e) {
        if (!cancelled) {
          setStakingContractHasZusdc(null);
          setStakingLinkCheckNote(e instanceof Error ? e.message : "Mirror association check failed.");
        }
      }
    };

    void run();
    const id = setInterval(run, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hasStaking, stakingAddr]);

  useEffect(() => {
    if (!address || !ZUSDC_HTS_ID) {
      setUserHtsHasZusdc(null);
      return;
    }
    let cancelled = false;
    const targetId = normTokenId(ZUSDC_HTS_ID);
    const run = async () => {
      try {
        const url = `${MIRROR_REST}/api/v1/accounts/${address}/tokens?limit=200`;
        const resp = await fetch(url);
        if (!resp.ok) {
          if (!cancelled) setUserHtsHasZusdc(null);
          return;
        }
        const data = (await resp.json()) as { tokens?: { token_id?: string }[] };
        const found = (data.tokens ?? []).some((t) => t.token_id && normTokenId(t.token_id) === targetId);
        if (!cancelled) setUserHtsHasZusdc(found);
      } catch {
        if (!cancelled) setUserHtsHasZusdc(null);
      }
    };
    void run();
    const id = setInterval(run, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address, ZUSDC_HTS_ID]);

  const pollOpts = { refetchInterval: POLL_MS };

  const { data: decimals = 8 } = useReadContract({
    address: CONTRACTS.TOKEN,
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  const { data: walletBal, refetch: refetchWallet } = useReadContract({
    address: CONTRACTS.TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && hasStaking), ...pollOpts },
  });

  const { data: allowance = 0n, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.TOKEN,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && hasStaking ? [address, stakingAddr] : undefined,
    query: { enabled: Boolean(address && hasStaking), ...pollOpts },
  });

  const { data: staked = 0n, refetch: refetchStaked } = useReadContract({
    address: stakingAddr,
    abi: ZUSDC_STAKING_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && hasStaking), ...pollOpts },
  });

  const { data: earned = 0n, refetch: refetchEarned } = useReadContract({
    address: stakingAddr,
    abi: ZUSDC_STAKING_ABI,
    functionName: "earned",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && hasStaking), ...pollOpts },
  });

  const { data: totalStaked = 0n } = useReadContract({
    address: stakingAddr,
    abi: ZUSDC_STAKING_ABI,
    functionName: "totalSupply",
    query: { enabled: hasStaking, ...pollOpts },
  });

  const { data: rewardRate = 0n } = useReadContract({
    address: stakingAddr,
    abi: ZUSDC_STAKING_ABI,
    functionName: "rewardRate",
    query: { enabled: hasStaking, ...pollOpts },
  });

  const { data: periodFinish = 0n } = useReadContract({
    address: stakingAddr,
    abi: ZUSDC_STAKING_ABI,
    functionName: "periodFinish",
    query: { enabled: hasStaking, ...pollOpts },
  });

  const { data: rewardsDuration = 0n } = useReadContract({
    address: stakingAddr,
    abi: ZUSDC_STAKING_ABI,
    functionName: "rewardsDuration",
    query: { enabled: hasStaking, ...pollOpts },
  });

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const fmt = useCallback(
    (v: bigint) => {
      try {
        return formatUnitsPretty(formatUnits(v, decimals), 8);
      } catch {
        return "0";
      }
    },
    [decimals],
  );

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchWallet(), refetchAllowance(), refetchStaked(), refetchEarned()]);
  }, [refetchWallet, refetchAllowance, refetchStaked, refetchEarned]);

  const parsedStakeAmount = useMemo(() => {
    const s = stakeInput.trim();
    if (!s) return null;
    try {
      const a = parseUnits(s, decimals);
      return a > 0n ? a : null;
    } catch {
      return null;
    }
  }, [stakeInput, decimals]);

  const poolApr = useMemo(() => poolAprPercent(rewardRate, totalStaked), [rewardRate, totalStaked]);
  const poolApy = useMemo(() => (poolApr != null ? apyFromAprPercent(poolApr) : null), [poolApr]);
  /** Same reward/sec split over little TVL → huge %; mathematically correct but not “annual yield” you’d get if TVL stayed tiny all year. */
  const thinPoolExtremeApr = poolApr != null && poolApr > 5_000;

  const aprIfYouStake = useMemo(() => {
    if (!parsedStakeAmount) return null;
    return marginalAprPercent(rewardRate, totalStaked, parsedStakeAmount);
  }, [rewardRate, totalStaked, parsedStakeAmount]);

  const apyIfYouStake = useMemo(
    () => (aprIfYouStake != null ? apyFromAprPercent(aprIfYouStake) : null),
    [aprIfYouStake],
  );

  /** Your share of reward emission per second (zUSDC/s, raw then formatted). */
  const userRewardPerSec = useMemo(() => {
    if (totalStaked <= 0n || staked <= 0n || rewardRate <= 0n) return 0n;
    return (rewardRate * staked) / totalStaked;
  }, [rewardRate, totalStaked, staked]);

  const periodEndSec = Number(periodFinish > 2n ** 63n ? 0n : periodFinish);
  const secondsLeft = periodEndSec > 0 ? Math.max(0, periodEndSec - nowSec) : 0;
  const periodActive = periodEndSec > 0 && nowSec < periodEndSec && rewardRate > 0n;

  const needsApprove = useMemo(() => {
    if (!parsedStakeAmount) return false;
    return allowance < parsedStakeAmount;
  }, [parsedStakeAmount, allowance]);

  /** Mirror says user account has no zUSDC token relationship — ERC-20 approve in HashPack often reverts. */
  const mustAssociateFirst = Boolean(hashPackConnected && ZUSDC_HTS_ID && userHtsHasZusdc === false);

  const runHashPack = async (fn: StakeExecFn, args: readonly unknown[]) => {
    const target = fn === "approve" ? CONTRACTS.TOKEN : stakingAddr;
    const abi = fn === "approve" ? ERC20_ABI : ZUSDC_STAKING_ABI;
    setBusy(fn);
    setMsg(null);
    try {
      const gas = fn === "approve" ? 4_000_000 : 8_000_000;
      await hashgraphWalletConnect.executeContractCall(target, abi as readonly unknown[], fn, args, gas);
      // Hedera finality: allowance/balance reads can lag right after approve — wait then refetch twice.
      if (fn === "approve") {
        await new Promise((r) => setTimeout(r, 2500));
        await refetchAllowance();
        await new Promise((r) => setTimeout(r, 800));
        await refetchAllowance();
      }
      if (fn === "getReward" || fn === "exit") {
        await new Promise((r) => setTimeout(r, 2500));
        await refetchEarned();
        await refetchStaked();
        await refetchWallet();
        await new Promise((r) => setTimeout(r, 1500));
        await refetchEarned();
        await refetchStaked();
        await refetchWallet();
      }
      await refetchAll();
      setMsg(
        fn === "getReward"
          ? "getReward confirmed. zUSDC should appear in your wallet (add the token in HashPack if hidden). If pending rewards still show, wait ~10s and refresh."
          : fn === "exit"
            ? "exit confirmed: unstaked principal + rewards sent to your wallet (if any). Add zUSDC in HashPack if not visible."
            : `${fn} submitted successfully.`,
      );
    } catch (e) {
      setMsg(formatStakeError(e));
    } finally {
      setBusy(null);
    }
  };

  const runWagmi = async (fn: StakeExecFn, args: readonly unknown[]) => {
    if (!address) return;
    setBusy(fn);
    setMsg(null);
    try {
      const target = fn === "approve" ? CONTRACTS.TOKEN : stakingAddr;
      const abi = fn === "approve" ? ERC20_ABI : ZUSDC_STAKING_ABI;
      const gas = fn === "approve" ? 4_000_000n : 8_000_000n;
      const hash = await writeContractAsync({
        address: target,
        abi: abi as never,
        functionName: fn,
        args: args as never,
        gas,
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      if (fn === "approve") {
        await new Promise((r) => setTimeout(r, 2500));
        await refetchAllowance();
        await new Promise((r) => setTimeout(r, 800));
        await refetchAllowance();
      }
      if (fn === "getReward" || fn === "exit") {
        await new Promise((r) => setTimeout(r, 2500));
        await refetchEarned();
        await refetchStaked();
        await refetchWallet();
        await new Promise((r) => setTimeout(r, 1500));
        await refetchEarned();
        await refetchStaked();
        await refetchWallet();
      }
      await refetchAll();
      setMsg(
        fn === "getReward"
          ? "getReward confirmed. zUSDC should appear in your wallet (add the token in HashPack if hidden). If pending rewards still show, wait ~10s and refresh."
          : fn === "exit"
            ? "exit confirmed: unstaked principal + rewards sent to your wallet (if any). Add zUSDC in HashPack if not visible."
            : `${fn} confirmed.`,
      );
    } catch (e) {
      setMsg(formatStakeError(e));
    } finally {
      setBusy(null);
    }
  };

  const exec = async (fn: StakeExecFn, args: readonly unknown[]) => {
    if (hashgraphWalletConnect.isConnected()) {
      await runHashPack(fn, args);
    } else {
      await runWagmi(fn, args);
    }
  };

  const onAssociateZusdc = async () => {
    if (!ZUSDC_HTS_ID || !hashgraphWalletConnect.isConnected()) {
      setMsg("Connect HashPack and set VITE_ZUSDC_TOKEN_ID in .env.");
      return;
    }
    setBusy("associate");
    setMsg(null);
    try {
      const tid = await hashgraphWalletConnect.associateHtsToken(ZUSDC_HTS_ID);
      await refetchWallet();
      await new Promise((r) => setTimeout(r, 2000));
      if (address) {
        try {
          const url = `${MIRROR_REST}/api/v1/accounts/${address}/tokens?limit=200`;
          const resp = await fetch(url);
          if (resp.ok) {
            const data = (await resp.json()) as { tokens?: { token_id?: string }[] };
            const targetId = normTokenId(ZUSDC_HTS_ID);
            const found = (data.tokens ?? []).some((t) => t.token_id && normTokenId(t.token_id) === targetId);
            setUserHtsHasZusdc(found);
          } else {
            setUserHtsHasZusdc(true);
          }
        } catch {
          setUserHtsHasZusdc(true);
        }
      } else {
        setUserHtsHasZusdc(true);
      }
      setMsg(
        tid === "already-associated"
          ? "zUSDC was already associated with your account. Continue with Approve."
          : "zUSDC associated (HTS). Next: Step 1 — Approve zUSDC.",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onApprove = async () => {
    if (!address || !hasStaking) return;
    const cap = parseUnits(APPROVE_CAP_HUMAN, decimals);
    if (publicClient && address) {
      try {
        await publicClient.simulateContract({
          address: CONTRACTS.TOKEN,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [stakingAddr, cap],
          account: address,
        });
      } catch (e) {
        setMsg(
          `Approve simulation failed: ${formatSimulateError(e)}. On Hedera, associate zUSDC with your account first (Step 0), then try Approve again.`,
        );
        return;
      }
    }
    await exec("approve", [stakingAddr, cap]);
  };

  const onStake = async () => {
    if (!address || !hasStaking || !stakeInput.trim()) {
      setMsg("Enter an amount of zUSDC to stake.");
      return;
    }
    let amt: bigint;
    try {
      amt = parseUnits(stakeInput.trim(), decimals);
    } catch {
      setMsg("Invalid number.");
      return;
    }
    if (amt <= 0n) {
      setMsg("Amount must be greater than zero.");
      return;
    }
    /** Fresh allowance from RPC — React Query `allowance` is often stale right after Approve. */
    let allowNow = allowance;
    if (publicClient && address) {
      try {
        allowNow = await publicClient.readContract({
          address: CONTRACTS.TOKEN,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, stakingAddr],
        });
      } catch {
        const r = await refetchAllowance();
        allowNow = (r.data as bigint | undefined) ?? allowance;
      }
    } else {
      const r = await refetchAllowance();
      allowNow = (r.data as bigint | undefined) ?? allowance;
    }
    if (mustAssociateFirst) {
      setMsg("Complete Step 0 — Associate zUSDC (HTS) in HashPack first, then Approve and Stake.");
      return;
    }
    if (allowNow < amt) {
      setMsg(
        `Allowance (${fmt(allowNow)} zUSDC) is below stake amount (${fmt(amt)}). Click Approve zUSDC, wait until HashPack shows success, wait ~5 seconds, then Stake again.`,
      );
      return;
    }
    if (walletBal !== undefined && walletBal < amt) {
      setMsg(`Insufficient zUSDC balance (wallet: ${fmt(walletBal)}, stake: ${fmt(amt)}).`);
      return;
    }
    if (publicClient && address) {
      try {
        await publicClient.simulateContract({
          address: stakingAddr,
          abi: ZUSDC_STAKING_ABI,
          functionName: "stake",
          args: [amt],
          account: address,
        });
      } catch (e) {
        setMsg(
          `Simulation failed (same as on-chain revert): ${formatSimulateError(e)}. ` +
            "Common: approve allowance; zUSDC associated in your wallet; contract associateTokens done; enough HBAR for gas.",
        );
        return;
      }
    }
    await exec("stake", [amt]);
    setStakeInput("");
  };

  const onWithdrawClick = () => {
    if (!hasStaking || staked <= 0n) return;
    setStakeInput("");
    setWithdrawConfirmOpen(true);
  };

  const confirmWithdrawAll = async () => {
    if (!hasStaking || staked <= 0n) return;
    setWithdrawConfirmOpen(false);
    await exec("withdraw", [staked]);
  };

  const onClaimClick = () => {
    if (!hasStaking || earned <= 0n) return;
    /** Avoid showing Stake “Approve” while claiming — Approve is only for new stake above. */
    setStakeInput("");
    setClaimConfirmOpen(true);
  };

  const confirmClaimRewards = async () => {
    if (!hasStaking) return;
    setClaimConfirmOpen(false);
    await exec("getReward", []);
  };

  const onExitClick = () => {
    if (!hasStaking || (staked <= 0n && earned <= 0n)) return;
    setStakeInput("");
    setExitConfirmOpen(true);
  };

  const confirmExitAll = async () => {
    if (!hasStaking) return;
    setExitConfirmOpen(false);
    await exec("exit", []);
  };

  const periodEndLabel =
    periodEndSec > 0 ? new Date(periodEndSec * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

  const fmtDuration = (sec: number) => {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const successMsg = (m: string) => m.includes("success") || m.includes("confirmed");

  if (!hasStaking) {
    return (
      <div className="mx-auto max-w-xl px-4 pb-16 pt-8">
        <div className="rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-950/50 to-[#0c0e14] p-8 shadow-xl">
          <h1 className="text-xl font-bold text-white">Stake zUSDC</h1>
          <p className="mt-3 text-sm leading-relaxed text-amber-100/90">
            Staking contract is not configured. Deploy <code className="rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-xs">ZUSDCStaking</code> and set{" "}
            <code className="rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-xs">VITE_STAKING_ADDRESS</code> in{" "}
            <code className="rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-xs">frontend/.env</code>, then restart the dev server.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-black/50 p-4 text-xs text-slate-300">
            npx hardhat run scripts/deployStaking.ts --network hederaTestnet{"\n"}
            npx hardhat run scripts/fundStakingRewards.ts --network hederaTestnet
          </pre>
        </div>
      </div>
    );
  }

  const epochDaysLabel =
    rewardsDuration > 0n && rewardsDuration <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Math.round(Number(rewardsDuration) / 86400).toLocaleString("en-US")
      : "—";

  const shortAddr = (a: string | undefined) =>
    a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : (a ?? "—");

  return (
    <>
    <div className="mx-auto max-w-2xl space-y-6 px-4 pb-16 pt-4 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-slate-900/95 via-[#0f1219] to-[#080a0f] p-6 shadow-2xl shadow-black/40 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/[0.12] blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-violet-600/[0.08] blur-3xl" aria-hidden />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">Hedera · Staking</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Stake zUSDC</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
            Earn zUSDC rewards while your collateral stays in the pool. Rewards are funded by the owner via{" "}
            <code className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-xs text-emerald-200/90">fundRewards</code> (testnet).
          </p>
          <p className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">1. Enter amount</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">2. Approve</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">3. Stake</span>
          </p>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            HashPack: zUSDC must be <strong className="text-slate-300">associated</strong> with your account. Withdraw/Claim also require association to receive tokens.
          </p>
        </div>
      </div>

      {/* Contract identity + staking / reward explainer */}
      <div className="rounded-3xl border border-white/[0.06] bg-gradient-to-b from-[#111318] via-[#0c0e14] to-[#080a0f] p-5 shadow-inner sm:p-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-400/90">Before you stake</h2>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-400">
          <p>
            <strong className="text-slate-200">What is zUSDC staking?</strong> You deposit{" "}
            <strong className="text-emerald-200/90">zUSDC</strong> (Hedera HTS ERC-20) into the on-chain{" "}
            <strong className="text-slate-200">ZUSDCStaking</strong> contract. Your staked balance is your share of the pool. Rewards are paid in the{" "}
            <strong className="text-amber-200/90">same zUSDC</strong> when the reward period is active and funded by the contract owner (typical flow:{" "}
            <code className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">notifyRewardAmount</code> /{" "}
            <code className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">fundRewards</code> on testnet).
          </p>
          <p>
            <strong className="text-slate-200">How rewards work.</strong> Emission accrues over time; your{" "}
            <strong className="text-white">pending rewards</strong> grow with your share of{" "}
            <strong className="text-slate-300">total staked</strong>.{" "}
            <span className="text-slate-300">Claim rewards</span> transfers only rewards to your wallet.{" "}
            <span className="text-slate-300">Withdraw all</span> returns your staked principal (separate from claiming). APR/APY on this page are{" "}
            <strong className="text-slate-300">instantaneous estimates</strong>, not guaranteed yearly returns—on testnet, low TVL can make APR look very high.
          </p>
          <p className="text-xs text-slate-500">
            You remain exposed to smart-contract and network risk. This interface is informational; always verify addresses on{" "}
            <a href="https://hashscan.io/testnet" target="_blank" rel="noreferrer" className="text-emerald-400/90 underline underline-offset-2 hover:text-emerald-300">
              HashScan
            </a>
            .
          </p>
        </div>
        <div className="mt-5 rounded-2xl border border-emerald-500/15 bg-black/30 px-4 py-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Staking contract (verify on-chain)</p>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Staking contract address (EVM)</dt>
              <dd className="mt-1 break-all font-mono text-[11px] leading-snug text-emerald-200/95 sm:text-xs">
                <a
                  href={hashscanTestnetContract(CONTRACTS.STAKING)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-emerald-500/35 underline-offset-2 hover:text-emerald-100"
                >
                  {CONTRACTS.STAKING}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Staking contract ID (Hedera)</dt>
              <dd className="mt-1 font-mono text-sm text-slate-200">
                <a
                  href={hashscanTestnetContract(STAKING_CONTRACT_HEDERA_ID)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-white/20 underline-offset-2 hover:text-white"
                >
                  {STAKING_CONTRACT_HEDERA_ID}
                </a>
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Both links open the same contract on HashScan (EVM long-zero address vs. <code className="rounded bg-white/5 px-1 font-mono text-[10px]">shard.realm.num</code> id). Check token associations and recent transactions before staking.
          </p>
        </div>
      </div>

      {stakingContractHasZusdc === false && (
        <div className="rounded-3xl border border-rose-500/40 bg-rose-950/50 p-5 text-sm text-rose-100 shadow-lg shadow-rose-950/20">
          <p className="font-semibold text-white">Staking contract is not associated with zUSDC (HTS)</p>
          <p className="mt-2 text-rose-100/90">
            On Hedera, <code className="rounded bg-black/30 px-1">stake()</code> uses ERC-20 <code className="rounded bg-black/30 px-1">transferFrom</code> into the contract. If the contract never associated zUSDC, the transfer reverts with{" "}
            <code className="rounded bg-black/30 px-1">CONTRACT_REVERT_EXECUTED</code> even after Approve.
          </p>
          <p className="mt-2 text-xs text-rose-200/80">
            <strong className="text-white">Fix (owner wallet):</strong> run once from <code className="rounded bg-black/30 px-1">perpetual-dex/</code>:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-black/50 p-3 text-[11px] text-slate-200">
            npx hardhat run scripts/associateStakingTokens.ts --network hederaTestnet
          </pre>
          <p className="mt-2 text-xs text-rose-200/70">
            Or run <code className="rounded bg-black/30 px-1">fundStakingRewards.ts</code> without <code className="rounded bg-black/30 px-1">SKIP_ASSOCIATE=1</code> — it calls <code className="rounded bg-black/30 px-1">associateTokens()</code> first.
          </p>
        </div>
      )}
      {stakingLinkCheckNote && (
        <p className="rounded-xl border border-slate-600/50 bg-slate-900/50 px-3 py-2 text-xs text-slate-400">{stakingLinkCheckNote}</p>
      )}

      {/* APY / APR */}
      <div className="rounded-3xl border border-emerald-500/25 bg-gradient-to-b from-emerald-950/40 via-[#0c0f16] to-[#080a10] p-5 shadow-lg shadow-emerald-950/20 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-400/90">Estimated yield · current epoch</h2>
          <span className="text-[10px] text-slate-500">Updates ~{POLL_MS / 1000}s</span>
        </div>
        <details className="mt-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-[11px] text-slate-500 open:bg-black/30">
          <summary className="cursor-pointer list-none font-medium text-slate-400 marker:text-emerald-500/70">
            How APR / APY are calculated
          </summary>
          <p className="mt-2 leading-relaxed">
            <strong className="text-slate-400">APR</strong> = (reward emission per second ÷ total staked) × 365.25 days. Numbers use US-style grouping (e.g.{" "}
            <span className="font-mono text-slate-300">202,916.63%</span>). <strong className="text-slate-400">APY</strong> uses continuous compounding (e<sup>APR</sup> − 1) when APR ≤ 10,000%; otherwise &quot;—&quot; (overflow).
          </p>
        </details>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-500/15 bg-black/30 px-4 py-4 shadow-inner">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Pool APR</div>
            <div className="mt-1 tabular-nums text-2xl font-bold tracking-tight text-emerald-300 sm:text-3xl">{formatPct(poolApr)}</div>
          </div>
          <div className="rounded-2xl border border-teal-500/15 bg-black/30 px-4 py-4 shadow-inner">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Pool APY (est.)</div>
            <div className="mt-1 tabular-nums text-2xl font-bold tracking-tight text-teal-300 sm:text-3xl">{formatPct(poolApy)}</div>
          </div>
        </div>
        {thinPoolExtremeApr && (
          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
            <p className="text-xs font-semibold text-amber-200">Why is APR so high?</p>
            <p className="mt-1.5 text-xs leading-relaxed text-amber-100/80">
              Same rewards per second ÷ small <strong className="text-white">total staked</strong> ⇒ huge %. On testnet this is normal; as TVL grows, APR falls. This is an <strong className="text-white">instantaneous</strong> rate, not a guaranteed annual return.
            </p>
          </div>
        )}
        {parsedStakeAmount != null && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Marginal · if you stake {fmt(parsedStakeAmount)} zUSDC now
            </div>
            <div className="mt-2 flex flex-wrap gap-6 text-sm">
              <span className="text-slate-400">
                APR{" "}
                <span className="tabular-nums font-semibold text-emerald-200">{formatPct(aprIfYouStake)}</span>
              </span>
              <span className="text-slate-400">
                APY{" "}
                <span className="tabular-nums font-semibold text-teal-200">{formatPct(apyIfYouStake)}</span>
              </span>
            </div>
          </div>
        )}
        {!periodActive && (
          <p className="mt-3 text-xs text-amber-200/80">No active reward period or emission ended — APR may show &quot;—&quot;.</p>
        )}
      </div>

      {!address ? (
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-slate-900/95 via-[#0f1219] to-[#080a0f] px-6 py-12 text-center shadow-xl shadow-black/30 sm:px-10 sm:py-14">
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-emerald-500/[0.10] blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-violet-600/[0.07] blur-3xl" aria-hidden />
          <div className="relative mx-auto max-w-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/85">Connect wallet</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Connect a wallet (e.g. HashPack) to view your stake and rewards.
            </p>
            <div className="mt-8 flex justify-center">
              <HashPackConnectButton align="center" />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-amber-500/20 bg-gradient-to-b from-amber-950/30 to-transparent p-5 shadow-lg shadow-amber-950/10">
              <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-400/90">Your rewards · live</h2>
              <p className="mt-1 text-[11px] text-slate-500">On-chain refresh ~{POLL_MS / 1000}s</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-3">
                  <span className="text-slate-400">Pending claim</span>
                  <span className="tabular-nums font-medium text-amber-200">{fmt(earned)} zUSDC</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-3">
                  <span className="text-slate-400">Est. reward rate</span>
                  <span className="tabular-nums text-right text-amber-200/90">
                    {staked > 0n && totalStaked > 0n ? `${fmt(userRewardPerSec)} / sec` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">Your staked</span>
                  <span className="tabular-nums font-semibold text-emerald-300">{fmt(staked)} zUSDC</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-700/50 bg-[#0b0d14] p-5 shadow-inner">
              <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Pool &amp; epoch</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Wallet zUSDC</span>
                  <span className="tabular-nums font-medium text-white">{fmt(walletBal ?? 0n)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Total pool staked</span>
                  <span className="tabular-nums font-medium text-white">{fmt(totalStaked)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Epoch duration</span>
                  <span className="tabular-nums text-slate-300">{epochDaysLabel} days</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Epoch ends</span>
                  <span className="max-w-[55%] text-right text-xs text-slate-300">{periodEndLabel}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Time left</span>
                  <span className="tabular-nums font-mono text-sm text-slate-200">
                    {secondsLeft > 0 ? fmtDuration(secondsLeft) : periodEndSec > 0 ? "ended" : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-700/60 bg-[#0e1018] p-5 shadow-xl sm:p-6">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Amount to stake (zUSDC)</label>
            <input
              type="text"
              inputMode="decimal"
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
              className="mt-3 w-full rounded-2xl border border-slate-600/50 bg-[#080a12] px-4 py-3 text-lg tabular-nums text-white shadow-inner outline-none ring-0 transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="0.00"
            />
            {parsedStakeAmount != null && (
              <p className="mt-2 font-mono text-xs text-slate-400">
                Allowance (staking contract can spend): <span className="text-slate-200">{fmt(allowance)}</span> zUSDC · This
                stake needs: <span className="text-slate-200">{fmt(parsedStakeAmount)}</span> zUSDC
                {needsApprove ? (
                  <span className="ml-1 text-amber-300"> — not approved yet</span>
                ) : (
                  <span className="ml-1 text-emerald-400/90"> — OK</span>
                )}
              </p>
            )}
            <p className="mt-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              <strong className="text-slate-400">Approve</strong> only appears when you{" "}
              <strong className="text-slate-300">type a new stake amount</strong> that needs allowance. It is not used for{" "}
              <strong className="text-slate-300">Claim rewards</strong>, <strong className="text-slate-300">Withdraw</strong>, or{" "}
              <strong className="text-slate-300">Exit</strong>. Clear the field above if you only want to claim.
              <span className="mt-1 block text-slate-600">
                VN: Nút Approve chỉ cho stake mới — không liên quan claim/rút. Xóa số ô stake nếu chỉ muốn claim.
              </span>
            </p>
            {hashPackConnected && ZUSDC_HTS_ID && userHtsHasZusdc === null && (
              <p className="mt-1 text-[11px] text-slate-500">Checking zUSDC (HTS) association for your wallet…</p>
            )}
            {hashPackConnected && ZUSDC_HTS_ID && userHtsHasZusdc === true && (
              <p className="mt-1 text-[11px] text-emerald-500/80">Mirror: your account is associated with zUSDC (HTS).</p>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              {mustAssociateFirst ? (
                <>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => onAssociateZusdc()}
                    className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-violet-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 hover:from-violet-500 hover:to-violet-400 disabled:opacity-50 sm:w-auto"
                  >
                    {busy === "associate" ? "…" : "Step 0 — Associate zUSDC (HTS)"}
                  </button>
                  <p className="w-full text-xs leading-relaxed text-violet-200/90">
                    On Hedera, <strong className="text-white">Approve</strong> often reverts with <code className="rounded bg-black/30 px-1">CONTRACT_REVERT_EXECUTED</code> until your
                    account is associated with the zUSDC token. Complete this in HashPack first, then use Step 1 Approve ({APPROVE_CAP_HUMAN} zUSDC cap) and Step 2 Stake.
                  </p>
                </>
              ) : parsedStakeAmount != null && needsApprove ? (
                <>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => onApprove()}
                    className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 sm:w-auto"
                  >
                    {busy === "approve" ? "…" : "Step 1 — Approve zUSDC"}
                  </button>
                  <p className="w-full text-xs leading-relaxed text-amber-200/90">
                    You must complete approval in HashPack first. After it succeeds, wait a few seconds — the{" "}
                    <strong className="text-white">Stake</strong> button will appear (Step 2). Do not skip this step.
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  disabled={!!busy || !stakeInput.trim()}
                  onClick={() => onStake()}
                  className="rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/25 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50"
                  title={!stakeInput.trim() ? "Enter an amount" : undefined}
                >
                  {busy === "stake" ? "…" : parsedStakeAmount != null ? "Step 2 — Stake" : "Stake"}
                </button>
              )}
            </div>
            {hashPackConnected && ZUSDC_HTS_ID && userHtsHasZusdc !== false && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => onAssociateZusdc()}
                className="mt-2 text-xs text-slate-500 underline hover:text-slate-400"
              >
                Associate zUSDC again (HTS) — only if Approve keeps failing
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!!busy || staked <= 0n}
              onClick={() => onWithdrawClick()}
              className="rounded-2xl border border-slate-600/60 bg-slate-800/40 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800/70 disabled:opacity-50"
            >
              {busy === "withdraw" ? "…" : "Withdraw all"}
            </button>
            <button
              type="button"
              disabled={!!busy || earned <= 0n}
              onClick={() => onClaimClick()}
              className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-5 py-2.5 text-sm font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
            >
              {busy === "getReward" ? "…" : "Claim rewards"}
            </button>
            <button
              type="button"
              disabled={!!busy || (staked <= 0n && earned <= 0n)}
              onClick={() => onExitClick()}
              className="rounded-2xl border border-teal-500/40 bg-teal-500/10 px-5 py-2.5 text-sm font-medium text-teal-200 hover:bg-teal-500/20 disabled:opacity-50"
              title="One transaction: withdraw full staked zUSDC + claim pending rewards"
            >
              {busy === "exit" ? "…" : "Exit (unstake + claim)"}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            <strong className="text-slate-400">Claim</strong> only sends <strong className="text-slate-400">rewards</strong>.{" "}
            <strong className="text-slate-400">Withdraw</strong> only returns <strong className="text-slate-400">staked principal</strong>.{" "}
            <strong className="text-slate-400">Exit</strong> does both in one on-chain call (<code className="font-mono text-[10px] text-slate-500">exit()</code>).
            <span className="mt-1 block text-slate-600">
              HashPack: contract call — not ERC-20 Approve (Approve chỉ cho stake mới).
            </span>
          </p>

          {msg && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm shadow-lg ${
                successMsg(msg) ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-rose-500/25 bg-rose-950/40 text-rose-200"
              }`}
            >
              {successMsg(msg) ? (
                <p>{msg}</p>
              ) : /CONTRACT_REVERT_EXECUTED/i.test(msg) ? (
                <StakeRevertHelp
                  rawMessage={msg}
                  stakingContractHasZusdc={stakingContractHasZusdc}
                  parsedStakeAmount={parsedStakeAmount}
                  allowance={allowance}
                  walletBal={walletBal}
                  fmt={fmt}
                />
              ) : (
                <p className="text-rose-200">{msg}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>

    {claimConfirmOpen && address && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-confirm-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) setClaimConfirmOpen(false);
        }}
      >
        <div
          className="relative w-full max-w-lg rounded-3xl border border-amber-500/25 bg-gradient-to-b from-[#12151f] to-[#0a0c12] p-6 shadow-2xl shadow-black/50 sm:p-8"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="claim-confirm-title" className="text-lg font-bold text-white">
            Confirm claim rewards
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            You are about to claim <strong className="text-amber-200">pending zUSDC rewards</strong> from the staking contract. Rewards are sent to your wallet; your{" "}
            <strong className="text-emerald-200/90">staked principal</strong> stays in the pool until you withdraw.
          </p>
          <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-950/25 px-4 py-3 text-xs leading-relaxed text-emerald-100/90">
            <p className="font-semibold text-emerald-200">No “Approve” in the wallet for claim — this is normal</p>
            <p className="mt-1.5 text-emerald-100/85">
              <strong className="text-white">Claim</strong> only runs <code className="rounded bg-black/30 px-1 font-mono text-[11px]">getReward()</code> on the staking contract. The contract sends zUSDC <strong className="text-white">to</strong> your account via HTS — it does <strong className="text-white">not</strong> call ERC-20{" "}
              <code className="rounded bg-black/30 px-1 font-mono text-[11px]">approve</code>. In HashPack you should see a <strong className="text-white">contract / execute</strong> confirmation (wording may vary), not an Approve step.
            </p>
            <p className="mt-2 border-t border-emerald-500/15 pt-2 text-emerald-200/70">
              <span className="text-slate-400">Tiếng Việt:</span> Khi claim <strong className="text-emerald-100">không có bước Approve token</strong> — đúng thiết kế. Approve chỉ cần khi{" "}
              <strong className="text-emerald-100">Stake</strong> (cho phép contract rút zUSDC). Trên ví chỉ cần xác nhận giao dịch gọi contract.
            </p>
          </div>
          <dl className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm">
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Wallet</dt>
              <dd className="font-mono text-xs text-slate-200">{shortAddr(address)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Staking contract</dt>
              <dd className="font-mono text-xs text-slate-200" title={stakingAddr}>
                {shortAddr(stakingAddr)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Your staked zUSDC</dt>
              <dd className="tabular-nums font-semibold text-emerald-200">{fmt(staked)} zUSDC</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Rewards to receive (pending)</dt>
              <dd className="tabular-nums font-semibold text-amber-200">{fmt(earned)} zUSDC</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Total pool staked</dt>
              <dd className="tabular-nums text-slate-200">{fmt(totalStaked)} zUSDC</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Pool APR (est.)</dt>
              <dd className="tabular-nums text-slate-200">{formatPct(poolApr)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Pool APY (est.)</dt>
              <dd className="tabular-nums text-slate-200">{formatPct(poolApy)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Your reward rate (est.)</dt>
              <dd className="tabular-nums text-right text-slate-200">
                {staked > 0n && totalStaked > 0n ? `${fmt(userRewardPerSec)} zUSDC / sec` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Epoch duration</dt>
              <dd className="tabular-nums text-slate-300">{epochDaysLabel} days</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Epoch ends</dt>
              <dd className="max-w-[55%] text-right text-xs text-slate-300">{periodEndLabel}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            Figures reflect on-chain state at the last refresh (~{POLL_MS / 1000}s). The contract determines the final reward amount at execution.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => setClaimConfirmOpen(false)}
              className="rounded-2xl border border-slate-600/60 bg-slate-800/50 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800/80 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void confirmClaimRewards()}
              className="rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-950/30 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50"
            >
              {busy === "getReward" ? "…" : "Confirm & claim"}
            </button>
          </div>
        </div>
      </div>
    )}

    {withdrawConfirmOpen && address && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-confirm-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) setWithdrawConfirmOpen(false);
        }}
      >
        <div
          className="relative w-full max-w-lg rounded-3xl border border-indigo-500/25 bg-gradient-to-b from-[#12151f] to-[#0a0c12] p-6 shadow-2xl shadow-black/50 sm:p-8"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="withdraw-confirm-title" className="text-lg font-bold text-white">
            Confirm withdraw all
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            You are about to call <code className="rounded bg-black/40 px-1.5 font-mono text-xs text-indigo-200">withdraw(amount)</code> for your{" "}
            <strong className="text-emerald-200">full staked balance</strong>. zUSDC principal is returned to your wallet via HTS.{" "}
            <strong className="text-amber-200/90">Pending rewards are not claimed</strong> — use <strong className="text-slate-200">Claim rewards</strong> or{" "}
            <strong className="text-slate-200">Exit</strong> if you also want rewards.
          </p>
          <div className="mt-4 rounded-2xl border border-indigo-500/20 bg-indigo-950/25 px-4 py-3 text-xs leading-relaxed text-indigo-100/90">
            <p className="font-semibold text-indigo-200">No ERC-20 Approve — contract execution only</p>
            <p className="mt-1.5 text-indigo-100/85">
              Same as Claim / Exit: HashPack shows a <strong className="text-white">contract call</strong>, not token Approve. Approve is only for <strong className="text-white">new stake</strong> above.
            </p>
            <p className="mt-2 border-t border-indigo-500/15 pt-2 text-indigo-200/70">
              <span className="text-slate-400">Tiếng Việt:</span> Rút gốc stake — <strong className="text-indigo-100">không</strong> tự claim reward. Muốn cả hai dùng <strong className="text-indigo-100">Exit</strong>.
            </p>
          </div>
          <dl className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm">
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Wallet</dt>
              <dd className="font-mono text-xs text-slate-200">{shortAddr(address)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Staking contract</dt>
              <dd className="font-mono text-xs text-slate-200" title={stakingAddr}>
                {shortAddr(stakingAddr)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">zUSDC to receive (principal)</dt>
              <dd className="tabular-nums font-semibold text-emerald-200">{fmt(staked)} zUSDC</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Pending rewards (unchanged by withdraw)</dt>
              <dd className="tabular-nums font-semibold text-amber-200/90">{fmt(earned)} zUSDC</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Total pool staked</dt>
              <dd className="tabular-nums text-slate-200">{fmt(totalStaked)} zUSDC</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Pool APR (est.)</dt>
              <dd className="tabular-nums text-slate-200">{formatPct(poolApr)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Pool APY (est.)</dt>
              <dd className="tabular-nums text-slate-200">{formatPct(poolApy)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/5 pb-3">
              <dt className="text-slate-500">Epoch duration</dt>
              <dd className="tabular-nums text-slate-300">{epochDaysLabel} days</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Epoch ends</dt>
              <dd className="max-w-[55%] text-right text-xs text-slate-300">{periodEndLabel}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            Figures reflect on-chain state at the last refresh (~{POLL_MS / 1000}s). Final amounts are determined at execution.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => setWithdrawConfirmOpen(false)}
              className="rounded-2xl border border-slate-600/60 bg-slate-800/50 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800/80 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void confirmWithdrawAll()}
              className="rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/30 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50"
            >
              {busy === "withdraw" ? "…" : "Confirm & withdraw"}
            </button>
          </div>
        </div>
      </div>
    )}

    {exitConfirmOpen && address && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-confirm-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) setExitConfirmOpen(false);
        }}
      >
        <div
          className="relative w-full max-w-lg rounded-3xl border border-teal-500/25 bg-gradient-to-b from-[#12151f] to-[#0a0c12] p-6 shadow-2xl shadow-black/50 sm:p-8"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="exit-confirm-title" className="text-lg font-bold text-white">
            Confirm exit — unstake + claim
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            This runs <code className="rounded bg-black/40 px-1.5 font-mono text-xs text-teal-200">exit()</code> on the staking contract:{" "}
            <strong className="text-emerald-200">withdraw your full staked balance</strong> and{" "}
            <strong className="text-amber-200">claim pending rewards</strong> in <strong className="text-white">one</strong> transaction.
          </p>
          <dl className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Staked to return</dt>
              <dd className="tabular-nums font-semibold text-emerald-200">{fmt(staked)} zUSDC</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Rewards to claim</dt>
              <dd className="tabular-nums font-semibold text-amber-200">{fmt(earned)} zUSDC</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-slate-500">
            No ERC-20 Approve — only a contract execution in HashPack. Ensure zUSDC is associated so HTS transfers succeed.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => setExitConfirmOpen(false)}
              className="rounded-2xl border border-slate-600/60 bg-slate-800/50 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800/80 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void confirmExitAll()}
              className="rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-950/30 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50"
            >
              {busy === "exit" ? "…" : "Confirm exit"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
