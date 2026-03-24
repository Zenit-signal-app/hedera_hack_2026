import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import HashPackConnectButton from "@/components/HashPackConnectButton";
import { hashgraphWalletConnect } from "@/lib/hashgraphWalletConnect";
import { CONTRACTS, KEEPER_URL } from "@/config/contracts";
import { PERPETUAL_DEX_ABI, symbolToBytes32 } from "@/abis/PerpetualDEX";
import { ERC20_ABI } from "@/abis/Token";
import IndicatorPanel from "@/components/IndicatorPanel";
import RadarSignalPanel from "@/components/RadarSignalPanel";
import FearGreedIndex from "@/components/FearGreedIndex";
import AIChatbotWidget from "@/components/AIChatbotWidget";
import TVChartContainer from "@/components/TVChartContainer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { usePolkadotPrices, type PolkadotSymbol } from "@/hooks/usePolkadotPrices";
import { useChartPrice } from "@/hooks/useChartPrice";
import { calculatePositionPnL, calculateLiquidationPrice, type PnLResult } from "@/utils/tradeMath";
import { calcTpSlPrices, type TpSlMode } from "@shared/tradeMath";
import Decimal from "decimal.js";

const ZUSDC_TOKEN_ID = String(import.meta.env.VITE_ZUSDC_TOKEN_ID ?? "").trim();

type KeeperOrder = {
  id: string;
  walletAddress: string;
  market: PolkadotSymbol;
  side?: "Long" | "Short";
  leverage?: number;
  closeReasonCode?: number;
  /** zUSDC strings from keeper DB */
  marginAmount?: string;
  positionSize?: string;
  entryPrice?: number;
  closePrice?: number | null;
  status: "Open" | "Closed" | "Filled" | "Liquidated" | "Cancelled";
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  liquidationPrice: number;
  updatedAt: string;
  openedAt?: string;
  closedAt?: string | null;
  openTxHash?: string | null;
  closeTxHash?: string | null;
};

const POSITION_TYPE = { Long: 0, Short: 1 } as const;

// Keep this conservative: wallet UI shows max fee = gasLimit * maxFeePerGas.
// A huge gasLimit makes the wallet preview look "very expensive" even if actual gasUsed is much lower.
const GAS_LIMIT_BUFFER_PCT = 12n;
const MIN_GAS_LIMIT = 50_000n;
const MAX_GAS_LIMIT = 800_000n;
const TX_RECEIPT_TIMEOUT_MS = 90_000;
const TX_RECEIPT_POLL_MS = 1_500;
const TX_RECEIPT_TIMEOUT_MS_LONG = 240_000;
const TX_RECEIPT_TIMEOUT_MS_OPEN_SHORT = 35_000;
const TX_RECEIPT_POLL_MS_OPEN_SHORT = 800;

async function estimateBufferedGasLimit(
  publicClient: ReturnType<typeof usePublicClient>,
  req: Parameters<NonNullable<ReturnType<typeof usePublicClient>>["estimateContractGas"]>[0],
) {
  if (!publicClient) return 500_000n;
  try {
    const estimated = await publicClient.estimateContractGas(req);
    const buffered = estimated + (estimated * GAS_LIMIT_BUFFER_PCT) / 100n;
    if (buffered < MIN_GAS_LIMIT) return MIN_GAS_LIMIT;
    if (buffered > MAX_GAS_LIMIT) return MAX_GAS_LIMIT;
    return buffered;
  } catch {
    return 500_000n;
  }
}

async function estimateBufferedGasLimitWithFloor(
  publicClient: ReturnType<typeof usePublicClient>,
  req: Parameters<NonNullable<ReturnType<typeof usePublicClient>>["estimateContractGas"]>[0],
  floor: bigint,
  fallback = 500_000n,
) {
  const estimated = await estimateBufferedGasLimit(publicClient, req);
  // Only enforce a floor when estimation looks suspicious (clamped/failed).
  // Otherwise, keep estimate to avoid inflated wallet "Max fee" previews.
  const looksClampedOrFallback =
    estimated === 500_000n || estimated === 0n;
  if (looksClampedOrFallback) return floor;
  // Also ensure we don't exceed MAX_GAS_LIMIT even if caller passes a huge floor.
  if (estimated > MAX_GAS_LIMIT) return MAX_GAS_LIMIT;
  return estimated || fallback;
}

const TP_SL_STORAGE_KEY = "zenit_tp_sl";

/** Extract user-friendly error message from tx errors (viem, wallet, etc.). */
function getTxErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) {
    const msg = (e as { shortMessage?: string }).shortMessage ?? e.message;
    if (msg.includes("Priority is too low")) {
      return "Gas priority too low. Please try again or increase gas in your wallet.";
    }
    if (msg.includes("temporarily banned")) {
      return "Transaction temporarily banned by RPC node. Switch HashPack RPC to Hedera Testnet (https://testnet.hashio.io/api) and try again.";
    }
    if (msg.includes("Invalid Transaction")) {
      const details = (e as { details?: string }).details;
      return details ? `Invalid Transaction (chain rejected): ${details}` : "Invalid Transaction (chain rejected).";
    }
    if (msg.toLowerCase().includes("already imported") || msg.toLowerCase().includes("already known")) {
      return "A similar transaction is already pending in mempool. Please wait for confirmation in wallet Activity.";
    }
    if (msg.toLowerCase().includes("replaced")) {
      return "Transaction was replaced in wallet. Please check latest tx in wallet Activity.";
    }
    return msg;
  }
  return fallback;
}

function saveTpSlToStorage(wallet: string, market: string, tp: number | null, sl: number | null) {
  try {
    const key = `${TP_SL_STORAGE_KEY}:${wallet.toLowerCase()}:${market}`;
    if (tp == null && sl == null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify({ tp, sl }));
  } catch {}
}


function getTpSlFromStorage(wallet: string, market: string): { tp: number | null; sl: number | null } | null {
  try {
    const key = `${TP_SL_STORAGE_KEY}:${wallet.toLowerCase()}:${market}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { tp, sl } = JSON.parse(raw);
    return { tp: tp ?? null, sl: sl ?? null };
  } catch {
    return null;
  }
}

/** Register TP/SL with keeper. Retries to handle race with PositionOpened. On 404, tries sync first. */
async function registerTpSlWithKeeper(
  walletAddress: string,
  market: PolkadotSymbol,
  takeProfitPrice: number | null,
  stopLossPrice: number | null,
) {
  if (takeProfitPrice == null && stopLossPrice == null) return;
  const base = KEEPER_URL.replace(/\/$/, "");
  const body = JSON.stringify({
    walletAddress,
    market,
    takeProfitPrice,
    stopLossPrice,
  });
  const headers = { "Content-Type": "application/json" };
  const maxRetries = 4;
  const delayMs = 2500;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      let res = await fetch(`${base}/orders/tp-sl`, { method: "POST", headers, body });
      if (res.ok) return;
      if (res.status === 404) {
        await fetch(`${base}/orders/sync`, { method: "POST", headers, body });
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
      }
      console.warn("[Keeper] TP/SL registration failed:", res.status, await res.text());
    } catch (err) {
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        console.warn("[Keeper] TP/SL registration error:", err);
      }
    }
  }
}

type PositionData = { amount: bigint; position: number; leverage: number };
type HistoryEntry = {
  id: string;
  symbol?: PolkadotSymbol;
  action: "open" | "increase" | "close";
  type: "Long" | "Short" | "N/A";
  amount: string;
  leverage: number;
  entryPrice: number;
  closePrice?: number;
  status: "open" | "closed";
  timestamp: number;
  openedAt?: number;
  closedAt?: number;
  openTxHash?: `0x${string}`;
  closeTxHash?: `0x${string}`;
  closeReason?: "Manual close" | "Take profit hit" | "Stop loss hit" | "Liquidation hit";
  fee: number;
  takeProfit: number | null;
  stopLoss: number | null;
  volume: number | null;
};

const POLKADOT_SYMBOLS: PolkadotSymbol[] = ["BTCUSD", "ETHUSD", "HBARUSD"];

/** Pyth ticker format - must match chart datafeed for price sync */
const TRADINGVIEW_SYMBOL_MAP: Partial<Record<PolkadotSymbol, string>> = {
  BTCUSD: "Crypto.BTC/USD",
  ETHUSD: "Crypto.ETH/USD",
  HBARUSD: "Crypto.HBAR/USD",
};

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const DATE_PART_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ZUSDC_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatZUSDC(value?: bigint | null, decimals = 18) {
  if (value == null) return ZUSDC_FORMATTER.format(0);
  const num = Number(formatUnits(value, decimals));
  if (Number.isNaN(num)) return ZUSDC_FORMATTER.format(0);
  return ZUSDC_FORMATTER.format(num);
}

function formatZUSDCNumber(value?: number) {
  if (value == null || Number.isNaN(value)) return ZUSDC_FORMATTER.format(0);
  return ZUSDC_FORMATTER.format(value);
}

function formatForSymbol(value: number | null | undefined, symbol?: PolkadotSymbol) {
  if (value == null) return "—";
  const decimals = symbol === "DOTUSD" || symbol === "HBARUSD" ? 4 : 2;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function formatCurrency(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return USD_FORMATTER.format(value);
}

/** Check if tx receipt indicates failure (handles both string and numeric status from different chains) */
function isTxReverted(status: unknown): boolean {
  return status === "reverted" || status === 0 || status === "0x0";
}

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return `${TIME_FORMATTER.format(date)} ${DATE_PART_FORMATTER.format(date)}`;
}

function calculatePnL(entry: HistoryEntry, currentPrice?: number) {
  if (!entry.entryPrice) return null;
  const referencePrice =
    entry.status === "closed" ? entry.closePrice ?? entry.entryPrice : currentPrice ?? entry.entryPrice;
  if (referencePrice == null) return null;
  const size = new Decimal(entry.amount).mul(entry.leverage);
  const entryPriceDec = new Decimal(entry.entryPrice);
  if (entryPriceDec.eq(0)) return null;
  const referencePriceDec = new Decimal(referencePrice);
  const delta = entry.type === "Short"
    ? entryPriceDec.sub(referencePriceDec)
    : referencePriceDec.sub(entryPriceDec);
  const pnl = delta.div(entryPriceDec).mul(size);
  return Number(pnl.toNumber());
}

function calculatePnLFromResolved(
  side: "Long" | "Short",
  entryPrice: number,
  referencePrice: number,
  sizeUsd: number,
) {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(referencePrice) || !Number.isFinite(sizeUsd)) return null;
  if (entryPrice <= 0 || sizeUsd <= 0) return null;
  const entryPriceDec = new Decimal(entryPrice);
  const referencePriceDec = new Decimal(referencePrice);
  const delta = side === "Short"
    ? entryPriceDec.sub(referencePriceDec)
    : referencePriceDec.sub(entryPriceDec);
  return Number(delta.div(entryPriceDec).mul(new Decimal(sizeUsd)).toNumber());
}

function deriveCloseReason(
  order: KeeperOrder,
  existing?: HistoryEntry,
): HistoryEntry["closeReason"] {
  if (typeof order.closeReasonCode === "number") {
    switch (order.closeReasonCode) {
      case 0:
        return "Manual close";
      case 1:
        return "Take profit hit";
      case 2:
        return "Stop loss hit";
      case 3:
        return "Liquidation hit";
      default:
        return "Manual close";
    }
  }

  if (order.status === "Filled") return "Take profit hit";
  if (order.status === "Liquidated") return "Liquidation hit";
  if (order.status !== "Closed") return undefined;

  // "Closed" can be either Stop Loss or Manual close.
  // Classify as SL only when `closePrice` satisfies the same trigger tolerance
  // as keeper's watcher for SL (avoid mislabeling manual closes near SL).
  // Keeper uses: SL_TP_TOLERANCE = 1.0002 (0.02% tolerance for price feed lag).
  const SL_TP_TOLERANCE = 1.0002;

  const sl = order.stopLossPrice;
  const cp = order.closePrice;
  const side = order.side ?? existing?.type;
  const normalizedSide = side === "Long" || side === "Short" ? side : undefined;

  if (
    sl == null ||
    cp == null ||
    !Number.isFinite(sl) ||
    !Number.isFinite(cp) ||
    !normalizedSide
  ) {
    return "Manual close";
  }

  if (normalizedSide === "Long") {
    return cp <= sl * SL_TP_TOLERANCE ? "Stop loss hit" : "Manual close";
  }
  // Short
  return cp >= sl / SL_TP_TOLERANCE ? "Stop loss hit" : "Manual close";
}

function formatCloseReasonLabel(reason?: HistoryEntry["closeReason"]): string {
  if (!reason) return "—";
  if (reason === "Manual close") return "Manual";
  if (reason === "Take profit hit") return "TP";
  if (reason === "Stop loss hit") return "SL";
  if (reason === "Liquidation hit") return "Liquidated";
  return reason;
}

function renderCloseReasonBadge(reason?: HistoryEntry["closeReason"]) {
  const label = formatCloseReasonLabel(reason);
  let cls = "border-slate-500/50 bg-slate-500/20 text-slate-200";
  if (label === "TP") cls = "border-emerald-500/50 bg-emerald-500/20 text-emerald-300";
  else if (label === "SL") cls = "border-amber-500/50 bg-amber-500/20 text-amber-300";
  else if (label === "Liquidated") cls = "border-rose-500/60 bg-rose-500/20 text-rose-300";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

interface PositionPnLDisplayProps {
  side: "Long" | "Short";
  entryPrice: number;
  margin: number;
  leverage: number;
  markPrice?: number;
}

function PositionPnLDisplay({ side, entryPrice, leverage, margin, markPrice }: PositionPnLDisplayProps) {
  const [pnlData, setPnlData] = useState<PnLResult | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (markPrice == null) return;
    const result = calculatePositionPnL(side, entryPrice, markPrice, margin, leverage);
    setPnlData(result);
    setFlash(true);
    const timeout = setTimeout(() => setFlash(false), 100);
    return () => clearTimeout(timeout);
  }, [entryPrice, leverage, margin, markPrice, side]);

  if (!pnlData) return null;

  return (
    <div
      className={`rounded-xl border border-[#363a59] bg-[#0d0f18] px-4 py-3 text-sm font-semibold tracking-wide transition-[filter] duration-150 ${
        flash ? "filter brightness-125" : ""
      }`}
      style={{ color: pnlData.color }}
    >
      <div className="text-[10px] uppercase text-slate-400">Real-time PnL</div>
      <div className="mt-1 text-base">{pnlData.formattedPnL}</div>
    </div>
  );
}

export default function Trade() {
  const { address: wagmiAddress } = useAccount();
  const [wcAddress, setWcAddress] = useState<string>(() => localStorage.getItem("zenit:wallet:evmAddress") ?? "");
  const address = (wagmiAddress ?? wcAddress) as `0x${string}` | undefined;
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [positionAmount, setPositionAmount] = useState("");
  const [leverage, setLeverage] = useState(2);
  const [positionType, setPositionType] = useState<"Long" | "Short">("Long");
  const [closeAmount, setCloseAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"trade" | "deposit">("trade");
  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [openConfirmedNotice, setOpenConfirmedNotice] = useState<{
    createdAt: number;
    walletAddress: string;
    market: PolkadotSymbol;
    side: "Long" | "Short";
    margin: string;
    leverage: number;
    entryPrice: number;
    takeProfit: number | null;
    stopLoss: number | null;
    txHash: `0x${string}`;
  } | null>(null);
  const [openConfirmedKeeperLogs, setOpenConfirmedKeeperLogs] = useState<string>("");
  const [openConfirmedKeeperStatus, setOpenConfirmedKeeperStatus] = useState<"idle" | "watching" | "triggered" | "error">("idle");
  const [isDepositing, setIsDepositing] = useState(false);

  const [chartSymbol, setChartSymbol] = useState<PolkadotSymbol>("BTCUSD");
  const [chartResolution, setChartResolution] = useState<string>("1D");
  const [chartRightOffset, setChartRightOffset] = useState<number>(30);
  const [historyTab, setHistoryTab] = useState<"timeline" | "open" | "closed">("timeline");
  // ── Persistent history helpers (localStorage keyed by wallet address) ──────
  const storageKey = useCallback(
    (suffix: string) => (address ? `zenit:${suffix}:${address.toLowerCase()}` : null),
    [address],
  );
  const loadFromStorage = useCallback(
    <T,>(suffix: string, fallback: T): T => {
      const key = storageKey(suffix);
      if (!key) return fallback;
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
      } catch {
        return fallback;
      }
    },
    [storageKey],
  );
  const saveToStorage = useCallback(
    <T,>(suffix: string, value: T) => {
      const key = storageKey(suffix);
      if (!key) return;
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
    },
    [storageKey],
  );

  const [tradeHistory, setTradeHistory] = useState<HistoryEntry[]>(() => []);
  const [depositHistory, setDepositHistory] = useState<Array<{ id: string; amount: number; timestamp: number }>>(() => []);
  const [withdrawHistory, setWithdrawHistory] = useState<Array<{ id: string; amount: number; timestamp: number }>>(() => []);

  const skipNextSaveRef = useRef(false);

  // Load history from localStorage whenever wallet changes
  useEffect(() => {
    if (!address) {
      setTradeHistory([]);
      setDepositHistory([]);
      setWithdrawHistory([]);
      return;
    }
    skipNextSaveRef.current = true;
    setTradeHistory(
      loadFromStorage<HistoryEntry[]>("tradeHistory", []).map((entry) => ({
        ...entry,
        openedAt: entry.openedAt ?? entry.timestamp,
        closedAt: entry.closedAt ?? (entry.status === "closed" ? entry.timestamp : undefined),
        closeReason:
          entry.closeReason ??
          (entry.status === "closed" && entry.action === "close" ? "Manual close" : undefined),
      })),
    );
    setDepositHistory(loadFromStorage<Array<{ id: string; amount: number; timestamp: number }>>("depositHistory", []));
    setWithdrawHistory(loadFromStorage<Array<{ id: string; amount: number; timestamp: number }>>("withdrawHistory", []));
    queueMicrotask(() => { skipNextSaveRef.current = false; });
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to localStorage whenever histories change (skip right after load to avoid overwriting)
  useEffect(() => {
    if (!address || skipNextSaveRef.current) return;
    saveToStorage("tradeHistory", tradeHistory);
  }, [tradeHistory, address]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!address || skipNextSaveRef.current) return;
    saveToStorage("depositHistory", depositHistory);
  }, [depositHistory, address]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!address || skipNextSaveRef.current) return;
    saveToStorage("withdrawHistory", withdrawHistory);
  }, [withdrawHistory, address]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: dexBalance, refetch: refetchDexBalance } = useReadContract({
    address: CONTRACTS.DEX,
    abi: PERPETUAL_DEX_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const { data: positionBtc, refetch: refetchBtc } = useReadContract({
    address: CONTRACTS.DEX,
    abi: PERPETUAL_DEX_ABI,
    functionName: "getCurrentPosition",
    args: address ? [address, symbolToBytes32("BTCUSD")] : undefined,
  });
  const { data: positionEth, refetch: refetchEth } = useReadContract({
    address: CONTRACTS.DEX,
    abi: PERPETUAL_DEX_ABI,
    functionName: "getCurrentPosition",
    args: address ? [address, symbolToBytes32("ETHUSD")] : undefined,
  });
  const { data: positionDot, refetch: refetchDot } = useReadContract({
    address: CONTRACTS.DEX,
    abi: PERPETUAL_DEX_ABI,
    functionName: "getCurrentPosition",
    args: address ? [address, symbolToBytes32("DOTUSD")] : undefined,
  });
  const { data: positionHbar, refetch: refetchHbar } = useReadContract({
    address: CONTRACTS.DEX,
    abi: PERPETUAL_DEX_ABI,
    functionName: "getCurrentPosition",
    args: address ? [address, symbolToBytes32("HBARUSD")] : undefined,
  });
  const { data: positionSauce, refetch: refetchSauce } = useReadContract({
    address: CONTRACTS.DEX,
    abi: PERPETUAL_DEX_ABI,
    functionName: "getCurrentPosition",
    args: address ? [address, symbolToBytes32("SAUCEUSD")] : undefined,
  });
  const { data: positionPack, refetch: refetchPack } = useReadContract({
    address: CONTRACTS.DEX,
    abi: PERPETUAL_DEX_ABI,
    functionName: "getCurrentPosition",
    args: address ? [address, symbolToBytes32("PACKUSD")] : undefined,
  });
  const { data: positionBonzo, refetch: refetchBonzo } = useReadContract({
    address: CONTRACTS.DEX,
    abi: PERPETUAL_DEX_ABI,
    functionName: "getCurrentPosition",
    args: address ? [address, symbolToBytes32("BONZOUSD")] : undefined,
  });
  const refetchPositions = useCallback(() => {
    refetchBtc();
    refetchEth();
    refetchDot();
    refetchHbar();
    refetchSauce();
    refetchPack();
    refetchBonzo();
  }, [refetchBtc, refetchEth, refetchDot, refetchHbar, refetchSauce, refetchPack, refetchBonzo]);

  const resetBrowserCacheForUser = useCallback(() => {
    if (!address) return;
    // Clear ONLY "cache" used for syncing open positions / TP-SL.
    // Do NOT clear order history (tradeHistory/depositHistory/withdrawHistory).
    try {
      for (const sym of POLKADOT_SYMBOLS) {
        localStorage.removeItem(`${TP_SL_STORAGE_KEY}:${address.toLowerCase()}:${sym}`);
      }
    } catch {}

    setKeeperOpenOrders([]);
    setKeeperOrdersAll([]);
    syncedPositionsRef.current.clear();

    // Force a fresh on-chain + keeper sync (UI will keep showing history).
    refetchPositions();
    refetchDexBalance();
  }, [address, refetchPositions, refetchDexBalance]);
  const positionsBySymbol = useMemo(
    () =>
      ({
        BTCUSD: positionBtc as PositionData | undefined,
        ETHUSD: positionEth as PositionData | undefined,
        DOTUSD: positionDot as PositionData | undefined,
        HBARUSD: positionHbar as PositionData | undefined,
        SAUCEUSD: positionSauce as PositionData | undefined,
        PACKUSD: positionPack as PositionData | undefined,
        BONZOUSD: positionBonzo as PositionData | undefined,
      }) as Record<PolkadotSymbol, PositionData | undefined>,
    [positionBtc, positionEth, positionDot, positionHbar, positionSauce, positionPack, positionBonzo],
  );
  const position = positionsBySymbol[chartSymbol];

  const { data: tokenBalance, refetch: refetchTokenBalance } = useReadContract({
    address: CONTRACTS.TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });
  const { writeContractAsync: transferTokenAsync } = useWriteContract();
  const { writeContractAsync: withdrawAsync, data: withdrawHash } = useWriteContract();
  const { writeContractAsync: openPosAsync, data: openHash } = useWriteContract();
  const { writeContractAsync: increasePosAsync, data: increaseHash } = useWriteContract();
  const { writeContractAsync: closePosAsync, data: closeHash } = useWriteContract();

  const { isLoading: isWithdrawPending } = useWaitForTransactionReceipt({ hash: withdrawHash });
  const { isLoading: isOpenPending } = useWaitForTransactionReceipt({ hash: openHash });
  const { isLoading: isIncreasePending } = useWaitForTransactionReceipt({ hash: increaseHash });
  useWaitForTransactionReceipt({ hash: closeHash });
  const [isSubmittingPosition, setIsSubmittingPosition] = useState(false);

  const txLockRef = useRef<Record<string, boolean>>({});
  const acquireTxLock = (key: string) => {
    if (txLockRef.current[key]) return false;
    txLockRef.current[key] = true;
    return true;
  };
  const releaseTxLock = (key: string) => { txLockRef.current[key] = false; };
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isClosingPosition, setIsClosingPosition] = useState(false);

  const publicClient = usePublicClient();

  useEffect(() => {
    hashgraphWalletConnect
      .restoreSession()
      .then((session) => {
        if (session?.evmAddress) setWcAddress(session.evmAddress);
      })
      .catch(() => {});
    const onWallet = (ev: Event) => {
      const detail = (ev as CustomEvent<{ evmAddress?: string }>).detail;
      setWcAddress(String(detail?.evmAddress ?? ""));
    };
    window.addEventListener("zenit-hashgraph-wallet", onWallet as EventListener);
    return () => window.removeEventListener("zenit-hashgraph-wallet", onWallet as EventListener);
  }, []);

  const waitOptions = useMemo(() => ({ confirmations: 0 }), []);

  const waitForReceiptWithTimeout = useCallback(
    async (
      hash: `0x${string}`,
      actionLabel: string,
      timeoutMs: number = TX_RECEIPT_TIMEOUT_MS,
      pollMs: number = TX_RECEIPT_POLL_MS,
    ) => {
      if (!publicClient) throw new Error("No public client");
      try {
        return await publicClient.waitForTransactionReceipt({
          hash,
          ...waitOptions,
          timeout: timeoutMs,
          pollingInterval: pollMs,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("timeout")) {
          throw new Error(`${actionLabel} is taking too long to confirm. Tx hash: ${hash}`);
        }
        throw err;
      }
    },
    [publicClient, waitOptions],
  );

  const isReceiptTimeoutError = (e: unknown): boolean => {
    const msg = e instanceof Error ? e.message : String(e);
    const m = msg.toLowerCase();
    return m.includes("timeout") || m.includes("taking too long to confirm");
  };

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }, []);

  const formatKeeperLogLine = useCallback((row: any) => {
    const meta = row?.meta ? ` ${JSON.stringify(row.meta)}` : "";
    return `${row.ts} ${row.level} [${row.tag}] ${row.msg}${meta}`;
  }, []);

  // After openPosition confirm: watch keeper logs until TP/SL/Liq triggers (best-effort).
  useEffect(() => {
    if (!openConfirmedNotice) return;
    const base = KEEPER_URL.replace(/\/$/, "");
    let cancelled = false;
    setOpenConfirmedKeeperStatus("watching");
    setOpenConfirmedKeeperLogs("");

    const poll = async () => {
      try {
        const res = await fetch(`${base}/logs/recent?limit=120`);
        const rows = (await res.json()) as Array<any>;
        if (cancelled) return;

        const walletLower = openConfirmedNotice.walletAddress.toLowerCase();
        const market = openConfirmedNotice.market;

        const relevant = rows.filter((r) => {
          const m = r?.meta ?? {};
          const msg = String(r?.msg ?? "");
          return (
            String(m?.walletAddress ?? "").toLowerCase() === walletLower &&
            String(m?.market ?? "") === market &&
            msg.toLowerCase().includes("triggered")
          );
        });

        // Always show latest logs snapshot (helps user copy diagnostic info)
        setOpenConfirmedKeeperLogs(rows.slice(-60).map(formatKeeperLogLine).join("\n"));

        if (relevant.length > 0) {
          setOpenConfirmedKeeperStatus("triggered");
          return; // stop polling on first trigger match
        }
      } catch {
        if (!cancelled) setOpenConfirmedKeeperStatus("error");
      }
    };

    const interval = setInterval(poll, 5000);
    poll();
    const timeout = setTimeout(() => { clearInterval(interval); }, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [openConfirmedNotice, formatKeeperLogLine]);

  const handleDeposit = async () => {
    if (!depositAmount || !address) return;
    if (!acquireTxLock("deposit")) return;
    setTxError(null);
    setTxSuccess(null);
    setIsDepositing(true);
    const transferAmountRaw = parseUnits(depositAmount, 8);
    const syncAmountRaw = parseUnits(depositAmount, 18);
    const depositValue = Number(depositAmount);
    try {
      if (!hashgraphWalletConnect.isConnected()) {
        await hashgraphWalletConnect.restoreSession().catch(() => null);
      }
      let transferTxRef = "";
      if (hashgraphWalletConnect.isConnected()) {
        if (!ZUSDC_TOKEN_ID) throw new Error("Missing VITE_ZUSDC_TOKEN_ID in frontend .env");
        transferTxRef = await hashgraphWalletConnect.transferHtsTokenToDex(
          ZUSDC_TOKEN_ID,
          CONTRACTS.DEX,
          transferAmountRaw,
        );
      } else {
        if (!publicClient) throw new Error("Wallet is not connected");
        const transferGasLimit = await estimateBufferedGasLimitWithFloor(publicClient, {
          address: CONTRACTS.TOKEN,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [CONTRACTS.DEX, transferAmountRaw],
          account: address,
        }, 120_000n, 220_000n);
        const transferHash = await transferTokenAsync({
          address: CONTRACTS.TOKEN,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [CONTRACTS.DEX, transferAmountRaw],
          gas: transferGasLimit,
        });
        if (!transferHash) throw new Error("HTS transfer transaction was not sent");

        const transferReceipt = await waitForReceiptWithTimeout(
          transferHash,
          "HTS transfer transaction",
          TX_RECEIPT_TIMEOUT_MS,
          TX_RECEIPT_POLL_MS,
        );
        if (isTxReverted(transferReceipt.status)) throw new Error("HTS transfer reverted on-chain");
        transferTxRef = transferHash;
      }

      const base = KEEPER_URL.replace(/\/$/, "");
      const syncResp = await fetch(`${base}/deposit/hts-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          amountRaw: syncAmountRaw.toString(),
          transferTxHash: transferTxRef,
        }),
      });
      const syncData = await syncResp.json();
      if (!syncResp.ok || !syncData?.success) {
        throw new Error(syncData?.error || "Deposit sync failed");
      }

      setDepositAmount("");
      if (!Number.isNaN(depositValue)) {
        setDepositHistory((prev) => [
          { id: crypto.randomUUID?.() ?? `deposit-${Date.now()}`, amount: depositValue, timestamp: Date.now() },
          ...prev,
        ]);
      }
      refetchDexBalance();
      refetchTokenBalance();
      setTimeout(() => { refetchTokenBalance(); }, 1500);
      setTimeout(() => { refetchTokenBalance(); }, 4000);
    } catch (e) {
      setTxError(getTxErrorMessage(e, "Deposit failed"));
    } finally {
      setIsDepositing(false);
      releaseTxLock("deposit");
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount) return;
    if (!acquireTxLock("withdraw")) return;
    setTxError(null);
    setTxSuccess(null);
    setIsWithdrawing(true);
    const withdrawValue = Number(withdrawAmount);
    try {
      const withdrawArg = parseUnits(withdrawAmount, 18);
      if (hashgraphWalletConnect.isConnected()) {
        await hashgraphWalletConnect.executeContractCall(
          CONTRACTS.DEX,
          PERPETUAL_DEX_ABI,
          "withdraw",
          [withdrawArg],
          450_000,
        );
        setWithdrawAmount("");
        if (!Number.isNaN(withdrawValue)) {
          setWithdrawHistory((prev) => [
            { id: crypto.randomUUID?.() ?? `withdraw-${Date.now()}`, amount: withdrawValue, timestamp: Date.now() },
            ...prev,
          ]);
        }
        refetchDexBalance();
        refetchTokenBalance();
        setTimeout(() => { refetchTokenBalance(); refetchDexBalance(); }, 1500);
        setTimeout(() => { refetchTokenBalance(); refetchDexBalance(); }, 4000);
        setTxSuccess(`Withdraw successful: ${formatZUSDCNumber(withdrawValue)}`);
        return;
      }
      if (!publicClient) throw new Error("Wallet is not connected");
      const gasLimit = await estimateBufferedGasLimitWithFloor(publicClient, {
        address: CONTRACTS.DEX,
        abi: PERPETUAL_DEX_ABI,
        functionName: "withdraw",
        args: [withdrawArg],
        account: address,
      }, 220_000n, 300_000n);
      const hash = await withdrawAsync({
        address: CONTRACTS.DEX,
        abi: PERPETUAL_DEX_ABI,
        functionName: "withdraw",
        args: [withdrawArg],
        gas: gasLimit,
      });
      if (!hash) throw new Error("Withdraw transaction was not sent");
      const receipt = await publicClient.waitForTransactionReceipt({ hash, ...waitOptions });
      if (isTxReverted(receipt.status)) throw new Error("Withdraw failed on-chain");
      setWithdrawAmount("");
      if (!Number.isNaN(withdrawValue)) {
        setWithdrawHistory((prev) => [
          { id: crypto.randomUUID?.() ?? `withdraw-${Date.now()}`, amount: withdrawValue, timestamp: Date.now() },
          ...prev,
        ]);
      }
      refetchDexBalance();
      refetchTokenBalance();
      setTimeout(() => { refetchTokenBalance(); refetchDexBalance(); }, 1500);
      setTimeout(() => { refetchTokenBalance(); refetchDexBalance(); }, 4000);
      setTxSuccess(`Withdraw successful: ${formatZUSDCNumber(withdrawValue)}`);
    } catch (e) {
      setTxError(getTxErrorMessage(e, "Withdraw failed"));
    } finally {
      setIsWithdrawing(false);
      releaseTxLock("withdraw");
    }
  };

  const handleOpenPosition = async () => {
    if (!positionAmount) return;
    if (!address) return;
    if (!acquireTxLock("openPosition")) return;
    setTxError(null);
    const amountStr = positionAmount;
    const parsed = Number(amountStr);
    const freeBalance = Number(formatUnits(dexBalance ?? 0n, 18));
    const available = Math.max(0, Math.min(freeBalance, collateralEquity));
    if (!Number.isNaN(parsed) && parsed > available) {
      setTxError(`Insufficient collateral. Available: ${formatZUSDCNumber(available)} zUSDC`);
      releaseTxLock("openPosition");
      return;
    }
    const priceSnapshot = displayPrice?.price ?? chartPrice?.price ?? null;
    const entryPriceValue = priceSnapshot ?? 0;
    const parsedAmount = Number(amountStr);
    const volume = parsedAmount * leverage;
    setIsSubmittingPosition(true);
    let openReceiptTimeoutPending = false;
    try {
      const openArgs = [symbolToBytes32(chartSymbol), parseUnits(amountStr, 18), POSITION_TYPE[positionType], leverage] as const;
      if (hashgraphWalletConnect.isConnected()) {
        const txId = await hashgraphWalletConnect.executeContractCall(
          CONTRACTS.DEX,
          PERPETUAL_DEX_ABI,
          "openPosition",
          openArgs,
          650_000,
        );
        if (priceSnapshot) setEntryPrice(priceSnapshot);
        const newEntry: HistoryEntry = {
          id: crypto.randomUUID?.() ?? `${Date.now()}-open`,
          symbol: chartSymbol,
          action: "open",
          type: positionType,
          amount: amountStr,
          leverage,
          entryPrice: entryPriceValue,
          status: "open",
          timestamp: Date.now(),
          openedAt: Date.now(),
          fee: 0,
          takeProfit: previewTakeProfitPrice ?? null,
          stopLoss: previewStopLossPrice ?? null,
          volume,
        };
        setTradeHistory((prev) => [newEntry, ...prev]);
        refetchPositions();
        refetchDexBalance();
        const tp = previewTakeProfitPrice ?? null;
        const sl = previewStopLossPrice ?? null;
        saveTpSlToStorage(address!, chartSymbol, tp, sl);
        registerTpSlWithKeeper(address!, chartSymbol, tp, sl).catch(() => {});
        setOpenConfirmedNotice({
          createdAt: Date.now(),
          walletAddress: address!,
          market: chartSymbol,
          side: positionType,
          margin: amountStr,
          leverage,
          entryPrice: entryPriceValue,
          takeProfit: tp,
          stopLoss: sl,
          txHash: `0x${txId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 64).padEnd(64, "0")}` as `0x${string}`,
        });
        return;
      }
      if (!publicClient) throw new Error("Wallet is not connected");
      const gasLimit = await estimateBufferedGasLimitWithFloor(publicClient, {
        address: CONTRACTS.DEX,
        abi: PERPETUAL_DEX_ABI,
        functionName: "openPosition",
        args: openArgs,
        account: address,
      }, 120_000n, 220_000n);
      const txHash = await openPosAsync({
        address: CONTRACTS.DEX,
        abi: PERPETUAL_DEX_ABI,
        functionName: "openPosition",
        args: openArgs,
        gas: gasLimit,
      });
      if (!txHash) throw new Error("Transaction was not sent");
      const applyOpenConfirmed = (confirmedReceipt: any) => {
        if (isTxReverted(confirmedReceipt.status)) throw new Error("Open position reverted on-chain");
        const gasUsed: bigint =
          typeof confirmedReceipt.gasUsed === "bigint" ? confirmedReceipt.gasUsed : BigInt(confirmedReceipt.gasUsed ?? 0);
        const gasPrice: bigint =
          typeof confirmedReceipt.effectiveGasPrice === "bigint"
            ? confirmedReceipt.effectiveGasPrice
            : BigInt(confirmedReceipt.effectiveGasPrice ?? 0);
        const txFee = gasUsed === 0n || gasPrice === 0n ? 0 : Number(formatUnits(gasUsed * gasPrice, 18));

        if (priceSnapshot) setEntryPrice(priceSnapshot);
        const newEntry: HistoryEntry = {
          id: crypto.randomUUID?.() ?? `${Date.now()}-open`,
          symbol: chartSymbol,
          action: "open",
          type: positionType,
          amount: amountStr,
          leverage,
          entryPrice: entryPriceValue,
          status: "open",
          timestamp: Date.now(),
          openedAt: Date.now(),
          openTxHash: txHash,
          fee: txFee,
          takeProfit: previewTakeProfitPrice ?? null,
          stopLoss: previewStopLossPrice ?? null,
          volume,
        };
        setTradeHistory((prev) => [newEntry, ...prev]);
        refetchPositions();
        refetchDexBalance();

        // UI notification: confirmed openPosition + copyable info
        setOpenConfirmedNotice({
          createdAt: Date.now(),
          walletAddress: address!,
          market: chartSymbol,
          side: positionType,
          margin: amountStr,
          leverage,
          entryPrice: entryPriceValue,
          takeProfit: previewTakeProfitPrice ?? null,
          stopLoss: previewStopLossPrice ?? null,
          txHash,
        });

        // Register TP/SL with keeper + persist for sync after refresh
        const tp = previewTakeProfitPrice ?? null;
        const sl = previewStopLossPrice ?? null;
        saveTpSlToStorage(address!, chartSymbol, tp, sl);
        registerTpSlWithKeeper(address!, chartSymbol, tp, sl).catch(() => {});
      };

      let receipt: any;
      try {
        receipt = await waitForReceiptWithTimeout(
          txHash,
          "Open position transaction",
          TX_RECEIPT_TIMEOUT_MS_OPEN_SHORT,
          TX_RECEIPT_POLL_MS_OPEN_SHORT,
        );
        applyOpenConfirmed(receipt);
      } catch (e) {
        if (!isReceiptTimeoutError(e)) throw e;

        const longHash = txHash as `0x${string}`;
        openReceiptTimeoutPending = true;
        publicClient
          .waitForTransactionReceipt({
            hash: longHash,
            ...waitOptions,
            timeout: TX_RECEIPT_TIMEOUT_MS_LONG,
            pollingInterval: TX_RECEIPT_POLL_MS,
          })
          .then((bgReceipt) => {
            if (!bgReceipt) return;
            try {
              applyOpenConfirmed(bgReceipt);
              setIsSubmittingPosition(false);
              releaseTxLock("openPosition");
            } catch (err) {
              setTxError(err instanceof Error ? err.message : String(err));
              setIsSubmittingPosition(false);
              releaseTxLock("openPosition");
            }
          })
          .catch(() => {});
        return;
      }
    } catch (e) {
      setPositionAmount(amountStr);
      setTxError(getTxErrorMessage(e, "Open position failed"));
    } finally {
      if (!openReceiptTimeoutPending) {
        setIsSubmittingPosition(false);
        releaseTxLock("openPosition");
      }
    }
  };

  const handleIncreasePosition = async () => {
    if (!positionAmount) return;
    if (!acquireTxLock("increasePosition")) return;
    setTxError(null);
    const amountStr = positionAmount;
    const client = publicClient;
    const parsed = Number(amountStr);
    const freeBalance = Number(formatUnits(dexBalance ?? 0n, 18));
    const available = Math.max(0, Math.min(freeBalance, collateralEquity));
    if (!Number.isNaN(parsed) && parsed > available) {
      setTxError(`Insufficient collateral. Available: ${formatZUSDCNumber(available)} zUSDC`);
      releaseTxLock("increasePosition");
      return;
    }
    const priceSnapshot = displayPrice?.price ?? chartPrice?.price ?? null;
    const entryPriceValue = priceSnapshot ?? 0;
    const parsedAmount = Number(amountStr);
    const volume = parsedAmount * leverage;
    setIsSubmittingPosition(true);
    let increaseReceiptTimeoutPending = false;
    try {
      const incArgs = [symbolToBytes32(chartSymbol), parseUnits(amountStr, 18)] as const;
      if (hashgraphWalletConnect.isConnected()) {
        await hashgraphWalletConnect.executeContractCall(
          CONTRACTS.DEX,
          PERPETUAL_DEX_ABI,
          "increasePosition",
          incArgs,
          650_000,
        );
        setPositionAmount("");
        if (priceSnapshot) setEntryPrice(priceSnapshot);
        const newEntry: HistoryEntry = {
          id: crypto.randomUUID?.() ?? `${Date.now()}-increase`,
          symbol: chartSymbol,
          action: "increase",
          type: positionType,
          amount: amountStr,
          leverage,
          entryPrice: entryPriceValue,
          status: "open",
          timestamp: Date.now(),
          openedAt: Date.now(),
          fee: 0,
          takeProfit: previewTakeProfitPrice ?? null,
          stopLoss: previewStopLossPrice ?? null,
          volume,
        };
        setTradeHistory((prev) => [newEntry, ...prev]);
        refetchPositions();
        refetchDexBalance();
        const tp = previewTakeProfitPrice ?? null;
        const sl = previewStopLossPrice ?? null;
        if (tp !== null || sl !== null) {
          saveTpSlToStorage(address!, chartSymbol, tp, sl);
          registerTpSlWithKeeper(address!, chartSymbol, tp, sl).catch(() => {});
        }
        return;
      }
      if (!client || !publicClient) throw new Error("Wallet is not connected");
      const gasLimit = await estimateBufferedGasLimitWithFloor(publicClient, {
        address: CONTRACTS.DEX,
        abi: PERPETUAL_DEX_ABI,
        functionName: "increasePosition",
        args: incArgs,
        account: address,
      }, 200_000n, 320_000n);
      const txHash = await increasePosAsync({
        address: CONTRACTS.DEX,
        abi: PERPETUAL_DEX_ABI,
        functionName: "increasePosition",
        args: incArgs,
        gas: gasLimit,
      });
      if (!txHash) throw new Error("Transaction was not sent");

      const applyIncreaseConfirmed = (confirmedReceipt: any) => {
        if (isTxReverted(confirmedReceipt.status)) throw new Error("Increase position reverted on-chain");

        const gasUsed: bigint =
          typeof confirmedReceipt.gasUsed === "bigint" ? confirmedReceipt.gasUsed : BigInt(confirmedReceipt.gasUsed ?? 0);
        const gasPrice: bigint =
          typeof confirmedReceipt.effectiveGasPrice === "bigint"
            ? confirmedReceipt.effectiveGasPrice
            : BigInt(confirmedReceipt.effectiveGasPrice ?? 0);
        const txFee = gasUsed === 0n || gasPrice === 0n ? 0 : Number(formatUnits(gasUsed * gasPrice, 18));

        setPositionAmount("");
        if (priceSnapshot) setEntryPrice(priceSnapshot);

        const newEntry: HistoryEntry = {
          id: crypto.randomUUID?.() ?? `${Date.now()}-increase`,
          symbol: chartSymbol,
          action: "increase",
          type: positionType,
          amount: amountStr,
          leverage,
          entryPrice: entryPriceValue,
          status: "open",
          timestamp: Date.now(),
          openedAt: Date.now(),
          fee: txFee,
          takeProfit: previewTakeProfitPrice ?? null,
          stopLoss: previewStopLossPrice ?? null,
          volume,
        };

        setTradeHistory((prev) => [newEntry, ...prev]);
        refetchPositions();
        refetchDexBalance();

        // Register TP/SL with keeper when increasing + persist
        const tp = previewTakeProfitPrice ?? null;
        const sl = previewStopLossPrice ?? null;
        if (tp !== null || sl !== null) {
          saveTpSlToStorage(address!, chartSymbol, tp, sl);
          registerTpSlWithKeeper(address!, chartSymbol, tp, sl).catch(() => {});
        }
      };

      let receipt: any;
      try {
        receipt = await waitForReceiptWithTimeout(
          txHash,
          "Increase position transaction",
          TX_RECEIPT_TIMEOUT_MS_OPEN_SHORT,
          TX_RECEIPT_POLL_MS_OPEN_SHORT,
        );
        applyIncreaseConfirmed(receipt);
      } catch (e) {
        if (!isReceiptTimeoutError(e)) throw e;

        const longHash = txHash as `0x${string}`;
        increaseReceiptTimeoutPending = true;
        client
          .waitForTransactionReceipt({
            hash: longHash,
            ...waitOptions,
            timeout: TX_RECEIPT_TIMEOUT_MS_LONG,
            pollingInterval: TX_RECEIPT_POLL_MS,
          })
          .then((bgReceipt) => {
            if (!bgReceipt) return;
            try {
              applyIncreaseConfirmed(bgReceipt);
              setIsSubmittingPosition(false);
              releaseTxLock("increasePosition");
            } catch (err) {
              setTxError(err instanceof Error ? err.message : String(err));
              setPositionAmount(amountStr);
              setIsSubmittingPosition(false);
              releaseTxLock("increasePosition");
            }
          })
          .catch(() => {});
        return;
      }
    } catch (e) {
      setPositionAmount(amountStr);
      setTxError(getTxErrorMessage(e, "Increase position failed"));
    } finally {
      if (!increaseReceiptTimeoutPending) {
        setIsSubmittingPosition(false);
        releaseTxLock("increasePosition");
      }
    }
  };

  const handleClosePosition = async (market: PolkadotSymbol, amountOverride?: string) => {
    const amountValue = amountOverride ?? closeAmount;
    if (!amountValue) return;
    if (!acquireTxLock("closePosition")) return;
    setTxError(null);
    setIsClosingPosition(true);
    const marketPrice = chartPricesBySymbol[market] ?? (chartSymbol === market ? displayPrice?.price ?? chartPrice?.price : null) ?? getPrice(market)?.price;
    const closePrice = marketPrice ?? 0;
    const amountNumber = Number(amountValue);
    const entryPriceValue = entryPrice ?? closePrice;
    const closingLeverage = pos?.leverage ?? leverage;
    const volume = amountNumber * closingLeverage;
    const closeId = crypto.randomUUID?.() ?? `${Date.now()}-close`;
    const currentPosType = posTypeStr === "-" ? "N/A" : (posTypeStr as "Long" | "Short");

    try {
      const closeArgs = [symbolToBytes32(market), parseUnits(amountValue, 18)] as const;
      if (hashgraphWalletConnect.isConnected()) {
        await hashgraphWalletConnect.executeContractCall(
          CONTRACTS.DEX,
          PERPETUAL_DEX_ABI,
          "closePosition",
          closeArgs,
          700_000,
        );
        setCloseAmount("");
        setCloseConfirmEntry(null);
        const now = Date.now();
        setTradeHistory((prev): HistoryEntry[] =>
          prev.map((entry) =>
            entry.status === "open" && (entry.symbol === market || !entry.symbol)
              ? {
                  ...entry,
                  action: "close",
                  amount: amountValue,
                  status: "closed",
                  timestamp: now,
                  openedAt: entry.openedAt ?? entry.timestamp,
                  closedAt: now,
                  closeReason: "Manual close",
                }
              : entry,
          ),
        );
        saveTpSlToStorage(address!, market, null, null);
        refetchPositions();
        refetchDexBalance();
        syncKeeperOrdersNow();
        setTimeout(() => { syncKeeperOrdersNow(); }, 1500);
        return;
      }
      if (!publicClient) throw new Error("Wallet is not connected");
      const gasLimit = await estimateBufferedGasLimitWithFloor(publicClient, {
        address: CONTRACTS.DEX,
        abi: PERPETUAL_DEX_ABI,
        functionName: "closePosition",
        args: closeArgs,
        account: address,
      }, 320_000n, 450_000n);
      const txHash = await closePosAsync({
        address: CONTRACTS.DEX,
        abi: PERPETUAL_DEX_ABI,
        functionName: "closePosition",
        args: closeArgs,
        gas: gasLimit,
      });
      if (!txHash) throw new Error("Transaction was not sent");

      setCloseAmount("");
      setCloseConfirmEntry(null);

      setIsClosingPosition(false);
      releaseTxLock("closePosition");

      setPendingCloses((prev) => [
        ...prev,
        { id: closeId, txHash, symbol: market, amount: amountValue, type: currentPosType, status: "pending", timestamp: Date.now() },
      ]);

      const applyCloseReceipt = (receipt: any) => {
        if (isTxReverted(receipt.status)) {
          setPendingCloses((prev) =>
            prev.map((p) => (p.id === closeId ? { ...p, status: "failed" as const } : p)),
          );
          setTxError("Close position transaction reverted on-chain");
          return;
        }

        const gasUsed: bigint =
          typeof receipt.gasUsed === "bigint" ? receipt.gasUsed : BigInt(receipt.gasUsed ?? 0);
        const gasPrice: bigint =
          typeof receipt.effectiveGasPrice === "bigint"
            ? receipt.effectiveGasPrice
            : BigInt(receipt.effectiveGasPrice ?? 0);
        const txFee = gasUsed > 0n && gasPrice > 0n ? Number(formatUnits(gasUsed * gasPrice, 18)) : 0;

        setPendingCloses((prev) =>
          prev.map((p) => (p.id === closeId ? { ...p, status: "confirmed" as const } : p)),
        );

        const prices = chartPricesRef.current;
        const priceAtConfirm = prices[market] ?? getPriceRef.current(market)?.price;
        const finalClosePrice =
          priceAtConfirm != null && priceAtConfirm > 0
            ? priceAtConfirm
            : closePrice > 0
              ? closePrice
              : undefined;

        setTradeHistory((prev): HistoryEntry[] => {
          let replaced = false;
          const updatedHistory: HistoryEntry[] = prev.map((entry) => {
            if (!replaced && entry.status === "open" && (entry.symbol === market || !entry.symbol)) {
              replaced = true;
              const now = Date.now();
              return {
                ...entry,
                action: "close",
                amount: amountValue,
                leverage: entry.leverage || closingLeverage,
                entryPrice: entryPriceValue,
                closePrice: finalClosePrice,
                status: "closed",
                timestamp: now,
                openedAt: entry.openedAt ?? entry.timestamp,
                closedAt: now,
                closeTxHash: txHash as `0x${string}`,
                closeReason: "Manual close",
                fee: txFee,
                takeProfit: previewTakeProfitPrice ?? null,
                stopLoss: previewStopLossPrice ?? null,
                volume,
              };
            }
            return entry;
          });
          if (!replaced) {
            const now = Date.now();
            return [
              {
                id: closeId,
                symbol: market,
                action: "close",
                type: currentPosType,
                amount: amountValue,
                leverage: closingLeverage,
                entryPrice: entryPriceValue,
                closePrice: finalClosePrice,
                status: "closed",
                timestamp: now,
                openedAt: now,
                closedAt: now,
                closeTxHash: txHash as `0x${string}`,
                closeReason: "Manual close",
                fee: txFee,
                takeProfit: previewTakeProfitPrice ?? null,
                stopLoss: previewStopLossPrice ?? null,
                volume,
              },
              ...prev,
            ];
          }
          return updatedHistory;
        });

        saveTpSlToStorage(address!, market, null, null);
        refetchPositions();
        refetchDexBalance();
        syncKeeperOrdersNow();
        setTimeout(() => { syncKeeperOrdersNow(); }, 1500);
      };

      try {
        const receipt = await waitForReceiptWithTimeout(txHash as `0x${string}`, "Close position transaction");
        applyCloseReceipt(receipt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("taking too long");

        if (isTimeout) {
          // Keep pending: the tx may still confirm after our UI timeout.
          // Background wait will eventually reconcile the history via keeper sync anyway.
          publicClient
            .waitForTransactionReceipt({
              hash: txHash as `0x${string}`,
              ...waitOptions,
              timeout: TX_RECEIPT_TIMEOUT_MS_LONG,
              pollingInterval: TX_RECEIPT_POLL_MS,
            })
            .then(applyCloseReceipt)
            .catch(() => {
              // Still no receipt; leave as pending.
            });
          return;
        }

        // Non-timeout failures: mark failed.
        setPendingCloses((prev) =>
          prev.map((p) => (p.id === closeId ? { ...p, status: "failed" as const } : p)),
        );
        setTxError("Failed to confirm close position transaction");
      }
    } catch (e) {
      if (!amountOverride) setCloseAmount(amountValue);
      setTxError(getTxErrorMessage(e, "Close position failed"));
      setIsClosingPosition(false);
      releaseTxLock("closePosition");
    } finally {
      setIsSubmittingPosition(false);
    }
  };

  const handleTimeScaleRightOffsetChange = useCallback((offset: number) => {
    setChartRightOffset(offset);
  }, []);

  const pos = position as PositionData | undefined;
  const hasPosition = Boolean(pos && pos.amount > 0n);
  const posTypeStr = pos ? (pos.position === 0 ? "Long" : "Short") : "-";
  const positionMargin = pos ? Number(formatUnits(pos.amount, 18)) : 0;
  const positionSide = pos ? (pos.position === 0 ? "Long" : "Short") : "Long";
  const notConnected = !address;
  const { getPrice } = usePolkadotPrices();
  const btcPrice = getPrice("BTCUSD");
  const ethPrice = getPrice("ETHUSD");
  const hbarPrice = getPrice("HBARUSD");

  const { price: chartPrice } = useChartPrice(chartSymbol);
  const { price: btcChartPrice } = useChartPrice("BTCUSD");
  const { price: ethChartPrice } = useChartPrice("ETHUSD");

  const chartPricesBySymbol = useMemo(
    (): Partial<Record<PolkadotSymbol, number | undefined>> => ({
      BTCUSD: btcChartPrice?.price,
      ETHUSD: ethChartPrice?.price,
      HBARUSD: hbarPrice?.price,
    }),
    [btcChartPrice?.price, ethChartPrice?.price, hbarPrice?.price],
  );
  const chartPricesRef = useRef(chartPricesBySymbol);
  chartPricesRef.current = chartPricesBySymbol;
  const getPriceRef = useRef(getPrice);
  getPriceRef.current = getPrice;
  const tradingviewSymbol = TRADINGVIEW_SYMBOL_MAP[chartSymbol] ?? chartSymbol;
  const chartLabel = chartPrice ? `${chartSymbol} · Pyth Benchmarks` : undefined;
  const displayPrice = chartPrice ?? getPrice(chartSymbol);
  const [entryPrice, setEntryPrice] = useState<number | null>(null);
  const [targetPercent, setTargetPercent] = useState(5);
  const [stopLossPercent, setStopLossPercent] = useState(2);
  const [tpSlMode, setTpSlMode] = useState<TpSlMode>("roi");
  const [keeperOpenOrders, setKeeperOpenOrders] = useState<KeeperOrder[]>([]);
  const [keeperOrdersAll, setKeeperOrdersAll] = useState<KeeperOrder[]>([]);
  const [previewLiquidationPrice, setPreviewLiquidationPrice] = useState<number | null>(null);
  const [previewTakeProfitPrice, setPreviewTakeProfitPrice] = useState<number | null>(null);
  const [previewStopLossPrice, setPreviewStopLossPrice] = useState<number | null>(null);
  const [infoModal, setInfoModal] = useState<{ title: string; body: string } | null>(null);
  const [closeConfirmEntry, setCloseConfirmEntry] = useState<HistoryEntry | null>(null);

  type PanelCloseConfirm = {
    market: PolkadotSymbol;
    amount: string;
    side: "Long" | "Short";
    margin: number;
    leverage: number;
    size: number;
    entryPrice: number;
    currentPrice: number;
    pnl: number;
    remaining: number;
  };
  const [panelCloseConfirm, setPanelCloseConfirm] = useState<PanelCloseConfirm | null>(null);

  type PendingClose = {
    id: string;
    txHash: string;
    symbol: PolkadotSymbol;
    amount: string;
    type: "Long" | "Short" | "N/A";
    status: "pending" | "confirmed" | "failed";
    timestamp: number;
  };
  const [pendingCloses, setPendingCloses] = useState<PendingClose[]>([]);

  useEffect(() => {
    const settled = pendingCloses.filter((p) => p.status !== "pending");
    if (settled.length === 0) return;
    const timer = setTimeout(() => {
      setPendingCloses((prev) => prev.filter((p) => p.status === "pending"));
    }, 6000);
    return () => clearTimeout(timer);
  }, [pendingCloses]);
  const handlePositionAmountChange = useCallback(
    (value: string) => {
      if (value.trim()) {
        setCloseAmount("");
      }
      setPositionAmount(value);
    },
    [setCloseAmount],
  );
  const handleCloseAmountChange = useCallback(
    (value: string) => {
      if (value.trim()) {
        setPositionAmount("");
      }
      setCloseAmount(value);
    },
    [setPositionAmount],
  );

  const closeAmountNum = closeAmount.trim() ? Number(closeAmount) : 0;

  const positionAmountNum = positionAmount.trim() ? Number(positionAmount) : 0;

  const orderSize = useMemo(() => {
    const trimmedClose = closeAmount.trim();
    if (trimmedClose) {
      const normalizedClose = Number(trimmedClose);
      if (Number.isNaN(normalizedClose)) {
        return null;
      }
      const activeLeverage = pos?.leverage ?? leverage;
      return normalizedClose * activeLeverage;
    }

    const trimmedAmount = positionAmount.trim();
    if (!trimmedAmount) {
      return null;
    }
    const normalizedAmount = Number(trimmedAmount);
    if (Number.isNaN(normalizedAmount)) {
      return null;
    }
    return normalizedAmount * leverage;
  }, [closeAmount, positionAmount, leverage, pos?.leverage]);
  const prevHasPosition = useRef<boolean>(hasPosition);

  // Sync all open positions with keeper when TP/SL set (from tradeHistory or localStorage)
  const syncedPositionsRef = useRef<Set<string>>(new Set());
  const prevOnChainAmountsRef = useRef<Record<PolkadotSymbol, bigint>>({} as Record<PolkadotSymbol, bigint>);
  useEffect(() => {
    if (!address) return;

    // If an on-chain position was previously open but is now gone, mark the latest "open" UI history entry
    // as closed so the UI doesn't keep showing a stale "Open" row.
    const closedSymbols: PolkadotSymbol[] = [];
    for (const sym of POLKADOT_SYMBOLS) {
      const prevAmt = prevOnChainAmountsRef.current[sym] ?? 0n;
      const curAmt = positionsBySymbol[sym]?.amount ?? 0n;
      if (prevAmt > 0n && curAmt <= 0n) closedSymbols.push(sym);
      prevOnChainAmountsRef.current[sym] = curAmt;
    }
    if (closedSymbols.length) {
      const prices = chartPricesRef.current;
      setTradeHistory((prev): HistoryEntry[] => {
        let mutated = false;
        let next = prev;
        for (const sym of closedSymbols) {
          let replaced = false;
          next = next.map((entry) => {
            if (
              !replaced &&
              entry.status === "open" &&
              (entry.symbol === sym || !entry.symbol)
            ) {
              replaced = true;
              mutated = true;
              const closePrice = prices[sym] ?? getPriceRef.current(sym)?.price ?? null;
              const now = Date.now();
              return {
                ...entry,
                action: "close",
                status: "closed",
                closePrice: closePrice && closePrice > 0 ? closePrice : (entry.closePrice ?? undefined),
                timestamp: now,
                openedAt: entry.openedAt ?? entry.timestamp,
                closedAt: now,
              };
            }
            return entry;
          });
        }
        return mutated ? next : prev;
      });
    }

    for (const sym of POLKADOT_SYMBOLS) {
      const pos = positionsBySymbol[sym];
      if (!pos || pos.amount <= 0n) {
        syncedPositionsRef.current.delete(`${address.toLowerCase()}:${sym}`);
        saveTpSlToStorage(address, sym, null, null);
        continue;
      }
      const key = `${address.toLowerCase()}:${sym}`;
      if (syncedPositionsRef.current.has(key)) continue;
      const openEntry = tradeHistory.find(
        (e) => e.status === "open" && (e.symbol === sym || !e.symbol),
      );
      let tp = openEntry?.takeProfit ?? null;
      let sl = openEntry?.stopLoss ?? null;
      if (tp == null && sl == null) {
        const stored = getTpSlFromStorage(address, sym);
        if (stored) {
          tp = stored.tp;
          sl = stored.sl;
        }
      }
      if (tp == null && sl == null) continue;
      syncedPositionsRef.current.add(key);
      registerTpSlWithKeeper(address, sym, tp, sl).catch(() => {});
    }
  }, [address, positionsBySymbol, tradeHistory]);

  const syncKeeperOrdersNow = useCallback(async () => {
    if (!address) return;
    const base = KEEPER_URL.replace(/\/$/, "");
    const normalized = address.toLowerCase();
    try {
      const [openRes, allRes] = await Promise.all([
        fetch(`${base}/orders?status=Open&limit=500`),
        fetch(`${base}/orders?limit=500`),
      ]);
      if (openRes.ok) {
        const openData = (await openRes.json()) as unknown;
        if (Array.isArray(openData)) {
          const mine = (openData as KeeperOrder[]).filter(
            (o) => o && typeof o.walletAddress === "string" && o.walletAddress.toLowerCase() === normalized,
          );
          setKeeperOpenOrders(mine);
        }
      }
      if (allRes.ok) {
        const allData = (await allRes.json()) as unknown;
        if (Array.isArray(allData)) {
          const mine = (allData as KeeperOrder[]).filter(
            (o) => o && typeof o.walletAddress === "string" && o.walletAddress.toLowerCase() === normalized,
          );
          setKeeperOrdersAll(mine);
        }
      }
    } catch {
      // non-fatal
    }
  }, [address]);

  // Keep UI TP/SL/Liq aligned with keeper by polling open orders.
  useEffect(() => {
    if (!address) {
      setKeeperOpenOrders([]);
      return;
    }
    const base = KEEPER_URL.replace(/\/$/, "");
    let stopped = false;

    const poll = async () => {
      try {
        const res = await fetch(`${base}/orders?status=Open&limit=500`);
        if (!res.ok) return;
        const data = (await res.json()) as unknown;
        if (stopped || !Array.isArray(data)) return;
        const normalized = address.toLowerCase();
        const mine = (data as KeeperOrder[]).filter(
          (o) => o && typeof o.walletAddress === "string" && o.walletAddress.toLowerCase() === normalized,
        );
        setKeeperOpenOrders(mine);
      } catch {
        // non-fatal
      }
    };

    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [address]);

  // Keep history timestamps aligned across devices by polling keeper orders (all statuses).
  useEffect(() => {
    if (!address) {
      setKeeperOrdersAll([]);
      return;
    }
    const base = KEEPER_URL.replace(/\/$/, "");
    let stopped = false;

    const poll = async () => {
      try {
        const res = await fetch(`${base}/orders?limit=500`);
        if (!res.ok) return;
        const data = (await res.json()) as unknown;
        if (stopped || !Array.isArray(data)) return;
        const normalized = address.toLowerCase();
        const mine = (data as KeeperOrder[]).filter(
          (o) => o && typeof o.walletAddress === "string" && o.walletAddress.toLowerCase() === normalized,
        );
        setKeeperOrdersAll(mine);
      } catch {
        // non-fatal
      }
    };

    poll();
    const timer = setInterval(poll, 8000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [address]);

  // Backfill close reason for non-manual closes using keeper order status.
  useEffect(() => {
    if (keeperOrdersAll.length === 0) return;
    setTradeHistory((prev) => {
      let changed = false;
      const next = prev.map((e) => {
        if (e.status !== "closed") return e;
        // Only skip when we already have a non-manual classification.
        // If it's "Manual close", we still want keeper-derived TP/SL/Liq to override it.
        if (e.closeReason && e.closeReason !== "Manual close") return e;
        if (e.action === "close" && !e.closeReason) return { ...e, closeReason: "Manual close" as const };

        const match =
          (e.openTxHash
            ? keeperOrdersAll.find((o) => (o.openTxHash ?? "").toLowerCase() === e.openTxHash!.toLowerCase())
            : null) ??
          (e.closeTxHash
            ? keeperOrdersAll.find((o) => (o.closeTxHash ?? "").toLowerCase() === e.closeTxHash!.toLowerCase())
            : null) ??
          null;

        if (!match) return e;

        const effectiveExisting: HistoryEntry = match.side
          ? { ...e, type: match.side as HistoryEntry["type"] }
          : e;

        const reason = deriveCloseReason(match, effectiveExisting);

        if (!reason) return e;
        // Always allow keeper-derived classification to override stale local "Manual close".
        changed = true;
        return {
          ...e,
          type: (match.side ?? e.type) as HistoryEntry["type"],
          entryPrice: (match.entryPrice ?? e.entryPrice) as number,
          closePrice: (match.closePrice ?? e.closePrice) as number | undefined,
          leverage: match.leverage ?? e.leverage,
          amount: (match.marginAmount ?? e.amount) as string,
          closeReason: reason,
        };
      });
      return changed ? next : prev;
    });
  }, [keeperOrdersAll]);

  // When keeper auto-closes a position for this wallet, ask UI to reset caches.
  useEffect(() => {
    if (!address) return;
    const base = KEEPER_URL.replace(/\/$/, "");
    let stopped = false;
    let lastResetAt = 0;

    const poll = async () => {
      try {
        const res = await fetch(`${base}/cache/reset?wallet=${encodeURIComponent(address)}`);
        if (!res.ok) return;
        const data = (await res.json()) as any;
        if (stopped) return;
        const resetAt = Number(data?.lastResetAt ?? 0);
        if (!Number.isFinite(resetAt) || resetAt <= 0) return;
        if (lastResetAt === 0) {
          lastResetAt = resetAt;
          return;
        }
        if (resetAt > lastResetAt) {
          lastResetAt = resetAt;
          resetBrowserCacheForUser();
        }
      } catch {
        // non-fatal
      }
    };

    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [address, resetBrowserCacheForUser]);

  // Reconcile local "open" history with keeper closures (fix stale Open Positions UI).
  useEffect(() => {
    if (!address) return;
    if (keeperOrdersAll.length === 0) return;
    const normalized = address.toLowerCase();

    setTradeHistory((prev) => {
      let changed = false;
      const next = prev.map((e) => {
        if (e.status !== "open") return e;
        if (!e.openTxHash) return e;

        const match = keeperOrdersAll.find(
          (o) =>
            (o.openTxHash ?? "").toLowerCase() === e.openTxHash!.toLowerCase() &&
            String(o.walletAddress ?? "").toLowerCase() === normalized,
        );

        if (!match) return e;
        if (match.status === "Open") return e;

        const reason = deriveCloseReason(match, e);
        const closedAtMs =
          match.closedAt != null && match.closedAt.length > 0 ? Date.parse(match.closedAt) : NaN;
        const ts = Number.isFinite(closedAtMs) ? closedAtMs : Date.now();
        const keeperClosePrice =
          match.closePrice ??
          match.stopLossPrice ??
          match.takeProfitPrice ??
          match.liquidationPrice ??
          undefined;

        changed = true;
        return {
          ...e,
          action: "close" as const,
          status: "closed" as const,
          timestamp: ts,
          openedAt: e.openedAt ?? e.timestamp,
          closedAt: ts,
          closeTxHash: (match.closeTxHash as `0x${string}` | undefined) ?? e.closeTxHash,
          closePrice: keeperClosePrice ?? e.closePrice,
          entryPrice: match.entryPrice ?? e.entryPrice,
          // IMPORTANT: PnL sign depends on `type` (Long/Short).
          // Keeper provides `side`, so we must sync it to avoid "Stop loss but PnL positive".
          type: (match.side ?? e.type) as HistoryEntry["type"],
          leverage: match.leverage ?? e.leverage,
          amount: (match.marginAmount ?? e.amount) as string,
          // Prefer keeper classification (TP/SL/Liq) over stale local cache.
          closeReason: reason ?? e.closeReason,
        };
      });
      return changed ? next : prev;
    });
  }, [address, keeperOrdersAll]);
  useEffect(() => {
    if (prevHasPosition.current && !hasPosition) {
      setLeverage(2);
    }
    prevHasPosition.current = hasPosition;
  }, [hasPosition]);

  useEffect(() => {
    setEntryPrice(displayPrice?.price ?? null);
  }, [chartSymbol, displayPrice?.price]);

  useEffect(() => {
    if (!address) {
      setInfoModal(null);
      return;
    }

    if (dexBalance === undefined) {
      return;
    }

    if (dexBalance === 0n) {
      setInfoModal({
        title: "Deposit zUSDC First",
        body: `Please deposit zUSDC (contract ${CONTRACTS.TOKEN}) into the DEX before trading. zUSDC is required for margin and gas.`,
      });
      return;
    }

    const depositedAmount = formatUnits(dexBalance, 18);
    let positionSummary = "You currently have no open positions.";
    const activePositions: string[] = [];
    for (const sym of POLKADOT_SYMBOLS) {
      const p = positionsBySymbol[sym];
      if (p && p.amount > 0n) {
        const side = p.position === 0 ? "Long" : "Short";
        activePositions.push(`${formatUnits(p.amount, 18)} ${sym} ${side} @ ${p.leverage}x`);
      }
    }
    if (activePositions.length > 0) {
      positionSummary = `Open: ${activePositions.join("; ")}.`;
    }

    setInfoModal({
      title: "Account Snapshot",
      body: `You have deposited ${depositedAmount} zUSDC. ${positionSummary}`,
    });
  }, [address, dexBalance, positionsBySymbol]);

  const effectiveEntryPrice = entryPrice ?? displayPrice?.price ?? null;
  const effectiveSide =
    hasPosition && pos
      ? pos.position === 0
        ? "Long"
        : "Short"
      : positionType;
  const effectiveLeverage =
    hasPosition && pos ? pos.leverage : Math.max(1, leverage);

  const calculatePreviewValues = useCallback(
    (
      price: number | null,
      leverageValue: number,
      side: "Long" | "Short",
      tpPercentage: number,
      slPercentage: number
    ) => {
      if (price == null || leverageValue <= 0) {
        return {
          liquidationPrice: null,
          takeProfitPrice: null,
          stopLossPrice: null,
        };
      }
      const safeLeverage = Math.max(1, leverageValue);
      // Keep liquidation consistent with our PnL model (MMR=1%).
      const liquidationPrice = Number(calculateLiquidationPrice(side, price, safeLeverage, 0.01));
      const { takeProfitPrice, stopLossPrice } = calcTpSlPrices(
        side,
        price,
        safeLeverage,
        tpPercentage,
        slPercentage,
        tpSlMode,
      );
      return {
        liquidationPrice,
        takeProfitPrice,
        stopLossPrice,
      };
    },
    [tpSlMode]
  );

  useEffect(() => {
    const basePrice = effectiveEntryPrice;
    const preview = calculatePreviewValues(
      basePrice,
      effectiveLeverage,
      effectiveSide,
      targetPercent,
      stopLossPercent
    );
    setPreviewLiquidationPrice(preview.liquidationPrice);
    setPreviewTakeProfitPrice(preview.takeProfitPrice);
    setPreviewStopLossPrice(preview.stopLossPrice);
  }, [
    calculatePreviewValues,
    effectiveEntryPrice,
    effectiveLeverage,
    effectiveSide,
    targetPercent,
    stopLossPercent,
  ]);

  const chartOrderLines = useMemo(() => {
    if (!hasPosition) return undefined;
    const lines: Array<{
      name: string;
      price: number;
      color: string;
      lineWidth?: number;
      lineStyle?: number;
      labelAlign?: "top" | "bottom";
    }> = [];
    const addLine = (
      name: string,
      price: number | null | undefined,
      color: string,
      lineStyle: number,
      labelAlign: "top" | "bottom" = "top",
      lineWidth?: number,
    ) => {
      if (price == null || Number.isNaN(price) || !Number.isFinite(price)) return;
      lines.push({ name, price, color, lineStyle, labelAlign, lineWidth });
    };
    addLine("Entry Price", effectiveEntryPrice, "#ffffff", 0, "top", 0.5);
    const keeperForSymbol = keeperOpenOrders.find((o) => o.market === chartSymbol && o.status === "Open");
    const liq = keeperForSymbol?.liquidationPrice ?? previewLiquidationPrice;
    const tp = keeperForSymbol?.takeProfitPrice ?? previewTakeProfitPrice;
    const sl = keeperForSymbol?.stopLossPrice ?? previewStopLossPrice;
    addLine("Liquidation", liq, "#ef4444", 1, "bottom", 1);
    addLine("Take Profit", tp, "#22c55e", 1, "top", 1);
    addLine("Stop Loss", sl, "#eab308", 1, "bottom", 1);
    return lines.length > 0 ? lines : undefined;
  }, [
    hasPosition,
    effectiveEntryPrice,
    previewLiquidationPrice,
    previewTakeProfitPrice,
    previewStopLossPrice,
    keeperOpenOrders,
    chartSymbol,
  ]);

  const historyTabOptions = [
    { key: "timeline", label: "Order Timeline" },
    { key: "open", label: "Open Positions" },
    { key: "closed", label: "Closed Positions" },
  ] as const;

  const openHistory = tradeHistory.filter((entry) => entry.status === "open");
  const closedHistory = tradeHistory.filter((entry) => entry.status === "closed");
  const historyEntries =
    historyTab === "timeline" ? tradeHistory : historyTab === "open" ? openHistory : closedHistory;
  const depositWithdrawHistory = useMemo(() => {
    type CombinedRecord = { id: string; amount: number; timestamp: number; type: "Deposit" | "Withdraw" };
    const deposits: CombinedRecord[] = depositHistory.map((record) => ({ ...record, type: "Deposit" }));
    const withdraws: CombinedRecord[] = withdrawHistory.map((record) => ({ ...record, type: "Withdraw" }));
    return [...deposits, ...withdraws]
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [depositHistory, withdrawHistory]);

  const openPositionEntries = useMemo(() => tradeHistory.filter((entry) => entry.status === "open"), [tradeHistory]);
  const openPositionMargin = useMemo(() => {
    let total = 0;
    for (const sym of POLKADOT_SYMBOLS) {
      const p = positionsBySymbol[sym];
      if (p && p.amount > 0n) total += Number(formatUnits(p.amount, 18));
    }
    return total;
  }, [positionsBySymbol]);
  const openPositionSide = useMemo(() => {
    const sides = new Set<string>();
    for (const sym of POLKADOT_SYMBOLS) {
      const p = positionsBySymbol[sym];
      if (p && p.amount > 0n) sides.add(p.position === 0 ? "Long" : "Short");
    }
    if (sides.size > 1) return "Multiple";
    if (sides.size === 1) return [...sides][0]!;
    return openPositionEntries.length > 0 ? openPositionEntries[openPositionEntries.length - 1]?.type ?? posTypeStr : posTypeStr;
  }, [positionsBySymbol, openPositionEntries, posTypeStr]);

  const totalUnrealizedPnL = useMemo(() => {
    let sum = 0;
    for (const entry of openPositionEntries) {
      const sym = entry.symbol ?? chartSymbol;
      const price = chartPricesBySymbol[sym];
      const pnl = calculatePnL(entry, price ?? undefined);
      if (pnl != null) sum += pnl;
    }
    return sum;
  }, [openPositionEntries, chartPricesBySymbol, chartSymbol]);

  const currentPositionUnrealizedPnL = useMemo(() => {
    let sum = 0;
    for (const entry of openPositionEntries) {
      if (entry.symbol !== chartSymbol && entry.symbol) continue;
      const price = chartPricesBySymbol[entry.symbol ?? chartSymbol];
      const pnl = calculatePnL(entry, price ?? undefined);
      if (pnl != null) sum += pnl;
    }
    return sum;
  }, [openPositionEntries, chartSymbol, chartPricesBySymbol]);

  const maxCloseAmount = Math.max(
    0,
    Math.min(positionMargin, positionMargin + currentPositionUnrealizedPnL),
  );
  const closeExceedsMax =
    closeAmount.trim().length > 0 &&
    !Number.isNaN(closeAmountNum) &&
    closeAmountNum > maxCloseAmount &&
    maxCloseAmount > 0;

  const leverageUi = useMemo(() => {
    const pct = Math.max(0, Math.min(1, (leverage - 1) / 24));
    const colorClass =
      leverage <= 5
        ? "text-emerald-400"
        : leverage <= 12
          ? "text-amber-300"
          : "text-rose-400";
    const glowClass =
      leverage <= 5
        ? "shadow-[0_0_14px_rgba(16,185,129,0.25)]"
        : leverage <= 12
          ? "shadow-[0_0_14px_rgba(251,191,36,0.25)]"
          : "shadow-[0_0_14px_rgba(244,63,94,0.28)]";
    const riskLabel = leverage <= 5 ? "Low risk" : leverage <= 12 ? "Medium risk" : "High risk";
    const activeTrack = `linear-gradient(90deg, #3b82f6 0%, ${leverage <= 5 ? "#10b981" : leverage <= 12 ? "#f59e0b" : "#f43f5e"} ${Math.round(
      pct * 100,
    )}%, #363a59 ${Math.round(pct * 100)}%, #363a59 100%)`;
    return { colorClass, glowClass, riskLabel, activeTrack };
  }, [leverage]);

  const closeWarning = useMemo(() => {
    if (!closeExceedsMax || !pos) return null;
    const currentPrice = displayPrice?.price ?? 0;
    const ep = entryPrice ?? currentPrice;
    const side = pos.position === 0 ? "Long" : "Short";
    const lev = pos.leverage;
    const size = positionMargin * lev;
    let pnl = 0;
    if (ep > 0 && currentPrice > 0) {
      const delta = side === "Long" ? currentPrice - ep : ep - currentPrice;
      pnl = (delta / ep) * size;
    }
    return {
      side,
      entryPrice: ep,
      currentPrice,
      margin: positionMargin,
      leverage: lev,
      size,
      pnl,
    };
  }, [closeExceedsMax, pos, displayPrice?.price, entryPrice, positionMargin]);

  const collateralEquity = useMemo(() => {
    // On-chain `dexBalance` already includes realized PnL from closed positions.
    // Equity = free balance + open margin + unrealized PnL.
    const deposited = Number(formatUnits(dexBalance ?? 0n, 18)) + openPositionMargin;
    return deposited + totalUnrealizedPnL;
  }, [dexBalance, openPositionMargin, totalUnrealizedPnL]);

  const dexBalanceNum = Number(formatUnits(dexBalance ?? 0n, 18));
  const maxAvailableMargin = Math.max(0, Math.min(dexBalanceNum, collateralEquity));
  const positionExceedsCollateral =
    positionAmount.trim().length > 0 &&
    !Number.isNaN(positionAmountNum) &&
    positionAmountNum > maxAvailableMargin &&
    maxAvailableMargin >= 0;

  const renderHistoryEntry = (entry: HistoryEntry) => {
    const entrySymbol = entry.symbol ?? chartSymbol;
    const keeperForSymbol = keeperOpenOrders.find((o) => o.market === entrySymbol && o.status === "Open");
    const keeperByHash =
      (entry.openTxHash
        ? keeperOrdersAll.find((o) => (o.openTxHash ?? "").toLowerCase() === entry.openTxHash!.toLowerCase())
        : null) ??
      (entry.closeTxHash
        ? keeperOrdersAll.find((o) => (o.closeTxHash ?? "").toLowerCase() === entry.closeTxHash!.toLowerCase())
        : null) ??
      null;
    const keeperForTime = keeperByHash ?? (() => {
      // Fallback for legacy local history entries that don't have tx hashes.
      const targetClosedAt = entry.closedAt ?? entry.timestamp;
      let best: KeeperOrder | null = null;
      let bestDiff = Number.POSITIVE_INFINITY;
      for (const o of keeperOrdersAll) {
        if (o.market !== entrySymbol) continue;
        if (o.status === "Open" || !o.closedAt) continue;
        const closeTs = Date.parse(o.closedAt);
        if (!Number.isFinite(closeTs)) continue;
        const diff = Math.abs(closeTs - targetClosedAt);
        if (diff < bestDiff) {
          best = o;
          bestDiff = diff;
        }
      }
      // Keep strict enough to avoid mismatching unrelated orders.
      return bestDiff <= 30 * 60 * 1000 ? best : null;
    })();
    const keeperOpenedAtMs = keeperForTime?.openedAt ? Date.parse(keeperForTime.openedAt) : NaN;
    const keeperClosedAtMs = keeperForTime?.closedAt ? Date.parse(keeperForTime.closedAt) : NaN;
    const currentPrice = chartPricesBySymbol[entrySymbol];
    const keeperClosePrice =
      keeperForTime?.closePrice ??
      keeperForTime?.stopLossPrice ??
      keeperForTime?.takeProfitPrice ??
      keeperForTime?.liquidationPrice ??
      undefined;
    const pnlEntry: HistoryEntry = (() => {
      if (!keeperForTime) return entry;
      if (entry.status !== "closed") return entry;

      // Always sync side from keeper when available, since PnL sign depends on it.
      const syncedSide: HistoryEntry = keeperForTime.side
        ? { ...entry, type: keeperForTime.side }
        : entry;

      // Only backfill prices/amounts/leverage when local history is missing or invalid.
      const nextEntryPrice =
        typeof keeperForTime.entryPrice === "number" && keeperForTime.entryPrice > 0
          ? keeperForTime.entryPrice
          : syncedSide.entryPrice;
      const nextClosePrice =
        typeof keeperClosePrice === "number" && keeperClosePrice > 0
          ? keeperClosePrice
          : syncedSide.closePrice;
      const nextLeverage =
        typeof keeperForTime.leverage === "number" && keeperForTime.leverage > 0
          ? keeperForTime.leverage
          : syncedSide.leverage;
      const nextAmount =
        typeof keeperForTime.marginAmount === "string" && keeperForTime.marginAmount.length > 0
          ? keeperForTime.marginAmount
          : syncedSide.amount;
      const nextVolume =
        typeof keeperForTime.positionSize === "string" && keeperForTime.positionSize.length > 0
          ? Number(keeperForTime.positionSize)
          : syncedSide.volume;

      return {
        ...syncedSide,
        entryPrice: nextEntryPrice,
        closePrice: nextClosePrice,
        leverage: nextLeverage,
        amount: nextAmount,
        volume: Number.isFinite(nextVolume ?? NaN) ? nextVolume : syncedSide.volume,
      };
    })();
    const resolvedEntryPrice = pnlEntry.entryPrice;
    const resolvedClosePrice =
      pnlEntry.status === "closed"
        ? (pnlEntry.closePrice ?? keeperClosePrice)
        : currentPrice;
    const resolvedSizeUsd =
      pnlEntry.volume != null && Number.isFinite(pnlEntry.volume) && pnlEntry.volume > 0
        ? pnlEntry.volume
        : Number(pnlEntry.amount) * pnlEntry.leverage;
    const pnlValue =
      resolvedClosePrice != null &&
      (pnlEntry.type === "Long" || pnlEntry.type === "Short")
        ? calculatePnLFromResolved(pnlEntry.type, resolvedEntryPrice, resolvedClosePrice, resolvedSizeUsd)
        : calculatePnL(pnlEntry, currentPrice);
    const keeperDerivedCloseReason =
      entry.status === "closed" && keeperForTime ? deriveCloseReason(keeperForTime, entry) : undefined;

    const displayCloseReason =
      entry.status === "closed"
        ? (keeperDerivedCloseReason ?? entry.closeReason ?? "Manual close")
        : undefined;
    const sizeValue = resolvedSizeUsd;
    const openTimestamp = formatTimestamp(
      Number.isFinite(keeperOpenedAtMs) ? keeperOpenedAtMs : (entry.openedAt ?? entry.timestamp),
    );
    const closeTimestamp =
      entry.status === "closed"
        ? formatTimestamp(
            Number.isFinite(keeperClosedAtMs) ? keeperClosedAtMs : (entry.closedAt ?? entry.timestamp),
          )
        : "Open";
    const pnlClass =
      pnlValue == null ? "text-slate-400" : pnlValue >= 0 ? "text-emerald-400" : "text-rose-400";
    const hasDataMismatch =
      pnlValue != null &&
      Number.isFinite(pnlValue) &&
      Number.isFinite(sizeValue) &&
      sizeValue > 0 &&
      Math.abs(pnlValue) > sizeValue * 3;
    const priceTextColor =
      currentPrice == null || entry.entryPrice == null
        ? "text-white"
        : currentPrice > entry.entryPrice
        ? "text-emerald-400"
        : "text-rose-400";
    const liqPriceValue =
      entry.status === "open" && keeperForSymbol?.liquidationPrice != null
        ? keeperForSymbol.liquidationPrice
        : Number(
            calculateLiquidationPrice(
              entry.type === "N/A" ? "Long" : entry.type,
              entry.entryPrice,
              entry.leverage,
            ),
          );
    const liqDistancePct =
      currentPrice == null || liqPriceValue === 0 ? Number.POSITIVE_INFINITY : Math.abs(currentPrice - liqPriceValue) / liqPriceValue;
    const isLiqNear = liqDistancePct <= 0.05;
    const liqDangerClass = isLiqNear
      ? `animate-pulse ${
          currentPrice != null &&
          entry.type !== "N/A" &&
          ((entry.type === "Long" && currentPrice <= liqPriceValue) || (entry.type === "Short" && currentPrice >= liqPriceValue))
            ? "text-rose-400"
            : "text-orange-400"
        }`
      : "text-white";

    return (
      <div
        key={entry.id}
        className="w-max min-w-full rounded-2xl border border-[#363a59] bg-[#121421]/60 p-4 shadow-inner shadow-black/20"
      >
        {hasDataMismatch && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-300">
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] font-bold text-amber-200">
              !
            </span>
            <span className="font-semibold tracking-wide">Data mismatch</span>
            <span className="text-amber-200/90">
              |abs(PnL)| vượt ngưỡng an toàn ({formatCurrency(sizeValue * 3)})
            </span>
          </div>
        )}
        <div className="flex flex-nowrap gap-3 text-[11px] sm:text-[12px]">
          {[
            ["Market", entrySymbol],
            ["Open Time", openTimestamp],
            ["Position", entry.type],
            ["Entry", formatForSymbol(resolvedEntryPrice, entrySymbol)],
            [
              "Price",
              entry.status === "closed"
                ? formatForSymbol(resolvedClosePrice, entrySymbol)
                : (currentPrice != null ? formatForSymbol(currentPrice, entrySymbol) : "—"),
            ],
            ["Liq. Price", !liqPriceValue || Number.isNaN(liqPriceValue) ? "—" : formatCurrency(liqPriceValue)],
            ["Margin", formatZUSDCNumber(Number(entry.amount))],
            ["Leverage", `${entry.leverage}x`],
            ["Size", formatCurrency(sizeValue)],
            ["Exc Fee", formatCurrency(entry.fee)],
            ["PnL", pnlValue == null ? "—" : formatCurrency(pnlValue)],
            [
              "Take Profit",
              entry.status === "open"
                ? formatForSymbol(keeperForSymbol?.takeProfitPrice ?? entry.takeProfit, entrySymbol)
                : formatForSymbol(entry.takeProfit, entrySymbol),
            ],
            [
              "Stop Loss",
              entry.status === "open"
                ? formatForSymbol(keeperForSymbol?.stopLossPrice ?? entry.stopLoss, entrySymbol)
                : formatForSymbol(entry.stopLoss, entrySymbol),
            ],
            [
              "Close Reason",
              entry.status === "closed"
                ? renderCloseReasonBadge(displayCloseReason)
                : "—",
            ],
            [
              "Close Time",
              closeTimestamp,
            ],
            [
              "Status",
              entry.status === "open" ? "Open" : "Closed",
            ],
          ].map(([label, value]) => {
            const statusClass =
              label === "Status" && value === "Open" ? "text-lime-300 animate-pulse" : "";
            const valueClass =
              label === "PnL"
                ? pnlClass
                : label === "Liq. Price"
                ? liqDangerClass
                : label === "Price"
                ? priceTextColor
                : statusClass
                ? statusClass
                : "text-white";
            return (
              <div key={`${entry.id}-${label}`} className="flex min-w-[90px] flex-none flex-col gap-1">
                <span className="uppercase text-[9px] text-slate-500 tracking-[0.2em]">{label}</span>
                {isValidElement(value)
                  ? value
                  : <span className={`text-[11px] ${valueClass}`}>{value}</span>}
              </div>
            );
          })}
          {entry.status === "open" && (
            <div className="flex min-w-[40px] flex-none flex-col justify-end gap-1">
              {(entry.takeProfit != null || entry.stopLoss != null) && (
                <button
                  type="button"
                  onClick={() => {
                    registerTpSlWithKeeper(
                      address!,
                      (entry.symbol ?? chartSymbol) as PolkadotSymbol,
                      keeperForSymbol?.takeProfitPrice ?? entry.takeProfit ?? null,
                      keeperForSymbol?.stopLossPrice ?? entry.stopLoss ?? null,
                    ).then(() => {
                      setTxError(null);
                    }).catch((e) => {
                      setTxError(e instanceof Error ? e.message : "Sync TP/SL failed");
                    });
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 transition hover:bg-amber-500 hover:text-white"
                  title="Sync TP/SL with keeper"
                  aria-label="Sync TP/SL"
                >
                  <span className="text-xs font-bold">↻</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setCloseConfirmEntry(entry)}
                disabled={isClosingPosition || pendingCloses.some((p) => p.status === "pending")}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400 transition hover:bg-rose-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                title="Close position"
                aria-label="Close position"
              >
                <span className="text-lg font-bold leading-none">×</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
    <div className="flex flex-col gap-6 -mx-2">
      {infoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-md rounded-2xl bg-[#0d0f18] border border-[#3d51ff]/60 p-6 text-white shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">{infoModal.title}</h3>
                <p className="text-sm text-slate-300 mt-2">{infoModal.body}</p>
              </div>
              <button
                className="text-sm text-slate-400 hover:text-white"
                onClick={() => setInfoModal(null)}
                aria-label="Close account notice"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {closeConfirmEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-md rounded-2xl bg-[#0d0f18] border border-rose-500/60 p-6 text-white shadow-xl">
            <h3 className="text-xl font-semibold text-rose-400">Close Position</h3>
            <p className="mt-2 text-sm text-slate-400">
              You are about to close the position with the following details:
            </p>
            <div className="mt-4 space-y-2 rounded-xl border border-[#363a59] bg-[#121421]/60 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Market</span>
                <span>{closeConfirmEntry.symbol ?? chartSymbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Position</span>
                <span className={closeConfirmEntry.type === "Long" ? "text-emerald-400" : "text-rose-400"}>
                  {closeConfirmEntry.type}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount (zUSDC)</span>
                <span>{formatZUSDCNumber(Number(closeConfirmEntry.amount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Size</span>
                <span>{formatCurrency((closeConfirmEntry.volume ?? Number(closeConfirmEntry.amount) * closeConfirmEntry.leverage))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Entry Price</span>
                <span>{formatForSymbol(closeConfirmEntry.entryPrice, closeConfirmEntry.symbol ?? chartSymbol)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Current Price</span>
                <span>{formatForSymbol(chartPricesBySymbol[closeConfirmEntry.symbol ?? chartSymbol] ?? null, closeConfirmEntry.symbol ?? chartSymbol)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Est. PnL</span>
                <span className={(() => {
                  const pnl = calculatePnL(closeConfirmEntry, chartPricesBySymbol[closeConfirmEntry.symbol ?? chartSymbol]);
                  if (pnl == null) return "text-slate-400";
                  return pnl >= 0 ? "text-emerald-400" : "text-rose-400";
                })()}>
                  {formatCurrency(calculatePnL(closeConfirmEntry, chartPricesBySymbol[closeConfirmEntry.symbol ?? chartSymbol]))}
                </span>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setCloseConfirmEntry(null)}
                className="flex-1 rounded-xl border border-[#363a59] px-4 py-3 font-semibold text-slate-300 transition hover:bg-[#1e2033]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!closeConfirmEntry) return;
                  handleClosePosition(closeConfirmEntry.symbol ?? chartSymbol, closeConfirmEntry.amount);
                }}
                disabled={isClosingPosition}
                className="flex-1 rounded-xl bg-rose-500 px-4 py-3 font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50"
              >
                {isClosingPosition ? "Sending..." : "Confirm Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {panelCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-md rounded-2xl bg-[#0d0f18] border border-rose-500/60 p-6 text-white shadow-xl">
            <h3 className="text-xl font-semibold text-rose-400">
              {panelCloseConfirm.remaining > 0 ? "Partial Close Position" : "Close Position"}
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              {panelCloseConfirm.remaining > 0
                ? `You are about to partially close your position. ${formatZUSDCNumber(panelCloseConfirm.remaining)} zUSDC will remain open.`
                : "You are about to fully close your position with the following details:"}
            </p>
            <div className="mt-4 space-y-2 rounded-xl border border-[#363a59] bg-[#121421]/60 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Market</span>
                <span>{panelCloseConfirm.market}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Position</span>
                <span className={panelCloseConfirm.side === "Long" ? "text-emerald-400" : "text-rose-400"}>
                  {panelCloseConfirm.side}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Closing Amount</span>
                <span>{formatZUSDCNumber(panelCloseConfirm.margin)}</span>
              </div>
              {panelCloseConfirm.remaining > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Remaining After Close</span>
                  <span className="text-amber-400">{formatZUSDCNumber(panelCloseConfirm.remaining)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Leverage</span>
                <span>{panelCloseConfirm.leverage}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Closing Size</span>
                <span>{formatCurrency(panelCloseConfirm.size)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Entry Price</span>
                <span>{formatForSymbol(panelCloseConfirm.entryPrice, panelCloseConfirm.market)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Current Price</span>
                <span>{formatForSymbol(panelCloseConfirm.currentPrice, panelCloseConfirm.market)}</span>
              </div>
              <div className="my-1 border-t border-[#363a59]" />
              <div className="flex justify-between font-semibold">
                <span className="text-slate-400">Est. PnL</span>
                <span className={panelCloseConfirm.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {formatCurrency(panelCloseConfirm.pnl)}
                </span>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setPanelCloseConfirm(null)}
                className="flex-1 rounded-xl border border-[#363a59] px-4 py-3 font-semibold text-slate-300 transition hover:bg-[#1e2033]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!panelCloseConfirm) return;
                  handleClosePosition(panelCloseConfirm.market, panelCloseConfirm.amount);
                  setPanelCloseConfirm(null);
                }}
                disabled={isClosingPosition}
                className="flex-1 rounded-xl bg-rose-500 px-4 py-3 font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50"
              >
                {isClosingPosition ? "Sending..." : "Confirm Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Market Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">

        {/* BTC/USD */}
        <div
          className="relative overflow-hidden rounded-2xl p-4 border transition-all duration-200 hover:scale-[1.02] hover:shadow-lg cursor-default"
          style={{
            background: "linear-gradient(135deg, #1a1400 0%, #16182e 60%, #1e1a08 100%)",
            borderColor: "rgba(251,146,60,0.25)",
            boxShadow: "0 0 0 0 rgba(251,146,60,0)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 24px rgba(251,146,60,0.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 0 0 0 rgba(251,146,60,0)")}
        >
          {/* glow blob */}
          <div className="pointer-events-none absolute -top-4 -right-4 h-16 w-16 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #f97316, transparent)" }} />
          {/* bottom accent */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl" style={{ background: "linear-gradient(to right, transparent, #f97316, transparent)" }} />

          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-400/80">BTC / USD</span>
            <span className="flex items-center justify-center h-6 w-6 rounded-lg" style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M11.5 2C6.25 2 2 6.25 2 11.5S6.25 21 11.5 21 21 16.75 21 11.5 16.75 2 11.5 2z" stroke="#f97316" strokeWidth="1.5"/>
                <path d="M8 8h5c1.1 0 2 .9 2 2s-.9 2-2 2H8v-4zm0 4h5.5c1.38 0 2.5 1.12 2.5 2.5S14.88 17 13.5 17H8v-5z" fill="#f97316"/>
                <line x1="10" y1="6" x2="10" y2="8" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="13" y1="6" x2="13" y2="8" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="10" y1="17" x2="10" y2="19" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="13" y1="17" x2="13" y2="19" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            {btcPrice ? `$${btcPrice.formatted}` : "—"}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-[10px] text-orange-400/60">
              {btcPrice ? (btcPrice.source === "pyth" ? "Pyth Oracle" : "DIA Oracle") : "Polkadot"}
            </span>
          </div>
        </div>

        {/* ETH/USD */}
        <div
          className="relative overflow-hidden rounded-2xl p-4 border transition-all duration-200 hover:scale-[1.02] cursor-default"
          style={{
            background: "linear-gradient(135deg, #0a0a1a 0%, #16182e 60%, #0e0a24 100%)",
            borderColor: "rgba(139,92,246,0.25)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 24px rgba(139,92,246,0.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
        >
          <div className="pointer-events-none absolute -top-4 -right-4 h-16 w-16 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #8b5cf6, transparent)" }} />
          <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl" style={{ background: "linear-gradient(to right, transparent, #8b5cf6, transparent)" }} />

          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-400/80">ETH / USD</span>
            <span className="flex items-center justify-center h-6 w-6 rounded-lg" style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
              <svg width="10" height="13" viewBox="0 0 10 16" fill="none">
                <polygon points="5,0 10,8 5,11 0,8" fill="rgba(139,92,246,0.5)" stroke="#8b5cf6" strokeWidth="0.8"/>
                <polygon points="5,12 10,9 5,16 0,9" fill="#8b5cf6"/>
              </svg>
            </span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            {ethPrice ? `$${ethPrice.formatted}` : "—"}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-[10px] text-violet-400/60">
              {ethPrice ? (ethPrice.source === "pyth" ? "Pyth Oracle" : "DIA Oracle") : "Polkadot"}
            </span>
          </div>
        </div>

        {/* HBAR/USD */}
        <div
          className="relative overflow-hidden rounded-2xl p-4 border transition-all duration-200 hover:scale-[1.02] cursor-default"
          style={{
            background: "linear-gradient(135deg, #160818 0%, #16182e 60%, #1a0a1c 100%)",
            borderColor: "rgba(232,121,249,0.25)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 24px rgba(232,121,249,0.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
        >
          <div className="pointer-events-none absolute -top-4 -right-4 h-16 w-16 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #e879f9, transparent)" }} />
          <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl" style={{ background: "linear-gradient(to right, transparent, #e879f9, transparent)" }} />

          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-400/80">HBAR / USD</span>
            <span className="flex items-center justify-center h-6 w-6 rounded-lg" style={{ background: "rgba(232,121,249,0.15)", border: "1px solid rgba(232,121,249,0.3)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4" fill="#e879f9"/>
                <circle cx="12" cy="4"  r="2.2" fill="rgba(232,121,249,0.6)"/>
                <circle cx="12" cy="20" r="2.2" fill="rgba(232,121,249,0.6)"/>
                <circle cx="4"  cy="12" r="2.2" fill="rgba(232,121,249,0.6)"/>
                <circle cx="20" cy="12" r="2.2" fill="rgba(232,121,249,0.6)"/>
              </svg>
            </span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            {hbarPrice ? `$${hbarPrice.formatted}` : "—"}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
            <span className="text-[10px] text-fuchsia-400/60">
              {hbarPrice ? (hbarPrice.source === "pyth" ? "Pyth Oracle" : "DIA Oracle") : "Polkadot"}
            </span>
          </div>
        </div>

        {/* 24h Volume */}
        <div
          className="relative overflow-hidden rounded-2xl p-4 border transition-all duration-200 hover:scale-[1.02] cursor-default"
          style={{
            background: "linear-gradient(135deg, #021414 0%, #16182e 60%, #04161a 100%)",
            borderColor: "rgba(20,184,166,0.25)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 24px rgba(20,184,166,0.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
        >
          <div className="pointer-events-none absolute -top-4 -right-4 h-16 w-16 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #14b8a6, transparent)" }} />
          <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl" style={{ background: "linear-gradient(to right, transparent, #14b8a6, transparent)" }} />

          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400/80">24h Volume</span>
            <span className="flex items-center justify-center h-6 w-6 rounded-lg" style={{ background: "rgba(20,184,166,0.15)", border: "1px solid rgba(20,184,166,0.3)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round">
                <rect x="3"  y="12" width="4" height="9" rx="1" fill="rgba(20,184,166,0.4)" stroke="none"/>
                <rect x="10" y="7"  width="4" height="14" rx="1" fill="rgba(20,184,166,0.6)" stroke="none"/>
                <rect x="17" y="3"  width="4" height="18" rx="1" fill="#14b8a6" stroke="none"/>
              </svg>
            </span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">$1.2M</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2 9 L5 5 L8 7 L11 3" stroke="#14b8a6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[10px] text-teal-400/60">All markets · 24h</span>
          </div>
        </div>

        {/* Open Interest */}
        <div
          className="relative overflow-hidden rounded-2xl p-4 border transition-all duration-200 hover:scale-[1.02] cursor-default"
          style={{
            background: "linear-gradient(135deg, #0c0820 0%, #16182e 60%, #0e0a24 100%)",
            borderColor: "rgba(99,102,241,0.25)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 24px rgba(99,102,241,0.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
        >
          <div className="pointer-events-none absolute -top-4 -right-4 h-16 w-16 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #6366f1, transparent)" }} />
          <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl" style={{ background: "linear-gradient(to right, transparent, #6366f1, transparent)" }} />

          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-400/80">Open Interest</span>
            <span className="flex items-center justify-center h-6 w-6 rounded-lg" style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#6366f1" strokeWidth="1.5" fill="none"/>
                <circle cx="12" cy="12" r="5.5" stroke="rgba(99,102,241,0.6)" strokeWidth="1.5" fill="none"/>
                <circle cx="12" cy="12" r="2"   fill="#6366f1"/>
              </svg>
            </span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight">$845K</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="text-[10px] text-indigo-400/60">Total positions open</span>
          </div>
        </div>

        {/* Funding Rate */}
        <div
          className="relative overflow-hidden rounded-2xl p-4 border transition-all duration-200 hover:scale-[1.02] cursor-default"
          style={{
            background: "linear-gradient(135deg, #021408 0%, #16182e 60%, #041a0a 100%)",
            borderColor: "rgba(34,197,94,0.25)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 24px rgba(34,197,94,0.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
        >
          <div className="pointer-events-none absolute -top-4 -right-4 h-16 w-16 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #22c55e, transparent)" }} />
          <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl" style={{ background: "linear-gradient(to right, transparent, #22c55e, transparent)" }} />

          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-green-400/80">Funding Rate</span>
            <span className="flex items-center justify-center h-6 w-6 rounded-lg" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2v20M17 7l-5-5-5 5"/>
                <path d="M8 17l4 4 4-4" strokeOpacity="0.4"/>
              </svg>
            </span>
          </div>
          <div className="text-xl font-bold text-green-400 tracking-tight">+0.01%</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
              LONGS PAY
            </span>
            <span className="text-[10px] text-green-400/50">per 8h</span>
          </div>
        </div>

      </div>

      {/* Chart + Trade Panel */}
      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        {/* Chart Section */}
        <div className="lg:order-1 min-w-0">
          <div className="bg-[#0d0f18] rounded-2xl border border-[#363a59]/50 overflow-hidden shadow-xl shadow-black/20">
            <div className="flex flex-col gap-3 border-b border-[#1d1f31] px-6 py-4 text-sm text-white lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase text-slate-500">TradingView</p>
                <p className="text-base font-semibold text-white">
                  {chartSymbol}
                  {displayPrice ? ` · $${displayPrice.formatted}` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  {displayPrice ? "Pyth Benchmarks" : "Đang tải..."}
                </p>
              </div>
              <select
                value={chartSymbol}
                onChange={(event) => setChartSymbol(event.target.value as PolkadotSymbol)}
                className="w-full max-w-[160px] rounded-xl border border-[#363a59] bg-[#121421] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white focus:border-blue-500 focus:outline-none"
              >
                {POLKADOT_SYMBOLS.map((symbol) => (
                  <option key={symbol} value={symbol}>
                    {symbol}
                  </option>
                ))}
              </select>
            </div>
            <ErrorBoundary
              fallback={
                <div className="min-h-[500px] flex flex-col items-center justify-center gap-3 p-8 text-slate-400">
                  <p>Không thể tải biểu đồ. Kiểm tra console để biết chi tiết.</p>
                  <p className="text-xs">Đảm bảo TradingView library đã load đúng.</p>
                </div>
              }
            >
              <TVChartContainer
                symbol={tradingviewSymbol}
                referencePrice={displayPrice?.price}
                referenceLabel={chartLabel}
                onIntervalChange={setChartResolution}
                onTimeScaleRightOffsetChange={handleTimeScaleRightOffsetChange}
              tpoLevels={chartOrderLines}
              />
            </ErrorBoundary>
            <IndicatorPanel
              symbol={chartSymbol}
              tradingViewSymbol={tradingviewSymbol}
              resolution={chartResolution}
              timeScaleRightOffset={chartRightOffset}
            />
          </div>
        </div>

        {/* Trade Panel */}
        <div className="lg:order-2 space-y-4 min-w-0">
          {notConnected ? (
            <div className="bg-gradient-to-br from-[#1e2033] to-[#16182e] rounded-2xl border border-[#363a59] p-12 text-center">
              <div className="text-6xl mb-4">🔐</div>
              <h3 className="text-xl font-semibold text-white mb-2">Connect Wallet</h3>
              <p className="text-slate-400 text-sm mb-6">Connect HashPack to start trading</p>
              <div className="flex justify-center">
                <HashPackConnectButton />
              </div>
            </div>
          ) : (
            <>
              {/* User Stats */}
              <div className="grid grid-cols-3 gap-3">

                {/* Wallet */}
                <div
                  className="relative overflow-hidden rounded-2xl p-3.5 border transition-all duration-200"
                  style={{
                    background: "linear-gradient(135deg, #04101a 0%, #16182e 70%, #061424 100%)",
                    borderColor: "rgba(56,189,248,0.22)",
                  }}
                >
                  <div className="pointer-events-none absolute -top-3 -right-3 h-12 w-12 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #38bdf8, transparent)" }} />
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl" style={{ background: "linear-gradient(to right, transparent, #38bdf8, transparent)" }} />
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-sky-400/70">Wallet</span>
                    <span className="flex items-center justify-center h-5 w-5 rounded-md" style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.28)" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round">
                        <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
                        <path d="M16 3H8L4 7h16l-4-4z" strokeOpacity="0.5"/>
                        <circle cx="17" cy="13" r="1.5" fill="#38bdf8" stroke="none"/>
                      </svg>
                    </span>
                  </div>
                  <div className="text-white text-sm font-bold truncate leading-tight">{formatZUSDC(tokenBalance ?? 0n, 8)}</div>
                  <div className="mt-1 text-[9px] text-sky-400/50">zUSDC balance</div>
                </div>

                {/* Collateral */}
                <div
                  className="relative overflow-hidden rounded-2xl p-3.5 border transition-all duration-200"
                  style={{
                    background: "linear-gradient(135deg, #140a00 0%, #16182e 70%, #1a0e00 100%)",
                    borderColor: "rgba(245,158,11,0.22)",
                  }}
                >
                  <div className="pointer-events-none absolute -top-3 -right-3 h-12 w-12 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #f59e0b, transparent)" }} />
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl" style={{ background: "linear-gradient(to right, transparent, #f59e0b, transparent)" }} />
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(245,158,11,0.7)" }}>Collateral</span>
                    <span className="flex items-center justify-center h-5 w-5 rounded-md" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.28)" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="11" width="18" height="11" rx="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeOpacity="0.5"/>
                        <circle cx="12" cy="16" r="1.5" fill="#f59e0b" stroke="none"/>
                      </svg>
                    </span>
                  </div>
                  <div className="text-white text-sm font-bold truncate leading-tight">{formatCurrency(collateralEquity)}</div>
                  <div className="mt-1 text-[9px]" style={{ color: "rgba(245,158,11,0.5)" }}>
                    deposited + PnL
                  </div>
                </div>

                {/* Position */}
                {(() => {
                  const isLong  = openPositionSide === "Long";
                  const isShort = openPositionSide === "Short";
                  const hasPos  = openPositionMargin > 0;
                  // Long = lime #a3e635 (distinct from Funding green #22c55e)
                  // Short = rose #f87171 (no red in top-6 cards)
                  const accent  = hasPos ? (isLong ? "#a3e635" : isShort ? "#f87171" : "#94a3b8") : "#64748b";
                  const accentBg   = hasPos ? (isLong ? "rgba(163,230,53,0.12)" : isShort ? "rgba(248,113,113,0.12)" : "rgba(148,163,184,0.12)") : "rgba(100,116,139,0.08)";
                  const accentBord = hasPos ? (isLong ? "rgba(163,230,53,0.28)" : isShort ? "rgba(248,113,113,0.28)" : "rgba(148,163,184,0.2)") : "rgba(100,116,139,0.15)";
                  const gradEnd   = hasPos ? (isLong ? "#0a1000" : isShort ? "#180404" : "#0d1020") : "#0d0f1c";
                  return (
                    <div
                      className="relative overflow-hidden rounded-2xl p-3.5 border transition-all duration-200"
                      style={{
                        background: `linear-gradient(135deg, ${gradEnd} 0%, #16182e 70%, ${gradEnd} 100%)`,
                        borderColor: accentBord,
                      }}
                    >
                      <div className="pointer-events-none absolute -top-3 -right-3 h-12 w-12 rounded-full opacity-20" style={{ background: `radial-gradient(circle, ${accent}, transparent)` }} />
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl" style={{ background: `linear-gradient(to right, transparent, ${accent}, transparent)` }} />
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: `${accent}99` }}>Position</span>
                        <span className="flex items-center justify-center h-5 w-5 rounded-md" style={{ background: accentBg, border: `1px solid ${accentBord}` }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round">
                            {isLong  && <><path d="M12 19V5"/><path d="M5 12l7-7 7 7" strokeOpacity="0.6"/></>}
                            {isShort && <><path d="M12 5v14"/><path d="M19 12l-7 7-7-7" strokeOpacity="0.6"/></>}
                            {!hasPos && <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2" strokeOpacity="0.4"/></>}
                          </svg>
                        </span>
                      </div>
                      <div className="text-sm font-bold leading-tight truncate" style={{ color: hasPos ? accent : "#475569" }}>
                        {hasPos ? formatZUSDCNumber(openPositionMargin) : "—"}
                      </div>
                      <div className="mt-1 text-[9px]" style={{ color: `${accent}70` }}>
                        {hasPos && openPositionSide !== "N/A" ? openPositionSide : "no open position"}
                      </div>
                    </div>
                  );
                })()}

              </div>
              {hasPosition && entryPrice != null && positionMargin > 0 && displayPrice?.price && (
                <div className="mt-3">
                <PositionPnLDisplay
                  side={positionSide}
                  entryPrice={entryPrice}
                  leverage={pos?.leverage ?? leverage}
                  margin={positionMargin}
                  markPrice={displayPrice?.price}
                />
                </div>
              )}

              {/* Tabs */}
              <div className="flex gap-2 p-1 bg-[#121421] rounded-xl border border-[#363a59]">
                <button
                  onClick={() => setActiveTab("trade")}
                  className={`flex-1 py-2.5 rounded-lg font-medium transition ${activeTab === "trade" ? "bg-[#3d51ff] text-white" : "text-slate-400 hover:text-white"}`}
                >
                  Trade
                </button>
                <button
                  onClick={() => setActiveTab("deposit")}
                  className={`flex-1 py-2.5 rounded-lg font-medium transition ${activeTab === "deposit" ? "bg-[#3d51ff] text-white" : "text-slate-400 hover:text-white"}`}
                >
                  Deposit / Withdraw
                </button>
              </div>

              {openConfirmedNotice && (
                <div className="mt-3 rounded-2xl border border-[#2c2f45] bg-[#0a0c17] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Order confirmed on-chain</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Keeper trigger logs:{" "}
                        <span className="font-mono">
                          {openConfirmedKeeperStatus === "watching" ? "watching…" : openConfirmedKeeperStatus}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenConfirmedNotice(null);
                        setOpenConfirmedKeeperLogs("");
                        setOpenConfirmedKeeperStatus("idle");
                      }}
                      className="shrink-0 text-slate-400 hover:text-white"
                      title="Dismiss"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-300">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Order</span>
                      <span className="font-mono">
                        {openConfirmedNotice.market} {openConfirmedNotice.side} {openConfirmedNotice.margin} zUSDC @ {openConfirmedNotice.leverage}x
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">TxHash (openPosition)</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono break-all">{openConfirmedNotice.txHash}</span>
                        <button
                          type="button"
                          onClick={() => copyText(openConfirmedNotice.txHash)}
                          className="rounded-md border border-[#2c2f45] bg-[#121421] px-2 py-1 text-[11px] text-slate-300 hover:text-white"
                          title="Copy txHash"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Keeper logs (recent)</span>
                      <button
                        type="button"
                        onClick={() => copyText(openConfirmedKeeperLogs)}
                        className="rounded-md border border-[#2c2f45] bg-[#121421] px-2 py-1 text-[11px] text-slate-300 hover:text-white disabled:opacity-50"
                        disabled={!openConfirmedKeeperLogs}
                        title="Copy keeper logs"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-[#2c2f45] bg-black/20 p-3 text-[11px] text-slate-300">
                      {openConfirmedKeeperLogs || "Waiting for logs…"}
                    </pre>
                  </div>
                </div>
              )}

              {txError && (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-rose-500/50 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-400">
                  <span>{txError}</span>
                  <button type="button" onClick={() => setTxError(null)} className="shrink-0 text-rose-400/80 hover:text-rose-300">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              )}
              {txSuccess && (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">
                  <span>{txSuccess}</span>
                  <button type="button" onClick={() => setTxSuccess(null)} className="shrink-0 text-emerald-300/80 hover:text-emerald-200">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              )}

              {activeTab === "trade" ? (
                <div className="bg-gradient-to-br from-[#1e2033] to-[#16182e] rounded-2xl border border-[#363a59] p-6 shadow-xl">
                <div className="grid gap-3 mb-4 md:grid-cols-3">
                  <div className="rounded-xl border border-[#363a59] bg-[#0d0f18] p-4">
                    <p className="text-[10px] uppercase text-slate-500">Entry Price</p>
                    <p className="text-lg font-semibold text-white">
                      {formatForSymbol(entryPrice ?? displayPrice?.price, chartSymbol)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#363a59] bg-[#0d0f18] p-4">
                    <p className="text-[10px] uppercase text-slate-500">Liquidation</p>
                    <p className="text-lg font-semibold text-rose-400">
                      {formatForSymbol(
                        keeperOpenOrders.find((o) => o.market === chartSymbol && o.status === "Open")?.liquidationPrice
                          ?? previewLiquidationPrice,
                        chartSymbol,
                      )}
                    </p>
                  </div>
                <div className="rounded-xl border border-[#363a59] bg-[#0d0f18] p-4">
                  <p className="text-[10px] uppercase text-slate-500">Size</p>
                  <p className="text-lg font-semibold text-slate-200">
                    {orderSize == null ? "—" : formatCurrency(orderSize)}
                  </p>
                </div>
                </div>
                <div className="grid gap-3 mb-4 md:grid-cols-2">
                  <div className="rounded-xl border border-[#363a59] bg-[#0d0f18] p-4">
                    <p className="text-[10px] uppercase text-slate-500">
                      Take Profit ({targetPercent}% {tpSlMode === "roi" ? "ROI" : "Price"})
                    </p>
                    <p className="text-lg font-semibold text-emerald-400">
                      {formatForSymbol(
                        keeperOpenOrders.find((o) => o.market === chartSymbol && o.status === "Open")?.takeProfitPrice
                          ?? previewTakeProfitPrice,
                        chartSymbol,
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#363a59] bg-[#0d0f18] p-4">
                    <p className="text-[10px] uppercase text-slate-500">
                      Stop Loss ({stopLossPercent}% {tpSlMode === "roi" ? "ROI" : "Price"})
                    </p>
                    <p className="text-lg font-semibold text-red-400">
                      {formatForSymbol(
                        keeperOpenOrders.find((o) => o.market === chartSymbol && o.status === "Open")?.stopLossPrice
                          ?? previewStopLossPrice,
                        chartSymbol,
                      )}
                    </p>
                  </div>
                </div>
                <div className="mb-4 rounded-xl border border-[#363a59] bg-[#0d0f18] p-4">
                  <p className="text-[10px] uppercase text-slate-500 mb-2">TP/SL mode</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTpSlMode("roi")}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        tpSlMode === "roi"
                          ? "bg-[#3d51ff] text-white"
                          : "bg-[#121421] text-slate-400 hover:text-white border border-[#363a59]"
                      }`}
                      title="Percent means ROI on margin (price move = % / leverage)"
                    >
                      ROI %
                    </button>
                    <button
                      type="button"
                      onClick={() => setTpSlMode("price")}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        tpSlMode === "price"
                          ? "bg-[#3d51ff] text-white"
                          : "bg-[#121421] text-slate-400 hover:text-white border border-[#363a59]"
                      }`}
                      title="Percent means raw price move"
                    >
                      Price %
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {tpSlMode === "roi"
                      ? "ROI %: target is on margin. Price distance shrinks with leverage."
                      : "Price %: target is on raw price move (independent of leverage)."}
                  </p>
                </div>
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Select Take Profit level</span>
                      <span>{targetPercent}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={targetPercent}
                      onChange={(event) => setTargetPercent(Number(event.target.value))}
                      className="w-full h-2 mt-2 accent-blue-500"
                    />
                  </div>
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Select Stop Loss level</span>
                      <span>{stopLossPercent}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={stopLossPercent}
                      onChange={(event) => setStopLossPercent(Number(event.target.value))}
                      className="w-full h-2 mt-2 accent-red-500"
                    />
                  </div>
                    <div className="text-xs text-slate-400 mb-3">
                      Stop Loss Price: {formatForSymbol(previewStopLossPrice, chartSymbol)}
                    </div>
                  <div className="mb-4 rounded-2xl border border-[#2c2f45] bg-[#0a0c17] p-4 space-y-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPositionType("Long")}
                        className={`flex-1 py-3 rounded-xl font-semibold transition ${
                          positionType === "Long"
                            ? "bg-green-500/20 text-green-400 border-2 border-green-500/50"
                            : "bg-[#363a59]/30 text-slate-400 border border-transparent hover:border-[#363a59]"
                        }`}
                        disabled={hasPosition}
                      >
                        Long
                      </button>
                      <button
                        onClick={() => setPositionType("Short")}
                        className={`flex-1 py-3 rounded-xl font-semibold transition ${
                          positionType === "Short"
                            ? "bg-red-500/20 text-red-400 border-2 border-red-500/50"
                            : "bg-[#363a59]/30 text-slate-400 border border-transparent hover:border-[#363a59]"
                        }`}
                        disabled={hasPosition}
                      >
                        Short
                      </button>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div>
                          <span className="text-slate-400">Leverage</span>
                          <span className="ml-2 text-[11px] text-slate-500">Max 25x</span>
                        </div>
                        <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${leverageUi.colorClass} ${leverageUi.glowClass}`}>
                          {leverage}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="25"
                        value={leverage}
                        onChange={(e) => setLeverage(Number(e.target.value))}
                        disabled={hasPosition || closeAmount.trim().length > 0}
                        style={{ background: leverageUi.activeTrack }}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <div className={`mt-1 text-[11px] ${leverageUi.colorClass}`}>{leverageUi.riskLabel}</div>
                      
                      {hasPosition && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Leverage matches the open position and cannot be changed here.
                        </p>
                      )}
                      {!hasPosition && closeAmount.trim().length > 0 && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Leverage locked to current position while close amount is active.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-slate-400 text-sm">Amount (zUSDC)</label>
                      <button
                        type="button"
                        onClick={() => handlePositionAmountChange(String(maxAvailableMargin))}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition"
                      >
                        Max: <span className="font-semibold">{formatZUSDCNumber(maxAvailableMargin)}</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={positionAmount}
                      onChange={(e) => handlePositionAmountChange(e.target.value)}
                      placeholder="0.00"
                      className={`w-full px-4 py-3.5 rounded-xl bg-[#121421] border text-white placeholder-slate-500 focus:outline-none transition ${
                        positionExceedsCollateral
                          ? "border-rose-500 focus:border-rose-400"
                          : "border-[#363a59] focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                      }`}
                    />
                    {positionExceedsCollateral && (
                      <p className="mt-1.5 text-xs text-rose-400">
                        Amount exceeds available collateral ({formatZUSDCNumber(maxAvailableMargin)} zUSDC)
                      </p>
                    )}
                  </div>
                  <button
                    onClick={hasPosition ? handleIncreasePosition : handleOpenPosition}
                    disabled={
                      !positionAmount ||
                      positionExceedsCollateral ||
                      isOpenPending ||
                      isIncreasePending ||
                      isSubmittingPosition
                    }
                    className={`w-full py-4 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                      positionType === "Long" ? "bg-green-500 hover:bg-green-600 text-white" : "bg-red-500 hover:bg-red-600 text-white"
                    }`}
                  >
                    {isSubmittingPosition ? "Processing..." : hasPosition ? "Increase Position" : `Open ${positionType}`}
                  </button>

                  {hasPosition && (
                    <div className="mt-4 pt-4 border-t border-[#363a59]">
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-slate-400 text-sm">Close Amount</label>
                          <button
                            type="button"
                            onClick={() => handleCloseAmountChange(String(maxCloseAmount))}
                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition"
                          >
                            Max: <span className="font-semibold">{formatZUSDCNumber(maxCloseAmount)}</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          value={closeAmount}
                          onChange={(e) => handleCloseAmountChange(e.target.value)}
                          placeholder="0.00"
                          className={`w-full px-4 py-3.5 rounded-xl bg-[#121421] border text-white placeholder-slate-500 focus:outline-none transition ${
                            closeExceedsMax
                              ? "border-rose-500 focus:border-rose-400"
                              : "border-[#363a59] focus:border-blue-500"
                          }`}
                        />
                      </div>

                      {closeExceedsMax && closeWarning && (
                        <div className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/5 p-3 text-xs">
                          <div className="flex items-center gap-1.5 text-rose-400 font-semibold mb-2">
                            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                            Amount exceeds maximum position size
                          </div>
                          <p className="text-slate-400 mb-2">
                            You cannot close more than your current open position. Enter a value ≤ {formatZUSDCNumber(maxCloseAmount)}.
                          </p>
                          <div className="space-y-1 text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Position</span>
                              <span className={closeWarning.side === "Long" ? "text-emerald-400" : "text-rose-400"}>{closeWarning.side}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Margin</span>
                              <span className="text-white">{formatZUSDCNumber(closeWarning.margin)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Leverage</span>
                              <span className="text-white">{closeWarning.leverage}x</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Size</span>
                              <span className="text-white">{formatCurrency(closeWarning.size)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Entry Price</span>
                              <span className="text-white">{formatForSymbol(closeWarning.entryPrice, chartSymbol)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Current Price</span>
                              <span className="text-white">{formatForSymbol(closeWarning.currentPrice, chartSymbol)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Est. PnL at close</span>
                              <span className={closeWarning.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                {formatCurrency(closeWarning.pnl)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => {
                          if (!pos || !closeAmount.trim()) return;
                          const amt = Number(closeAmount);
                          if (Number.isNaN(amt) || amt <= 0) return;
                          const cp = displayPrice?.price ?? chartPrice?.price ?? 0;
                          const ep = entryPrice ?? cp;
                          const side = pos.position === 0 ? "Long" : "Short";
                          const lev = pos.leverage;
                          const size = amt * lev;
                          let pnl = 0;
                          if (ep > 0 && cp > 0) {
                            const delta = side === "Long" ? cp - ep : ep - cp;
                            pnl = (delta / ep) * size;
                          }
                          setPanelCloseConfirm({
                            market: chartSymbol,
                            amount: closeAmount,
                            side: side as "Long" | "Short",
                            margin: amt,
                            leverage: lev,
                            size,
                            entryPrice: ep,
                            currentPrice: cp,
                            pnl,
                            remaining: positionMargin - amt,
                          });
                        }}
                        disabled={!closeAmount || closeExceedsMax || isClosingPosition || pendingCloses.some((p) => p.status === "pending")}
                        className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-rose-500 via-rose-600 to-rose-700 text-white shadow-lg shadow-rose-900/40 transition hover:from-rose-400 hover:via-rose-500 hover:to-rose-600 hover:shadow-2xl disabled:opacity-50"
                      >
                        {isClosingPosition ? "Sending..." : pendingCloses.some((p) => p.status === "pending") ? "Confirming..." : "Close Position"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gradient-to-br from-[#1e2033] to-[#16182e] rounded-2xl border border-[#363a59] p-6 space-y-6 shadow-xl">
                  <div>
                    <label className="block text-slate-400 text-sm mb-2">Deposit Amount</label>
                    <input
                      type="text"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-3.5 rounded-xl bg-[#121421] border border-[#363a59] text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleDeposit}
                      disabled={!depositAmount || isDepositing}
                      className="w-full mt-3 py-3.5 rounded-xl font-semibold bg-blue-500 hover:bg-blue-600 text-white transition disabled:opacity-50"
                    >
                      {isDepositing ? "Depositing..." : "Deposit"}
                    </button>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-sm mb-2">Withdraw Amount</label>
                    <input
                      type="text"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-3.5 rounded-xl bg-[#121421] border border-[#363a59] text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleWithdraw}
                      disabled={!withdrawAmount || isWithdrawPending || isWithdrawing}
                      className="w-full mt-3 py-3.5 rounded-xl font-semibold bg-[#363a59] hover:bg-[#4a4f6e] text-white transition disabled:opacity-50"
                    >
                      {isWithdrawing ? "Processing..." : "Withdraw"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Signal Radar ── */}
              <RadarSignalPanel
                symbol={chartSymbol}
                resolution={chartResolution}
                tradingViewSymbol={tradingviewSymbol}
              />

              {/* ── Fear & Greed Index ── */}
              <FearGreedIndex />
            </>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="rounded-2xl border border-[#363a59] bg-[#0d0f18]/80">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#363a59]/40 bg-[#121421] px-3 py-3">
            {historyTabOptions.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setHistoryTab(tab.key)}
                className={`flex-1 min-w-[140px] rounded-xl px-4 py-2 text-sm font-semibold text-center transition ${
                  historyTab === tab.key ? "bg-[#3d51ff] text-white" : "text-slate-400 hover:text-white hover:bg-[#1e2033]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-4 space-y-4">
            {historyEntries.length === 0 ? (
              <p className="text-sm text-slate-400">
                No trades have been recorded yet. Open or close a position to populate history.
              </p>
            ) : (
              <div className="history-scroll overflow-x-auto">
                <div className="flex flex-col items-start gap-3">
                  {historyEntries.map((entry) => renderHistoryEntry(entry))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="rounded-2xl border border-[#363a59] bg-[#0d0f18]/80">
          <div className="flex items-center justify-between border-b border-[#363a59]/40 bg-[#121421] px-3 py-3 text-sm uppercase tracking-[0.4em] text-slate-400">
            <span>Deposit / Withdraw History</span>
            <span className="text-xs normal-case text-slate-500">{depositWithdrawHistory.length} entries</span>
          </div>
          <div className="p-4 space-y-3">
            {depositWithdrawHistory.length === 0 ? (
              <p className="text-sm text-slate-400">No deposit or withdraw events yet.</p>
            ) : (
              depositWithdrawHistory.map((record) => (
                <div
                  key={`${record.id}-${record.timestamp}`}
                  className="flex items-center justify-between rounded-xl border border-[#1f2340] bg-[#0f1221]/60 px-4 py-3 text-sm text-white"
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-[13px]">{record.type}</div>
                    <div className="text-[11px] text-slate-400">{formatTimestamp(record.timestamp)}</div>
                  </div>
                  <div className="text-[14px] font-semibold text-slate-100">{formatZUSDCNumber(record.amount)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

    </div>

    {/* ── Pending Close Notifications ── */}
    {pendingCloses.length > 0 && (
      <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
        {pendingCloses.map((pc) => (
          <div
            key={pc.id}
            className={`flex items-start gap-3 rounded-xl border p-4 shadow-2xl backdrop-blur-md transition-all duration-500 ${
              pc.status === "pending"
                ? "border-amber-500/40 bg-[#1a1500]/90"
                : pc.status === "confirmed"
                ? "border-emerald-500/40 bg-[#001a0a]/90"
                : "border-rose-500/40 bg-[#1a0005]/90"
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {pc.status === "pending" && (
                <svg className="h-5 w-5 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {pc.status === "confirmed" && (
                <svg className="h-5 w-5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
              )}
              {pc.status === "failed" && (
                <svg className="h-5 w-5 text-rose-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">
                {pc.status === "pending" && "Closing position..."}
                {pc.status === "confirmed" && "Position closed"}
                {pc.status === "failed" && "Close failed"}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {pc.symbol} · {pc.type} · {formatZUSDCNumber(Number(pc.amount))}
              </div>
              <a
                href={`https://hashscan.io/testnet/transaction/${pc.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
              >
                View on Blockscout
              </a>
            </div>
            <button
              onClick={() => setPendingCloses((prev) => prev.filter((p) => p.id !== pc.id))}
              className="shrink-0 text-slate-500 hover:text-white transition"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    )}

    {/* ── AI Chatbot Widget — fixed bottom-right ── */}
    <AIChatbotWidget />
    </>
  );
}
