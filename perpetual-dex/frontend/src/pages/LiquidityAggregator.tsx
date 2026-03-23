import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { formatUnits, parseUnits } from "ethers";
import { isAddress } from "viem";

import "@/styles/zenit-aggregator.css";
import HashPackConnectButton from "@/components/HashPackConnectButton";
import { AggregatorTokenIcon } from "@/components/AggregatorTokenIcon";
import { ZenitDropdown } from "@/components/ZenitDropdown";
import {
  AGGREGATOR_MAX_HOPS,
  AGGREGATOR_VENUES,
  DEFAULT_SLIPPAGE_BPS,
  HEDERA_EVM_MAINNET_CHAIN_ID,
  type AggregatorNetwork,
  chainIdForAggregator,
  encodeAdapterId,
  getAggregatorStatsUrl,
  getExchangeContractAddress,
  getNativeHbarAdapterId,
  getQuoteContractAddress,
  getV2RouterAddress,
  resolveTokenAddressForAggregator,
} from "@/config/aggregator";

/** Trang Aggregate chỉ dùng Hedera EVM mainnet (295) — không hỗ trợ testnet. */
const AGGREGATOR_NETWORK: AggregatorNetwork = "mainnet";

/** Debounce khi đổi số lượng — tránh spam RPC mỗi phím. */
const AUTO_QUOTE_DEBOUNCE_MS = 480;
import {
  AGGREGATOR_EXCHANGE_ABI,
  AGGREGATOR_ERC20_ABI,
  AGGREGATOR_WHBAR_WRAP_ABI,
  SAUCERSWAP_V1_ROUTER_NATIVE_ABI,
} from "@/lib/aggregatorAbi";
import { whbarTinybarsToDepositWeibar, WEIBARS_PER_TINYBAR } from "@/lib/aggregatorWhbarWrap";
import { getAggregatorQuoteUnified, type AggregatorQuoteResult } from "@/lib/aggregatorQuote";
import { pathTokenLabelsFromAddresses } from "@/lib/aggregatorPathLabels";
import { quoteOnchainExpectedOut } from "@/lib/aggregatorOnchainQuote";
import {
  humanizeOnchainQuoteError,
  shouldSuppressOnchainQuoteErrorUi,
} from "@/lib/aggregatorOnchainQuoteErrors";
import {
  transformRouteWithGasCheck,
  needsHbarWrap,
  type RouteTransformResult,
} from "@/lib/aggregatorRouteTransformer";
import { resolveOnchainAdapterBytes32 } from "@/lib/aggregatorOnchainAdapter";
import {
  NATIVE_HBAR_EVM_PLACEHOLDER,
  canUseSaucerV1NativeHbarInSwap,
  canUseSaucerV1TokenToHbarSwap,
  canUseNativeHbarViaExchange,
  decodeV1RouterAddressPath,
  getSaucerSwapHbarToTokenFunctionName,
} from "@/lib/aggregatorSaucerDirect";
import { waitForTransactionSuccess } from "@/lib/aggregatorTx";
import { fetchAggregatorStats, type AggregatorStatsDisplay } from "@/lib/aggregatorStats";
import { hashgraphWalletConnect } from "@/lib/hashgraphWalletConnect";
import { activeEvmNetwork } from "@/config/wagmi";
import {
  HTS_ROUTING_PANEL_BULLETS,
  HTS_ROUTING_PANEL_TITLE,
} from "@/lib/htsRouting";

function isQuoteError(x: AggregatorQuoteResult | { error: string }): x is { error: string } {
  return "error" in x;
}

const FAQ_ITEMS = [
  {
    q: "How is Zenit Aggregator different from a plain DEX?",
    a: "The app does not create its own liquidity pools. The Exchange contract (meta-router in perpetual-dex/contracts) routes tokens to adapters per venue (SaucerSwap, Pangolin, …); you control adapter addresses via setAdapter.",
  },
  {
    q: "How do mock quotes differ from real SaucerSwap routes?",
    a: "On mainnet with token addresses set (VITE_AGGREGATOR_TOKEN_*_MAINNET): if QuoterV2 finds a CLMM pool, swap uses UniswapV3SwapRouterAdapter (setAdapter id saucerswap_v2, adapterData = abi.encode(bytes path)). Otherwise the UI falls back to V1 AMM: getAmountsOut + UniswapV2LikeAdapter (id usually saucerswap, adapterData = abi.encode(address[])). Amount in uses tokenIn decimals() (WHBAR is often 8). Missing pools may use mock data. On-chain quote/swap needs a matching setAdapter for the route type.",
  },
  {
    q: "Where do volume / trade stats come from?",
    a: "Optional: set VITE_AGGREGATOR_STATS_URL to your backend API. Flexible JSON (e.g. volume, amount_of_trades, liquidity_providers, unique_users) — see aggregatorStats.ts.",
  },
  {
    q: "What is the frontend stack?",
    a: "The /aggregate page uses React, Tailwind, and zenit-aggregator.css (Zenit mint/cream/deck theme). Wallet connection via HashPack and the app’s existing flow.",
  },
  {
    q: "What do I need for on-chain swap?",
    a: "Exchange address in VITE_AGGREGATOR_EXCHANGE_CONTRACT, ERC-20 approve to the Exchange, Hedera EVM mainnet (295), and an adapter registered with the correct id (saucerswap / saucerswap_v2, …) — do not paste the adapter contract address into the Adapter id field. Wrong id causes AdapterNotActive. V1 vs CLMM must match encodedPath (the UI picks from the quote).",
  },
  {
    q: "SaucerSwap has native HTS smart routing — can Zenit do that?",
    a: "Partially: multi-path quotes (V1 + CLMM), output comparison, V1+V2 split hints (informational). Not included: pure HTS routing (0.0.x entities, batch SDK, …) like the official app — would need API/indexer or a dedicated adapter. Zenit is EVM-only for swap/quote today. See docs/AGGREGATOR_HTS.md.",
  },
  {
    q: "Zenit rates differ from saucerswap.finance — how to compare fairly?",
    a: "Use the same time and same amount in: native HBAR on the app is not the same as WHBAR (ERC-20) on EVM (often 1:1 after wrap, but routes may differ). Zenit Buy uses getAmountsOut / Quoter for the selected route (V1 or V2); the CLMM reference line is extra context. A few dozen bps difference from pool, block, or default route is normal.",
  },
  {
    q: "After confirming swap I only see ~0.02 ℏ fee, not a large HBAR debit or USDC?",
    a: "Swaps from WHBAR / USDC (ERC-20) do not debit large native HBAR on the main line — only network fees (tinybars). The sell amount comes from WHBAR (or chosen token) balances. Received USDC requires the USDC HTS token to be associated in HashPack; balance may not show until associated. Use HashScan (link after swap) to verify token transfers.",
  },
] as const;

const AGGREGATOR_TOKEN_OPTIONS = ["HBAR", "WHBAR", "USDC", "SAUCE", "XSAUCE"] as const;

/** Slippage presets (bps): 0.5%, 1%, 2%, 4% — giống UI tham chiếu. */
const SLIPPAGE_PRESET_BPS = [50, 100, 200, 400] as const;

function shortPathAddrs(path: readonly `0x${string}`[]): string {
  return path.map((a) => `${a.slice(0, 6)}…${a.slice(-4)}`).join(" → ");
}

function isEvmAggregatorAddr(v: string | undefined): v is `0x${string}` {
  return Boolean(v && /^0x[0-9a-fA-F]{40}$/.test(v));
}

export default function LiquidityAggregator() {
  const { address: wagmiAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitchChainPending } = useSwitchChain();
  /** Luôn đọc/ghi mainnet 295 — tránh WC-only mà wagmi còn chain mặc định khác → balance treo “Đang tải…”. */
  const publicClient = usePublicClient({ chainId: HEDERA_EVM_MAINNET_CHAIN_ID });
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const [wcAddress, setWcAddress] = useState(() => localStorage.getItem("zenit:wallet:evmAddress") ?? "");
  const [hederaAccountId, setHederaAccountId] = useState(() => localStorage.getItem("zenit:wallet:accountId") ?? "");
  /** Bắt buộc re-render khi WC ký / disconnect (isConnected thay đổi). */
  const [, setWalletSessionEpoch] = useState(0);
  useEffect(() => {
    const onStorage = () => setWcAddress(localStorage.getItem("zenit:wallet:evmAddress") ?? "");
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  /** Cùng tab: `localStorage` không bắn `storage` — bắt event từ `hashgraphWalletConnect` (Stake pattern). */
  useEffect(() => {
    const onWallet = (e: Event) => {
      const d = (e as CustomEvent<{ evmAddress?: string; accountId?: string }>).detail;
      if (d?.evmAddress != null) setWcAddress(d.evmAddress);
      if (d?.accountId != null) setHederaAccountId(d.accountId);
      setWalletSessionEpoch((n) => n + 1);
    };
    window.addEventListener("zenit-hashgraph-wallet", onWallet as EventListener);
    return () => window.removeEventListener("zenit-hashgraph-wallet", onWallet as EventListener);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void hashgraphWalletConnect
      .restoreSession()
      .then((r) => {
        if (cancelled || !r?.evmAddress) return;
        if (/^0x[0-9a-fA-F]{40}$/i.test(r.evmAddress)) setWcAddress(r.evmAddress);
        if (r.accountId) setHederaAccountId(r.accountId);
        setWalletSessionEpoch((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const hashPackConnected = hashgraphWalletConnect.isConnected();
  /** Ưu tiên WC khi đã có signer — tránh lệch tài khoản đọc vs ký (giống Stake). */
  const walletAddress = (
    hashPackConnected && isEvmAggregatorAddr(wcAddress)
      ? wcAddress
      : isEvmAggregatorAddr(wagmiAddress)
        ? wagmiAddress
        : isEvmAggregatorAddr(wcAddress)
          ? wcAddress
          : undefined
  ) as `0x${string}` | undefined;

  /** Swap qua HashPack WalletConnect (Hedera signer), không qua wagmi `writeContract`. */
  const wcSwapPath = Boolean(hashPackConnected && isEvmAggregatorAddr(wcAddress));
  /** Swap qua ví inject + wagmi (HashPack extension / MetaMask …). */
  const wagmiSwapPath = !wcSwapPath && isEvmAggregatorAddr(wagmiAddress);

  const network = AGGREGATOR_NETWORK;
  const [tokenIn, setTokenIn] = useState("HBAR");
  const [tokenOut, setTokenOut] = useState("USDC");
  const [tokenInAddr, setTokenInAddr] = useState("");
  const [tokenOutAddr, setTokenOutAddr] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [routePanelOpen, setRoutePanelOpen] = useState(true);
  const [decimalsIn, setDecimalsIn] = useState(18);
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [splitChunks, setSplitChunks] = useState(4);
  const [splitDelaySec, setSplitDelaySec] = useState(30);
  const [enableSplitPlan, setEnableSplitPlan] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState("saucerswap");
  const [customAdapterLabel, setCustomAdapterLabel] = useState("");

  useEffect(() => {
    if (!AGGREGATOR_VENUES.some((v) => v.id === selectedVenueId)) {
      setSelectedVenueId("saucerswap");
    }
  }, [selectedVenueId]);

  const tokenDropdownOptions = useMemo(
    () =>
      AGGREGATOR_TOKEN_OPTIONS.map((t) => ({
        value: t,
        label: t,
        icon: <AggregatorTokenIcon symbol={t} sizeClassName="h-6 w-6" />,
      })),
    [],
  );

  const venueDropdownOptions = useMemo(
    () => AGGREGATOR_VENUES.map((v) => ({ value: v.id, label: v.name })),
    [],
  );

  const [quote, setQuote] = useState<AggregatorQuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [onchainRaw, setOnchainRaw] = useState<bigint | null>(null);
  const [onchainError, setOnchainError] = useState<string | null>(null);
  /** Khi suppress lỗi on-chain nhưng vẫn có quote off-chain — gợi ý ngắn (không phải lỗi đỏ). */
  const [onchainSoftNote, setOnchainSoftNote] = useState<string | null>(null);
  /** `Exchange.quote` / QuoteAggregator — chạy sau quote router (không chặn hiển thị). */
  const [onchainQuoteLoading, setOnchainQuoteLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [swapMsg, setSwapMsg] = useState<string | null>(null);
  const [swapTxHash, setSwapTxHash] = useState<string | null>(null);
  /** Wagmi không báo pending khi ký qua HashPack WC — tránh bấm Swap nhiều lần. */
  const [swapBusy, setSwapBusy] = useState(false);
  /** Gas buffer warning khi swap Native HBAR */
  const [gasWarning, setGasWarning] = useState<string | null>(null);
  /** Route-transformer result — drives Step 3 "Wrap HBAR" button. */
  const [routeTransform, setRouteTransform] = useState<RouteTransformResult | null>(null);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const [stats, setStats] = useState<AggregatorStatsDisplay | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  /** Tăng mỗi lần gọi quote — bỏ qua kết quả cũ nếu user đổi input nhanh. */
  const quoteFetchGenRef = useRef(0);

  const chainLabel = chainIdForAggregator(network);
  const quoteContract = useMemo(() => getQuoteContractAddress(), []);
  const exchangeContract = useMemo(() => getExchangeContractAddress(), []);
  const statsUrl = useMemo(() => getAggregatorStatsUrl(), []);
  const expectedChainId = HEDERA_EVM_MAINNET_CHAIN_ID;
  /** Chỉ bắt buộc chain 295 khi ký bằng wagmi; WC dùng session Hedera (LedgerId theo env). */
  const chainMismatch = wagmiSwapPath && isConnected && chainId !== expectedChainId;

  useEffect(() => {
    if (!statsUrl) {
      setStats(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setStatsError(null);
      const s = await fetchAggregatorStats(statsUrl);
      if (!cancelled) {
        if (s) setStats(s);
        else setStatsError("Could not load stats");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statsUrl]);

  const resolvedIn = useMemo(() => {
    const manual = tokenInAddr.trim();
    if (manual && /^0x[a-fA-F0-9]{40}$/.test(manual)) {
      /** 0x0 = native HBAR — route & pool dùng WHBAR (SaucerSwap). */
      if (manual.toLowerCase() === NATIVE_HBAR_EVM_PLACEHOLDER.toLowerCase()) {
        return resolveTokenAddressForAggregator("HBAR", network);
      }
      return manual as `0x${string}`;
    }
    return resolveTokenAddressForAggregator(tokenIn, network);
  }, [tokenIn, tokenInAddr, network]);

  const resolvedOut = useMemo(() => {
    const manual = tokenOutAddr.trim();
    if (manual && /^0x[a-fA-F0-9]{40}$/.test(manual)) {
      if (manual.toLowerCase() === NATIVE_HBAR_EVM_PLACEHOLDER.toLowerCase()) {
        return resolveTokenAddressForAggregator("HBAR", network);
      }
      return manual as `0x${string}`;
    }
    return resolveTokenAddressForAggregator(tokenOut, network);
  }, [tokenOut, tokenOutAddr, network]);

  /** Khớp `adapterId` với `encodedPath` (V1 vs CLMM) — tránh `InvalidPath()` khi quote V1 + id `saucerswap_v2`.
   * isNativeHbar: true khi tokenIn = HBAR → chọn hbar_native_v1/v2 thay vì saucerswap/saucerswap_v2. */
  const onchainAdapterBytes32 = useMemo(
    () =>
      resolveOnchainAdapterBytes32({
        selectedVenueId,
        customAdapterLabel,
        quote,
        isNativeHbar: tokenIn.trim().toUpperCase() === "HBAR",
      }),
    [selectedVenueId, customAdapterLabel, quote, tokenIn],
  );

  const whbarAddr = useMemo(
    () => resolveTokenAddressForAggregator("WHBAR", network),
    [network],
  );
  const usdcAddr = useMemo(
    () => resolveTokenAddressForAggregator("USDC", network),
    [network],
  );

  const { data: decimalsInData } = useReadContract({
    chainId: HEDERA_EVM_MAINNET_CHAIN_ID,
    address: resolvedIn && isAddress(resolvedIn) ? resolvedIn : undefined,
    abi: AGGREGATOR_ERC20_ABI,
    functionName: "decimals",
    query: {
      enabled: Boolean(resolvedIn && isAddress(resolvedIn)),
    },
  });

  /** Ưu tiên `decimals()` on-chain — WHBAR thường 8 (không phải 18). */
  const effectiveDecimalsIn = useMemo(() => {
    if (decimalsInData !== undefined) return Number(decimalsInData);
    if (quote?.inDecimals != null) return quote.inDecimals;
    return decimalsIn;
  }, [decimalsInData, quote?.inDecimals, decimalsIn]);

  useEffect(() => {
    if (decimalsInData !== undefined) setDecimalsIn(Number(decimalsInData));
  }, [resolvedIn, decimalsInData]);

  const { data: decimalsOutData } = useReadContract({
    chainId: HEDERA_EVM_MAINNET_CHAIN_ID,
    address: resolvedOut && isAddress(resolvedOut) ? resolvedOut : undefined,
    abi: AGGREGATOR_ERC20_ABI,
    functionName: "decimals",
    query: {
      enabled: Boolean(resolvedOut && isAddress(resolvedOut)),
    },
  });

  /** Ưu tiên decimals từ quote router (đúng với getAmountsOut) để không hiển thị sai khi wagmi mặc định 18. */
  const effectiveDecimalsOut = useMemo(() => {
    if (quote?.quoteSource === "router_v2" && quote.outDecimals != null) return quote.outDecimals;
    if (decimalsOutData !== undefined) return Number(decimalsOutData);
    return 18;
  }, [quote, decimalsOutData]);

  /** Khớp `onSwap`: ưu tiên số out từ Exchange.quote (on-chain), fallback router. */
  const expectedOutWeiForUi = onchainRaw ?? quote?.expectedOutWei ?? null;

  /**
   * Min receive (slippage) phải **bảo thủ**: khi router và Exchange.quote đều có,
   * lấy `min(router, onchain)` — tránh `SwapTooSmall` nếu adapter thấp hơn quote router.
   */
  const swapBaseOutWei = useMemo(() => {
    const r = quote?.expectedOutWei;
    const o = onchainRaw;
    if (r != null && o != null) return r < o ? r : o;
    return o ?? r ?? null;
  }, [quote?.expectedOutWei, onchainRaw]);

  const minOutWeiForUi = useMemo(() => {
    if (expectedOutWeiForUi == null) return null;
    const bps = BigInt(Math.min(Math.max(slippageBps, 1), 5000));
    return (expectedOutWeiForUi * (10000n - bps)) / 10000n;
  }, [expectedOutWeiForUi, slippageBps]);

  const minReceiveHumanDisplay = useMemo(() => {
    if (!quote) return null;
    if (quote.quoteSource === "router_v2") {
      if (minOutWeiForUi != null) return formatUnits(minOutWeiForUi, effectiveDecimalsOut);
      return quote.minOutHuman;
    }
    if (quote.quoteSource === "mock") {
      const exp = parseFloat(quote.expectedOutHuman.replace(/,/g, ""));
      if (!Number.isFinite(exp) || exp <= 0) return quote.minOutHuman;
      const bps = Math.min(Math.max(slippageBps, 1), 5000);
      const min = (exp * (10000 - bps)) / 10000;
      return min.toLocaleString("en-US", { maximumFractionDigits: 12 });
    }
    if (minOutWeiForUi != null && decimalsOutData !== undefined) {
      return formatUnits(minOutWeiForUi, effectiveDecimalsOut);
    }
    return quote.minOutHuman;
  }, [quote, minOutWeiForUi, effectiveDecimalsOut, slippageBps, decimalsOutData]);

  const onchainFormatted =
    onchainRaw != null ? formatUnits(onchainRaw, effectiveDecimalsOut) : null;

  const decimalsOutKnown =
    (quote?.quoteSource === "router_v2" && quote.outDecimals != null) || decimalsOutData !== undefined;

  const { data: tokenAllowance, refetch: refetchAllowance } = useReadContract({
    chainId: HEDERA_EVM_MAINNET_CHAIN_ID,
    address: resolvedIn && isAddress(resolvedIn) ? resolvedIn : undefined,
    abi: AGGREGATOR_ERC20_ABI,
    functionName: "allowance",
    args:
      walletAddress && exchangeContract && isAddress(walletAddress) && isAddress(exchangeContract)
        ? [walletAddress, exchangeContract]
        : undefined,
    query: {
      enabled: Boolean(
        resolvedIn &&
          exchangeContract &&
          walletAddress &&
          isAddress(resolvedIn) &&
          isAddress(walletAddress) &&
          isAddress(exchangeContract),
      ),
    },
  });

  const balanceInEnabled = Boolean(resolvedIn && walletAddress && isAddress(resolvedIn) && isAddress(walletAddress));
  const balanceOutEnabled = Boolean(resolvedOut && walletAddress && isAddress(resolvedOut) && isAddress(walletAddress));

  /**
   * HBAR trong HashPack = **native** trên tài khoản EVM. `balanceOf(WHBAR)` chỉ là WHBAR đã wrap — thường 0 nếu chưa wrap.
   * Hiển thị số dư khớp ví: dùng `eth_getBalance` khi cột chọn nhãn **HBAR** (không phải WHBAR).
   */
  const needNativeHbarRead = Boolean(
    walletAddress && isAddress(walletAddress) && (tokenIn === "HBAR" || tokenOut === "HBAR"),
  );
  const {
    data: wagmiNativeHbarBalance,
    isPending: isPendingNativeHbar,
    isFetching: isFetchingNativeHbar,
    isError: wagmiIsErrorNativeHbar,
    error: wagmiErrorNativeHbar,
  } = useBalance({
    chainId: HEDERA_EVM_MAINNET_CHAIN_ID,
    address: needNativeHbarRead ? walletAddress : undefined,
    query: {
      enabled: needNativeHbarRead && wagmiSwapPath,
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  });

  // Fallback: Fetch native HBAR balance directly via publicClient for HashPack WalletConnect
  const [fallbackHbarBalance, setFallbackHbarBalance] = useState<{ value: bigint; decimals: number } | null>(null);
  const [fallbackHbarError, setFallbackHbarError] = useState(false);

  useEffect(() => {
    if (!needNativeHbarRead || !wcSwapPath || !walletAddress || !publicClient) {
      setFallbackHbarBalance(null);
      setFallbackHbarError(false);
      return;
    }

    let cancelled = false;

    async function fetchBalance() {
      try {
        const balance = await publicClient!.getBalance({ address: walletAddress! });
        if (!cancelled) {
          setFallbackHbarBalance({ value: balance, decimals: 18 });
          setFallbackHbarError(false);
        }
      } catch (e) {
        if (!cancelled) {
          setFallbackHbarError(true);
          console.error("Failed to fetch HBAR balance:", e);
        }
      }
    }

    void fetchBalance();

    // Refetch every 15 seconds
    const interval = setInterval(() => {
      void fetchBalance();
    }, 15_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [needNativeHbarRead, wcSwapPath, walletAddress, publicClient]);

  // Use fallback balance for HashPack WalletConnect, wagmi balance for injected wallets
  const effectiveNativeHbarBalance = wcSwapPath ? fallbackHbarBalance : (wagmiNativeHbarBalance ?? null);
  const effectiveIsErrorNativeHbar = wcSwapPath ? fallbackHbarError : wagmiIsErrorNativeHbar;
  const effectiveErrorNativeHbar = wcSwapPath ? (fallbackHbarError ? new Error("Failed to fetch balance") : null) : (wagmiErrorNativeHbar ?? null);

  const {
    data: balanceInWei,
    refetch: refetchBalanceIn,
    isFetching: isFetchingBalanceIn,
    isPending: isPendingBalanceIn,
    isError: isErrorBalanceIn,
    error: errorBalanceIn,
  } = useReadContract({
    chainId: HEDERA_EVM_MAINNET_CHAIN_ID,
    address: balanceInEnabled ? resolvedIn : undefined,
    abi: AGGREGATOR_ERC20_ABI,
    functionName: "balanceOf",
    args: walletAddress && isAddress(walletAddress) ? [walletAddress] : undefined,
    query: {
      enabled: balanceInEnabled,
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  });

  const {
    data: balanceOutWei,
    isFetching: isFetchingBalanceOut,
    isPending: isPendingBalanceOut,
    isError: isErrorBalanceOut,
    error: errorBalanceOut,
  } = useReadContract({
    chainId: HEDERA_EVM_MAINNET_CHAIN_ID,
    address: balanceOutEnabled ? resolvedOut : undefined,
    abi: AGGREGATOR_ERC20_ABI,
    functionName: "balanceOf",
    args: walletAddress && isAddress(walletAddress) ? [walletAddress] : undefined,
    query: {
      enabled: balanceOutEnabled,
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  });

  /** `decimals()` on-chain ưu tiên; fallback quote / state để không kẹt UI khi chỉ một trong hai RPC chậm. */
  const balanceInHuman = useMemo(() => {
    if (balanceInWei == null) return null;
    const dec =
      decimalsInData !== undefined
        ? Number(decimalsInData)
        : quote?.inDecimals != null
          ? quote.inDecimals
          : decimalsIn;
    return formatUnits(balanceInWei, dec);
  }, [balanceInWei, decimalsInData, quote?.inDecimals, decimalsIn]);

  const balanceOutHuman = useMemo(() => {
    if (balanceOutWei == null) return null;
    const dec =
      decimalsOutData !== undefined
        ? Number(decimalsOutData)
        : quote?.outDecimals != null
          ? quote.outDecimals
          : 18;
    return formatUnits(balanceOutWei, dec);
  }, [balanceOutWei, decimalsOutData, quote?.outDecimals]);

  /** Sell: nhãn HBAR → native; WHBAR / token khác → ERC-20 `balanceOf`. */
  const displayBalanceInHuman = useMemo(() => {
    if (tokenIn === "HBAR") {
      if (effectiveNativeHbarBalance?.value == null) return null;
      return formatUnits(effectiveNativeHbarBalance.value, 18);
    }
    return balanceInHuman;
  }, [tokenIn, effectiveNativeHbarBalance, balanceInHuman]);

  /** Buy: nhãn HBAR → native; còn lại → ERC-20. */
  const displayBalanceOutHuman = useMemo(() => {
    if (tokenOut === "HBAR") {
      if (effectiveNativeHbarBalance?.value == null) return null;
      return formatUnits(effectiveNativeHbarBalance.value, 18);
    }
    return balanceOutHuman;
  }, [tokenOut, effectiveNativeHbarBalance, balanceOutHuman]);

  const showBalanceInLoading =
    !walletAddress
      ? false
      : tokenIn === "HBAR"
        ? needNativeHbarRead &&
          effectiveNativeHbarBalance === null &&
          !effectiveIsErrorNativeHbar
        : balanceInEnabled &&
          balanceInWei === undefined &&
          (isPendingBalanceIn || isFetchingBalanceIn) &&
          !isErrorBalanceIn;

  const showBalanceOutLoading =
    !walletAddress
      ? false
      : tokenOut === "HBAR"
        ? needNativeHbarRead &&
          effectiveNativeHbarBalance === undefined &&
          (isPendingNativeHbar || isFetchingNativeHbar) &&
          !effectiveIsErrorNativeHbar
        : balanceOutEnabled &&
          balanceOutWei === undefined &&
          (isPendingBalanceOut || isFetchingBalanceOut) &&
          !isErrorBalanceOut;

  const hasSellAmount = useMemo(() => {
    const n = parseFloat(amountIn.replace(/,/g, ""));
    return Number.isFinite(n) && n > 0;
  }, [amountIn]);

  /** So sánh với `balanceOf` token in (WHBAR ERC-20…) — khác HBAR native trên UI. */
  const parsedAmountInWei = useMemo(() => {
    try {
      if (!hasSellAmount) return null;
      return parseUnits(amountIn.replace(/,/g, "") || "0", effectiveDecimalsIn);
    } catch {
      return null;
    }
  }, [amountIn, effectiveDecimalsIn, hasSellAmount]);

  /** Không đủ ERC-20 **và** không thể tự wrap từ HBAR native (bán WHBAR/HBAR). */
  const insufficientSellErc20 = useMemo(() => {
    if (parsedAmountInWei == null || balanceInWei == null) return false;
    if (parsedAmountInWei <= balanceInWei) return false;
    const deficit = parsedAmountInWei - balanceInWei;
    const sellingWhbar =
      Boolean(whbarAddr && resolvedIn && whbarAddr.toLowerCase() === resolvedIn.toLowerCase());
    if (!sellingWhbar) return true;
    const needWeibar = whbarTinybarsToDepositWeibar(deficit);
    if (effectiveNativeHbarBalance?.value == null) return true;
    return effectiveNativeHbarBalance.value < needWeibar;
  }, [
    parsedAmountInWei,
    balanceInWei,
    whbarAddr,
    resolvedIn,
    effectiveNativeHbarBalance?.value,
  ]);

  const canDirectSaucerNativeIn = useMemo(
    () =>
      canUseSaucerV1NativeHbarInSwap({
        tokenInSymbol: tokenIn,
        quote,
        network: AGGREGATOR_NETWORK,
        whbarAddr: whbarAddr as `0x${string}` | undefined,
        resolvedIn: resolvedIn as `0x${string}` | undefined,
      }) && Boolean(getV2RouterAddress(AGGREGATOR_NETWORK)),
    [tokenIn, quote, whbarAddr, resolvedIn],
  );

  const canDirectSaucerTokenToHbar = useMemo(
    () =>
      canUseSaucerV1TokenToHbarSwap({
        tokenOutSymbol: tokenOut,
        quote,
        network: AGGREGATOR_NETWORK,
        whbarAddr: whbarAddr as `0x${string}` | undefined,
        resolvedOut: resolvedOut as `0x${string}` | undefined,
      }) && Boolean(getV2RouterAddress(AGGREGATOR_NETWORK)),
    [tokenOut, quote, whbarAddr, resolvedOut],
  );

  /**
   * Native HBAR → token qua Exchange + NativeHbarV1Adapter.
   * Ưu tiên sau SaucerSwap V1 direct; dùng khi `v1_amm` nhưng VITE_AGGREGATOR_USE_SAUCE_NATIVE_HBAR_SWAP=0.
   */
  const canNativeHbarViaExchange = useMemo(
    () =>
      canUseNativeHbarViaExchange({
        tokenInSymbol: tokenIn,
        quote,
        exchangeContract: exchangeContract as `0x${string}` | undefined,
        network: AGGREGATOR_NETWORK,
      }),
    [tokenIn, quote, exchangeContract],
  );

  /** Khi swap native HBAR (qua Saucer V1 direct, NativeHbarV1Adapter, hoặc NativeHbarV2Adapter), so sánh với số dư native (18 decimals), không WHBAR ERC-20. */
  const insufficientSellForSwap = useMemo(() => {
    const isHbarNative = tokenIn.trim().toUpperCase() === "HBAR";
    if (isHbarNative && (canDirectSaucerNativeIn || canNativeHbarViaExchange)) {
      try {
        const need = parseUnits(amountIn.replace(/,/g, "") || "0", 18);
        if (effectiveNativeHbarBalance?.value == null) return true;
        return effectiveNativeHbarBalance.value < need;
      } catch {
        return true;
      }
    }
    return insufficientSellErc20;
  }, [tokenIn, canDirectSaucerNativeIn, canNativeHbarViaExchange, amountIn, effectiveNativeHbarBalance?.value, insufficientSellErc20]);

  const applySellPct = useCallback(
    (mode: "25" | "50" | "max") => {
      if (tokenIn === "HBAR") {
        if (effectiveNativeHbarBalance?.value == null) return;
        const wei = effectiveNativeHbarBalance.value;
        if (mode === "max") {
          setAmountIn(formatUnits(wei, 18));
          return;
        }
        const p = mode === "25" ? 25n : 50n;
        setAmountIn(formatUnits((wei * p) / 100n, 18));
        return;
      }
      if (balanceInWei == null || decimalsInData === undefined) return;
      const d = Number(decimalsInData);
      if (mode === "max") {
        setAmountIn(formatUnits(balanceInWei, d));
        return;
      }
      const p = mode === "25" ? 25n : 50n;
      const v = (balanceInWei * p) / 100n;
      setAmountIn(formatUnits(v, d));
    },
    [tokenIn, effectiveNativeHbarBalance, balanceInWei, decimalsInData],
  );

  /** Nhãn từng node trên path (WHBAR, SAUCE, …) — khớp `pathTokenAddresses` từ quote router. */
  const quotePathDisplayLabels = useMemo(() => {
    if (!quote?.pathTokenAddresses?.length) return null;
    return pathTokenLabelsFromAddresses(quote.pathTokenAddresses, {
      tokenInSymbol: tokenIn,
      tokenOutSymbol: tokenOut,
      tokenInAddress: resolvedIn,
      tokenOutAddress: resolvedOut,
      whbar: whbarAddr,
      usdc: usdcAddr,
    });
  }, [quote?.pathTokenAddresses, tokenIn, tokenOut, resolvedIn, resolvedOut, whbarAddr, usdcAddr]);

  const routePathLabel = useMemo(() => {
    if (quotePathDisplayLabels?.length) {
      return quotePathDisplayLabels.join(" > ");
    }
    /** Mock quote: `hops` đã dùng ký hiệu token (USDC, …). */
    if (quote?.hops?.length) {
      const chain = [quote.hops[0].tokenIn, ...quote.hops.map((x) => x.tokenOut)];
      return chain.join(" > ");
    }
    return `${tokenIn} > ${tokenOut}`;
  }, [quotePathDisplayLabels, quote?.hops, tokenIn, tokenOut]);

  /** Multi-route: tất cả path đã quote, sort theo output (server); nhãn token giống route chính. */
  const rankedRoutesDisplay = useMemo(() => {
    if (!quote?.rankedRoutes?.length) return [];
    return quote.rankedRoutes.map((row) => ({
      ...row,
      label: pathTokenLabelsFromAddresses(row.pathTokenAddresses, {
        tokenInSymbol: tokenIn,
        tokenOutSymbol: tokenOut,
        tokenInAddress: resolvedIn,
        tokenOutAddress: resolvedOut,
        whbar: whbarAddr,
        usdc: usdcAddr,
      }).join(" > "),
    }));
  }, [quote?.rankedRoutes, tokenIn, tokenOut, resolvedIn, resolvedOut, whbarAddr, usdcAddr]);

  /** Nhãn venue cạnh “Select route” — V2 CLMM swap, hoặc V2 tham chiếu + V1, hoặc chỉ V1. */
  const venueRouteBadge = useMemo(() => {
    if (selectedVenueId !== "saucerswap") {
      return AGGREGATOR_VENUES.find((v) => v.id === selectedVenueId)?.name ?? "Venue";
    }
    if (!quote || quote.quoteSource !== "router_v2") {
      return AGGREGATOR_VENUES.find((v) => v.id === "saucerswap")?.name ?? "SaucerSwap";
    }
    if (quote.swapExecution === "v2_clmm") return "SaucerSwap · V2 (CLMM) swap";
    if (quote.saucerswapV2Reference) return "SaucerSwap · V2 ref + V1 swap";
    if (quote.saucerswapV2Error) return "SaucerSwap · V2 RPC/Mirror error";
    return "SaucerSwap · V1 only";
  }, [selectedVenueId, quote]);

  /**
   * Buy amount hiển thị: **luôn** `expectedOutHuman` = output của route thực thi (V1 `getAmountsOut` hoặc V2 CLMM).
   * Không thay bằng Quoter V2 khi swap là V1 — tránh số ô Buy lệch khỏi route #1 / min receive và so sánh sai với app.
   * Tham chiếu CLMM (nếu khác) hiển thị dòng phụ bên dưới.
   */
  const displayExpectedOutHuman = useMemo(() => {
    if (!quote) return null;
    return quote.expectedOutHuman;
  }, [quote]);

  /** USDC/HBAR hiệu dụng từ quote (expectedOut / amountIn) — so sánh với dòng “1 HBAR = …” trên SaucerSwap. */
  const effectiveSpotRate = useMemo(() => {
    if (!displayExpectedOutHuman || !hasSellAmount) return null;
    const amt = parseFloat(amountIn.replace(/,/g, ""));
    const out = parseFloat(displayExpectedOutHuman.replace(/,/g, ""));
    if (!Number.isFinite(amt) || !Number.isFinite(out) || amt <= 0) return null;
    return out / amt;
  }, [displayExpectedOutHuman, amountIn, hasSellAmount]);

  const onGetQuote = useCallback(async () => {
    const gen = ++quoteFetchGenRef.current;
    setQuote(null);
    setQuoteError(null);
    setOnchainRaw(null);
    setOnchainError(null);
    setOnchainSoftNote(null);
    setOnchainQuoteLoading(false);
    setSwapMsg(null);
    setSwapTxHash(null);
    setQuoteLoading(true);

    try {
      const unified = await getAggregatorQuoteUnified({
        network,
        tokenIn,
        tokenOut,
        amountInHuman: amountIn,
        slippageBps,
        resolvedIn,
        resolvedOut,
        whbar: whbarAddr,
        usdc: usdcAddr,
        onQuotePartial: (q) => {
          if (gen !== quoteFetchGenRef.current) return;
          setQuote(q);
          setQuoteLoading(false);
        },
      });
      if (gen !== quoteFetchGenRef.current) return;
      if (isQuoteError(unified)) {
        setQuoteError(unified.error);
        return;
      }
      setQuote(unified);

      const canTryOnchain = quoteContract && resolvedIn && resolvedOut;

      if (canTryOnchain) {
        const recipient =
          walletAddress && /^0x[a-fA-F0-9]{40}$/.test(walletAddress)
            ? walletAddress
            : ("0x0000000000000000000000000000000000000000" as `0x${string}`);
        const adapterId = resolveOnchainAdapterBytes32({
          selectedVenueId,
          customAdapterLabel,
          quote: unified,
        });
        setOnchainQuoteLoading(true);
        const g = gen;
        void (async () => {
          try {
            const out = await quoteOnchainExpectedOut({
              network,
              quoteContract,
              adapterId,
              tokenIn: resolvedIn,
              tokenOut: resolvedOut,
              amountInHuman: amountIn,
              recipient,
              adapterData: unified.encodedPath ?? "0x",
            });
            if (g !== quoteFetchGenRef.current) return;
            setOnchainRaw(out);
            setOnchainSoftNote(null);
            setOnchainError(null);
          } catch (e: unknown) {
            if (g !== quoteFetchGenRef.current) return;
            if (shouldSuppressOnchainQuoteErrorUi(e, unified)) {
              setOnchainError(null);
              setOnchainSoftNote(
                "Exchange.quote did not succeed on-chain (revert / adapter). Prices on the UI still come from the SaucerSwap router (off-chain). To swap via Exchange: verify setAdapter and adapter router addresses on mainnet.",
              );
            } else {
              setOnchainSoftNote(null);
              setOnchainError(humanizeOnchainQuoteError(e));
            }
          } finally {
            if (g === quoteFetchGenRef.current) {
              setOnchainQuoteLoading(false);
            }
          }
        })();
      } else if (quoteContract && (!resolvedIn || !resolvedOut)) {
        setOnchainSoftNote(null);
        setOnchainError("Set token contract addresses in .env (VITE_AGGREGATOR_TOKEN_*) or under Advanced.");
      }
    } finally {
      if (gen === quoteFetchGenRef.current) {
        setQuoteLoading(false);
      }
    }
  }, [
    amountIn,
    customAdapterLabel,
    network,
    quoteContract,
    resolvedIn,
    resolvedOut,
    selectedVenueId,
    slippageBps,
    tokenIn,
    tokenOut,
    walletAddress,
    whbarAddr,
    usdcAddr,
  ]);

  /** Tự lấy lại quote khi đổi số lượng / cặp token / slippage (debounce khi gõ số). */
  useEffect(() => {
    if (!resolvedIn || !resolvedOut) {
      setQuote(null);
      setQuoteError(null);
      setOnchainRaw(null);
      setOnchainError(null);
      setOnchainSoftNote(null);
      return;
    }
    if (!hasSellAmount) {
      setQuote(null);
      setQuoteError(null);
      setOnchainRaw(null);
      setOnchainError(null);
      setOnchainSoftNote(null);
      return;
    }

    const id = window.setTimeout(() => {
      void onGetQuote();
    }, AUTO_QUOTE_DEBOUNCE_MS);

    return () => window.clearTimeout(id);
  }, [
    amountIn,
    customAdapterLabel,
    hasSellAmount,
    resolvedIn,
    resolvedOut,
    selectedVenueId,
    slippageBps,
    tokenIn,
    tokenOut,
    tokenInAddr,
    tokenOutAddr,
    onGetQuote,
  ]);

  /** Kiểm tra gas buffer warning khi swap Native HBAR */
  useEffect(() => {
    setGasWarning(null);
    setRouteTransform(null);

    // Chỉ kiểm tra khi swap từ Native HBAR
    if (tokenIn.toUpperCase() !== "HBAR" || !hasSellAmount) {
      return;
    }

    try {
      const inputTiny = BigInt(
        Math.floor(parseFloat(amountIn.replace(/,/g, "") || "0") * 1e8),
      );
      if (inputTiny <= 0n) return;

      const result = transformRouteWithGasCheck(
        [{ fromToken: "HBAR", toToken: resolvedOut ?? "USDC" }],
        {
          userAddress: walletAddress ?? "",
          inputAmountTiny: inputTiny,
          nativeHbarBalanceWei: effectiveNativeHbarBalance?.value ?? null,
          erc20BalanceTiny: null,
          isNativeHbar: true,
        },
        whbarAddr ?? "",
      );

      if (result.balanceCheck === "insufficient") {
        setGasWarning(`⚠️ ${result.message}`);
      } else if (result.balanceCheck === "low_balance") {
        setGasWarning(`ℹ️ ${result.message}`);
      } else if (result.message) {
        setGasWarning(`⚠️ ${result.message}`);
      } else {
        setGasWarning(null);
      }
      setRouteTransform(result);
    } catch {
      // Ignore parse errors
    }
  }, [amountIn, tokenIn, hasSellAmount, effectiveNativeHbarBalance, resolvedOut, walletAddress, whbarAddr]);

  const onSwap = useCallback(async () => {
    setSwapMsg(null);
    setSwapTxHash(null);
    setSwapBusy(true);
    try {
    const hp = hashgraphWalletConnect.isConnected() && isEvmAggregatorAddr(wcAddress);
    const wpath = hp;
    const gpath = !wpath && isEvmAggregatorAddr(wagmiAddress);
    if (!wpath && !gpath) {
      setSwapMsg("Connect HashPack (Connect Wallet) or an EVM wallet (extension) to sign the swap.");
      return;
    }
    if (!walletAddress) {
      setSwapMsg("No EVM address — reconnect HashPack.");
      return;
    }
    if (!resolvedIn || !resolvedOut) {
      setSwapMsg("Missing token in/out addresses.");
      return;
    }
    const baseOut = swapBaseOutWei;
    if (baseOut == null) {
      setSwapMsg("Get a quote first — need expected out from Exchange or SaucerSwap router.");
      return;
    }
    if (gpath && chainMismatch) {
      setSwapMsg("Wrong network — Aggregator supports Hedera mainnet (295) only.");
      return;
    }
    if (gpath && !publicClient) {
      setSwapMsg("No RPC client.");
      return;
    }
    try {
      const bps = Math.min(Math.max(slippageBps, 1), 5000);
      const minOut = (baseOut * BigInt(10000 - bps)) / 10000n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
      const routerV1 = getV2RouterAddress(AGGREGATOR_NETWORK);
      const pathV1 = decodeV1RouterAddressPath((quote?.encodedPath ?? "0x") as `0x${string}`);

      // ── Step 2: Route-transformer balance check (runs for every swap path) ──
      const isHbarSell = needsHbarWrap(tokenIn);
      const inputAmountTiny = isHbarSell
        ? BigInt(Math.floor(parseFloat(amountIn.replace(/,/g, "") || "0") * 1e8))
        : (() => { try { return parseUnits(amountIn.replace(/,/g, "") || "0", effectiveDecimalsIn); } catch { return 0n; } })();

      const transformResult = transformRouteWithGasCheck(
        [{ fromToken: tokenIn, toToken: tokenOut }],
        {
          userAddress: walletAddress,
          inputAmountTiny,
          nativeHbarBalanceWei: effectiveNativeHbarBalance?.value ?? null,
          erc20BalanceTiny: isHbarSell ? null : (balanceInWei ?? null),
          isNativeHbar: isHbarSell,
        },
        whbarAddr ?? "",
      );

      if (transformResult.balanceCheck === "insufficient" || transformResult.balanceCheck === "no_balance") {
        setSwapMsg(`❌ ${transformResult.message}`);
        return;
      }


      /**
       * SaucerSwap V1 — native HBAR → token: `swapExactETHForTokens*` + msg.value (docs dùng tên ETH).
       * Path[0] phải là WHBAR; `msg.value` = weibars (18 decimals).
       */
      if (
        routerV1 &&
        pathV1 &&
        whbarAddr &&
        canUseSaucerV1NativeHbarInSwap({
          tokenInSymbol: tokenIn,
          quote,
          network: AGGREGATOR_NETWORK,
          whbarAddr,
          resolvedIn: resolvedIn as `0x${string}` | undefined,
        })
      ) {
        if (pathV1[0]!.toLowerCase() !== whbarAddr.toLowerCase()) {
          setSwapMsg("Route must start with WHBAR for native HBAR → token (check quote path).");
          return;
        }
        let valueWei: bigint;
        try {
          valueWei = parseUnits(amountIn.replace(/,/g, "") || "0", 18);
        } catch {
          setSwapMsg("Invalid amount.");
          return;
        }
        if (valueWei <= 0n) {
          setSwapMsg("Amount must be positive.");
          return;
        }
        // Step 2 already validated balance via transformResult above — proceed
        setSwapMsg("Submitting SaucerSwap (native HBAR, msg.value)…");
        const fn = getSaucerSwapHbarToTokenFunctionName();
        const swapArgs = [minOut, pathV1, walletAddress, deadline] as const;
        if (wpath) {
          const txId = await hashgraphWalletConnect.executePayableContractCallWithValueWei(
            routerV1,
            [...SAUCERSWAP_V1_ROUTER_NATIVE_ABI],
            fn,
            swapArgs,
            valueWei,
            3_000_000,
          );
          setSwapTxHash(txId);
        } else {
          const h = await writeContractAsync({
            address: routerV1,
            abi: SAUCERSWAP_V1_ROUTER_NATIVE_ABI,
            functionName: fn,
            args: [...swapArgs],
            value: valueWei,
            gas: 3_000_000n,
          });
          await waitForTransactionSuccess(publicClient!, h, "SaucerSwap swapExactETHForTokens");
          setSwapTxHash(h);
        }
        setSwapMsg(
          "Swap confirmed (SaucerSwap native HBAR). Ensure output token is associated in HashPack if needed.",
        );
        return;
      }

      /**
       * SaucerSwap V1 — token → HBAR: path kết thúc WHBAR; `swapExactTokensForETH*` unwrap native.
       */
      if (
        routerV1 &&
        pathV1 &&
        whbarAddr &&
        canUseSaucerV1TokenToHbarSwap({
          tokenOutSymbol: tokenOut,
          quote,
          network: AGGREGATOR_NETWORK,
          whbarAddr,
          resolvedOut: resolvedOut as `0x${string}` | undefined,
        })
      ) {
        if (pathV1[pathV1.length - 1]!.toLowerCase() !== whbarAddr.toLowerCase()) {
          setSwapMsg("Route must end with WHBAR for token → HBAR.");
          return;
        }
        const amountInWeiTok = parseUnits(amountIn.replace(/,/g, "") || "0", effectiveDecimalsIn);
        if (resolvedIn) {
          let needApproveRouter = true;
          if (publicClient) {
            const cur = await publicClient.readContract({
              address: resolvedIn,
              abi: AGGREGATOR_ERC20_ABI,
              functionName: "allowance",
              args: [walletAddress, routerV1],
            });
            needApproveRouter = (cur as bigint) < amountInWeiTok;
          }
          if (needApproveRouter) {
            setSwapMsg("Approving SaucerSwap router…");
            if (wpath) {
              await hashgraphWalletConnect.executeContractCall(
                resolvedIn,
                [...AGGREGATOR_ERC20_ABI],
                "approve",
                [routerV1, amountInWeiTok],
                1_500_000,
              );
            } else if (publicClient) {
              const h = await writeContractAsync({
                address: resolvedIn,
                abi: AGGREGATOR_ERC20_ABI,
                functionName: "approve",
                args: [routerV1, amountInWeiTok],
                gas: 4_000_000n,
              });
              await waitForTransactionSuccess(publicClient, h, "approve router (token→HBAR)");
            }
            await new Promise((r) => setTimeout(r, 600));
          }
        }
        setSwapMsg("Submitting SaucerSwap (token → HBAR)…");
        const fn = "swapExactTokensForETHSupportingFeeOnTransferTokens";
        const swapArgs = [amountInWeiTok, minOut, pathV1, walletAddress, deadline] as const;
        if (wpath) {
          const txId = await hashgraphWalletConnect.executeContractCall(
            routerV1,
            [...SAUCERSWAP_V1_ROUTER_NATIVE_ABI],
            fn,
            [...swapArgs],
            2_500_000,
          );
          setSwapTxHash(txId);
        } else {
          const h = await writeContractAsync({
            address: routerV1,
            abi: SAUCERSWAP_V1_ROUTER_NATIVE_ABI,
            functionName: fn,
            args: [...swapArgs],
            gas: 2_500_000n,
          });
          await waitForTransactionSuccess(publicClient!, h, "SaucerSwap swapExactTokensForETH");
          setSwapTxHash(h);
        }
        setSwapMsg(
          "Swap confirmed (SaucerSwap token → HBAR). Native HBAR line in wallet may show only fees — check balance.",
        );
        return;
      }

      /**
       * Native HBAR → token qua Exchange + NativeHbarV2Adapter (CLMM exactInput).
       * Exchange nhận msg.value (weibars), adapter wrap → WHBAR, swap qua SaucerSwap V2.
       * extraData = abi.encode(bytes packed_path) đã có trong quote.encodedPath.
       */
      if (isHbarSell && canNativeHbarViaExchange && quote?.swapExecution === "v2_clmm" && exchangeContract && whbarAddr) {
        let valueWei: bigint;
        try {
          valueWei = parseUnits(amountIn.replace(/,/g, "") || "0", 18);
        } catch {
          setSwapMsg("Invalid amount.");
          return;
        }
        if (valueWei <= 0n) {
          setSwapMsg("Amount must be positive.");
          return;
        }
        const amountInTiny = valueWei / WEIBARS_PER_TINYBAR;
        const adapterData = (quote?.encodedPath ?? "0x") as `0x${string}`;
        // adapterId = hbar_native_v2 (already in onchainAdapterBytes32 due to fix #2)
        const swapParams = {
          adapterId: onchainAdapterBytes32,
          tokenIn: whbarAddr as `0x${string}`,
          tokenOut: resolvedOut as `0x${string}`,
          amountIn: amountInTiny,
          minAmountOut: minOut,
          recipient: walletAddress,
          deadline,
          adapterData,
        };
        setSwapMsg("Submitting swap (native HBAR via Exchange + NativeHbarV2Adapter, CLMM)…");
        if (wpath) {
          const txId = await hashgraphWalletConnect.executePayableContractCallWithValueWei(
            exchangeContract,
            [...AGGREGATOR_EXCHANGE_ABI],
            "swap",
            [swapParams],
            valueWei,
            3_500_000,
          );
          setSwapTxHash(txId);
        } else {
          const h = await writeContractAsync({
            address: exchangeContract,
            abi: AGGREGATOR_EXCHANGE_ABI,
            functionName: "swap",
            args: [swapParams],
            value: valueWei,
            gas: 3_500_000n,
          });
          await waitForTransactionSuccess(publicClient!, h, "Exchange.swap (NativeHbarV2Adapter)");
          setSwapTxHash(h);
        }
        setSwapMsg(
          "Swap confirmed (native HBAR → token via Exchange + NativeHbarV2Adapter). Đảm bảo output token đã associated trong HashPack nếu cần.",
        );
        return;
      }

      /**
       * Native HBAR → token qua Exchange + NativeHbarV1Adapter.
       * Exchange nhận msg.value (weibars), adapter tự wrap WHBAR rồi swap V1.
       * Không cần approve ERC-20 — adapter dùng msg.value, không pull tokenIn.
       */
      if (isHbarSell && canNativeHbarViaExchange && exchangeContract && pathV1 && whbarAddr) {
        if (pathV1[0]!.toLowerCase() !== whbarAddr.toLowerCase()) {
          setSwapMsg("Route phải bắt đầu bằng WHBAR cho NativeHbarV1Adapter (kiểm tra quote path).");
          return;
        }
        let valueWei: bigint;
        try {
          valueWei = parseUnits(amountIn.replace(/,/g, "") || "0", 18);
        } catch {
          setSwapMsg("Invalid amount.");
          return;
        }
        if (valueWei <= 0n) {
          setSwapMsg("Amount must be positive.");
          return;
        }
        // amountIn cho Exchange.swap params = tinybars (WHBAR unit)
        const amountInTiny = valueWei / WEIBARS_PER_TINYBAR;
        const nativeHbarAdapterId = encodeAdapterId(getNativeHbarAdapterId());
        const adapterData = (quote?.encodedPath ?? "0x") as `0x${string}`;
        const swapParams = {
          adapterId: nativeHbarAdapterId,
          tokenIn: whbarAddr as `0x${string}`,   // adapter dùng WHBAR làm tokenIn sau wrap
          tokenOut: resolvedOut as `0x${string}`,
          amountIn: amountInTiny,
          minAmountOut: minOut,
          recipient: walletAddress,
          deadline,
          adapterData,
        };
        setSwapMsg("Submitting swap (native HBAR via Exchange + NativeHbarV1Adapter)…");
        if (wpath) {
          const txId = await hashgraphWalletConnect.executePayableContractCallWithValueWei(
            exchangeContract,
            [...AGGREGATOR_EXCHANGE_ABI],
            "swap",
            [swapParams],
            valueWei,
            3_000_000,
          );
          setSwapTxHash(txId);
        } else {
          const h = await writeContractAsync({
            address: exchangeContract,
            abi: AGGREGATOR_EXCHANGE_ABI,
            functionName: "swap",
            args: [swapParams],
            value: valueWei,
            gas: 3_000_000n,
          });
          await waitForTransactionSuccess(publicClient!, h, "Exchange.swap (NativeHbarV1Adapter)");
          setSwapTxHash(h);
        }
        setSwapMsg(
          "Swap confirmed (native HBAR → token via Exchange). Đảm bảo output token đã associated trong HashPack nếu cần.",
        );
        return;
      }

      /**
       * Guard cuối: HBAR native không qua được bất kỳ path nào.
       * Ngăn gọi Exchange.swap() thiếu msg.value → revert.
       */
      if (isHbarSell) {
        setSwapMsg(
          "❌ Không thể swap HBAR native: cần NativeHbarV1Adapter (v1_amm) hoặc NativeHbarV2Adapter (v2_clmm) đã được deploy + setAdapter trên Exchange, và quote phải là router_v2. " +
          "Hoặc chọn WHBAR làm token bán.",
        );
        return;
      }

      if (!exchangeContract) {
        setSwapMsg(
          "Missing VITE_AGGREGATOR_EXCHANGE_CONTRACT. Native HBAR / token→HBAR direct swaps use SaucerSwap V1 only when quote is V1 AMM; V2 (CLMM) still needs Exchange + adapter.",
        );
        return;
      }

      const amountInWei = parseUnits(amountIn.replace(/,/g, "") || "0", effectiveDecimalsIn);
      const adapterData = (quote?.encodedPath ?? "0x") as `0x${string}`;
      const params = {
        adapterId: onchainAdapterBytes32,
        tokenIn: resolvedIn,
        tokenOut: resolvedOut,
        amountIn: amountInWei,
        minAmountOut: minOut,
        recipient: walletAddress,
        deadline,
        adapterData,
      };

      /**
       * Luồng A: đủ WHBAR ERC-20 → route WHBAR→… như cũ.
       * Luồng B: thiếu WHBAR nhưng đủ HBAR native → `deposit()` wrap rồi mới approve/swap.
       */
      const sellingWhbar =
        Boolean(whbarAddr && resolvedIn && whbarAddr.toLowerCase() === resolvedIn.toLowerCase());
      const balIn = balanceInWei ?? 0n;
      const deficitTiny = amountInWei > balIn ? amountInWei - balIn : 0n;

      if (deficitTiny > 0n) {
        if (!sellingWhbar) {
          // Step 2: ERC-20 balance already validated by transformer above
          setSwapMsg(
            "Insufficient sell token (ERC-20) — lower the amount or add tokens to this wallet.",
          );
          return;
        }
        // Step 1: auto-wrap — use transformer's wrapAmountTinybars
        const wrapTiny = transformResult.wrapAmountTinybars > 0n
          ? transformResult.wrapAmountTinybars
          : deficitTiny;
        const weibarCost = whbarTinybarsToDepositWeibar(wrapTiny);
        if (effectiveNativeHbarBalance == null || effectiveNativeHbarBalance.value < weibarCost) {
          setSwapMsg(
            "Not enough native HBAR to auto-wrap to WHBAR for this amount (leave room for fees). Lower the amount or add HBAR.",
          );
          return;
        }
        setSwapMsg(`Wrapping ~${formatUnits(weibarCost, 18)} HBAR → WHBAR (step 1 / 3)…`);
        if (wpath) {
          await hashgraphWalletConnect.executePayableContractCall(
            resolvedIn,
            [...AGGREGATOR_WHBAR_WRAP_ABI],
            "deposit",
            [],
            wrapTiny,
            2_500_000,
          );
        } else {
          const hWrap = await writeContractAsync({
            address: resolvedIn,
            abi: AGGREGATOR_WHBAR_WRAP_ABI,
            functionName: "deposit",
            args: [],
            value: weibarCost,
            gas: 2_500_000n,
          });
          await waitForTransactionSuccess(publicClient!, hWrap, "WHBAR deposit (wrap)");
        }
        const br = await refetchBalanceIn();
        if ((br.data ?? 0n) < amountInWei) {
          setSwapMsg("Still not enough WHBAR after wrap — retry or check RPC.");
          return;
        }
        await refetchAllowance();
        await new Promise((r) => setTimeout(r, 900));
      }

      const al = await refetchAllowance();
      const allowanceFresh = al.data;
      const needApprove = allowanceFresh === undefined || allowanceFresh < amountInWei;

      if (wpath) {
        if (needApprove) {
          setSwapMsg("Approving token for Exchange…");
          const txId1 = await hashgraphWalletConnect.executeContractCall(
            resolvedIn,
            [...AGGREGATOR_ERC20_ABI],
            "approve",
            [exchangeContract, amountInWei],
            1_500_000,
          );
          void txId1;
          await refetchAllowance();
          await new Promise((r) => setTimeout(r, 800));
        }
        setSwapMsg("Submitting swap…");
        const swapGas =
          quote?.swapExecution === "v2_clmm" ? 3_500_000 : 2_500_000;
        const txId2 = await hashgraphWalletConnect.executeContractCall(
          exchangeContract,
          [...AGGREGATOR_EXCHANGE_ABI],
          "swap",
          [params],
          Number(swapGas),
        );
        setSwapTxHash(txId2);
        setSwapMsg(
          "Swap confirmed on-chain.\n\nOn Hedera wallets, the main HBAR line usually only shows network fees (tinybars). The sold amount is ERC-20 (e.g. WHBAR): check token balances, not a large native HBAR line.\n\nTo see USDC received: associate the USDC token in HashPack if needed, or open HashScan (link below) for transfers.",
        );
        await refetchAllowance();
        return;
      }

      if (needApprove) {
        setSwapMsg("Approving token for Exchange…");
        const h1 = await writeContractAsync({
          address: resolvedIn,
          abi: AGGREGATOR_ERC20_ABI,
          functionName: "approve",
          args: [exchangeContract, amountInWei],
          gas: 1_500_000n,
        });
        await waitForTransactionSuccess(publicClient!, h1, "approve Exchange");
        await refetchAllowance();
        await new Promise((r) => setTimeout(r, 600));
      }

      setSwapMsg("Submitting swap…");
      const swapGas =
        quote?.swapExecution === "v2_clmm" ? 3_500_000n : 2_500_000n;
      const h2 = await writeContractAsync({
        address: exchangeContract,
        abi: AGGREGATOR_EXCHANGE_ABI,
        functionName: "swap",
        args: [params],
        gas: swapGas,
        value: 0n,
      });
      await waitForTransactionSuccess(publicClient!, h2, "Exchange.swap");
      setSwapTxHash(h2);
      setSwapMsg(
        "Swap confirmed on-chain. The HBAR line on your wallet is usually just the small fee; WHBAR/USDC balances change under ERC-20 tokens. Associate USDC in the wallet if the balance does not show.",
      );
      await refetchAllowance();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      let msg = raw.length > 320 ? raw.slice(0, 320) + "…" : raw;
      if (/CONTRACT_REVERT_EXECUTED/i.test(msg)) {
        msg =
          "Contract reverted (CONTRACT_REVERT_EXECUTED). Common causes: (1) Not enough WHBAR (ERC-20) — wrap native HBAR first when selling HBAR/WHBAR. (2) Output token not associated (SAUCE, USDC, …) in HashPack. (3) Slippage too tight or pool/gas. Details: " +
          msg;
      }
      setSwapMsg(msg.length > 520 ? msg.slice(0, 520) + "…" : msg);
    }
    } finally {
      setSwapBusy(false);
    }
  }, [
    amountIn,
    chainMismatch,
    effectiveDecimalsIn,
    exchangeContract,
    onchainAdapterBytes32,
    publicClient,
    quote,
    balanceInWei,
    effectiveNativeHbarBalance,
    refetchAllowance,
    refetchBalanceIn,
    resolvedIn,
    resolvedOut,
    slippageBps,
    tokenAllowance,
    wagmiAddress,
    whbarAddr,
    walletAddress,
    wcAddress,
    writeContractAsync,
    swapBaseOutWei,
    tokenIn,
    tokenOut,
  ]);

  const flipTokens = useCallback(() => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setTokenInAddr(tokenOutAddr);
    setTokenOutAddr(tokenInAddr);
  }, [tokenIn, tokenOut, tokenInAddr, tokenOutAddr]);

  const hasExchangeOrSaucerDirect =
    Boolean(exchangeContract) || canDirectSaucerNativeIn || canDirectSaucerTokenToHbar;

  const canSwapNow =
    Boolean(quote) &&
    Boolean(wcSwapPath || wagmiSwapPath) &&
    hasExchangeOrSaucerDirect &&
    !chainMismatch &&
    (onchainRaw != null || quote?.expectedOutWei != null) &&
    !insufficientSellForSwap &&
    !isWritePending &&
    !swapBusy;

  const primaryCta = useMemo(() => {
    if (!hasSellAmount) {
      return { label: "Enter an amount" as const, disabled: true, action: "none" as const };
    }
    if (quoteLoading) {
      return { label: "Getting quote…" as const, disabled: true, action: "none" as const };
    }
    if (!quote) {
      return { label: "Get quote" as const, disabled: false, action: "quote" as const };
    }
    if (!wcSwapPath && !wagmiSwapPath) {
      return { label: "Connect wallet to swap" as const, disabled: true, action: "none" as const };
    }
    if (chainMismatch) {
      return { label: "Wrong network" as const, disabled: true, action: "none" as const };
    }
    if (!exchangeContract && !canDirectSaucerNativeIn && !canDirectSaucerTokenToHbar) {
      return { label: "Configure Exchange" as const, disabled: true, action: "none" as const };
    }
    if (insufficientSellForSwap) {
      return {
        label: canDirectSaucerNativeIn
          ? ("Insufficient native HBAR" as const)
          : ("Insufficient sell token (need WHBAR ERC-20)" as const),
        disabled: true,
        action: "none" as const,
      };
    }
    if (onchainRaw == null && quote.expectedOutWei == null) {
      return { label: "Get quote" as const, disabled: false, action: "quote" as const };
    }
    if (isWritePending || swapBusy) {
      return { label: "Confirm in wallet…" as const, disabled: true, action: "none" as const };
    }
    return {
      label: "Swap" as const,
      disabled: !canSwapNow,
      action: "swap" as const,
    };
  }, [
    hasSellAmount,
    quoteLoading,
    quote,
    wcSwapPath,
    wagmiSwapPath,
    chainMismatch,
    exchangeContract,
    canDirectSaucerNativeIn,
    canDirectSaucerTokenToHbar,
    insufficientSellForSwap,
    onchainRaw,
    canSwapNow,
    isWritePending,
    swapBusy,
  ]);

  return (
    <div className="zenit-ag min-h-screen bg-[#0d0f18] font-sans antialiased">
      {/* Mainnet-only banner khi user kết nối testnet */}
      {chainId !== HEDERA_EVM_MAINNET_CHAIN_ID && isConnected && (
        <div className="sticky top-0 z-50 border-b border-yellow-500/30 bg-yellow-900/20 px-4 py-3 text-center backdrop-blur-sm">
          <p className="text-sm font-semibold text-yellow-200">
            ⚠️ Aggregator page is <strong>mainnet-only</strong> (chain ID 295). You are connected to chain {chainId}.
          </p>
          <button
            type="button"
            onClick={() => switchChain?.({ chainId: HEDERA_EVM_MAINNET_CHAIN_ID })}
            disabled={isSwitchChainPending}
            className="mt-2 rounded-lg border border-yellow-400/40 bg-yellow-600/30 px-4 py-1.5 text-xs font-medium text-yellow-100 transition hover:bg-yellow-600/50 disabled:opacity-50"
          >
            {isSwitchChainPending ? "Switching…" : "Switch to Hedera Mainnet"}
          </button>
        </div>
      )}
      {/* Hero — aligned with app shell: indigo / cyan accents */}
      <section className="relative overflow-hidden border-b border-indigo-500/15">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.45]"
          style={{
            background:
              "radial-gradient(ellipse 85% 55% at 50% -15%, rgba(99,102,241,0.22), transparent), radial-gradient(ellipse 45% 50% at 100% 0%, rgba(56,189,248,0.14), transparent), radial-gradient(ellipse 40% 35% at 0% 20%, rgba(98,249,214,0.1), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-10 text-center sm:px-6 sm:pb-20 sm:pt-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-indigo-300/90">
            Hedera EVM · Liquidity aggregator
          </p>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl sm:leading-[1.15]">
            <span
              className="bg-gradient-to-r from-white via-indigo-200 to-cyan-300 bg-clip-text text-transparent"
              style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
            >
              Route smarter. Swap better.
            </span>
            <br />
            <span className="text-slate-200">A Zenit UI — wired to smart contracts &amp; adapters.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm font-light leading-relaxed text-slate-400 sm:text-base">
            Multi-hop (expanding), slippage control, split orders — powered by{" "}
            <code className="rounded border border-indigo-500/20 bg-indigo-950/40 px-1.5 py-0.5 font-mono text-xs text-indigo-200/90">
              Exchange
            </code>{" "}
            +{" "}
            <code className="rounded border border-indigo-500/20 bg-indigo-950/40 px-1.5 py-0.5 font-mono text-xs text-indigo-200/90">
              IAdapter
            </code>{" "}
            in this repo. Quotes via SaucerSwap (mainnet) when token addresses are set in env; on-chain quote when contracts and
            env are configured.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => document.getElementById("zenit-swap-panel")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex min-w-[200px] items-center justify-center rounded-xl border border-indigo-400/30 bg-gradient-to-r from-indigo-600 to-cyan-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-950/40 transition hover:brightness-110"
            >
              Open swap panel
            </button>
            <HashPackConnectButton align="center" />
          </div>
          <p className="mt-6 text-[11px] text-slate-500">
            Zenit Perpetual DEX · Aggregator (beta) — see{" "}
            <code className="rounded border border-white/10 bg-black/30 px-1 font-mono text-[10px] text-slate-400">docs/AGGREGATOR.md</code>
          </p>
        </div>
      </section>

      {/* Stats strip — optional backend */}
      <section className="border-b border-indigo-500/10 bg-[#0a0c14] py-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {[
              { label: "Volume (USD)", key: "volume" as const },
              { label: "Trades", key: "trades" as const },
              { label: "Liquidity providers", key: "liquidityProviders" as const },
              { label: "Unique users", key: "uniqueUsers" as const },
            ].map((row) => (
              <div
                key={row.key}
                className="relative text-center after:absolute after:right-0 after:top-0 after:hidden after:h-full after:w-px after:bg-indigo-500/25 md:after:block md:last:after:hidden"
              >
                <div className="font-extrabold tabular-nums text-3xl text-[#9ca3af] sm:text-4xl">
                  {stats ? stats[row.key] : "—"}
                </div>
                <div className="mt-1 text-sm text-[#c5c5c5]">{row.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-[11px] text-slate-500">
            {statsUrl
              ? statsError ?? (stats ? `Live: ${statsUrl}` : "Loading stats…")
              : "Set VITE_AGGREGATOR_STATS_URL to show stats from your backend (optional)."}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-12 sm:px-6">
        {quote?.quoteSource === "router_v2" && (
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/25 px-4 py-3 text-sm text-slate-200">
            <strong className="text-indigo-200">Pair price (latest SaucerSwap):</strong> Buy box / rate prefers{" "}
            <strong className="text-cyan-300">V2 QuoterV2</strong> (CLMM, multi-hop WHBAR/USDC when needed) — aligned with the
            official app. <strong className="text-indigo-100">Zenit execution</strong> still uses{" "}
            <code className="rounded bg-black/30 px-1 text-xs">getAmountsOut</code> V1 + adapter. Chain:{" "}
            <strong className="text-white">{network}</strong> ({chainLabel}).
          </div>
        )}

        <div
          id="zenit-swap-panel"
          className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-start"
        >
          <div className="mx-auto w-full max-w-[460px]">
            <div className="zenit-swapv2-shell p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="bg-gradient-to-r from-indigo-200 to-cyan-200 bg-clip-text text-xl font-semibold tracking-tight text-transparent">
                  Swap
                </h2>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-200 ring-1 ring-indigo-400/35">
                    Mainnet · {expectedChainId}
                  </span>
                  <HashPackConnectButton align="end" variant="pill" />
                </div>
              </div>
              {activeEvmNetwork !== "mainnet" && (
                <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/35 px-3 py-2 text-[11px] leading-relaxed text-rose-100/95">
                  <strong className="text-rose-200">Build for mainnet:</strong> this page and aggregate contracts target{" "}
                  <strong className="text-white">Hedera EVM 295</strong>. In{" "}
                  <code className="rounded bg-black/30 px-1 font-mono text-[10px]">frontend/.env</code> set{" "}
                  <code className="rounded bg-black/30 px-1 font-mono text-[10px]">VITE_HEDERA_EVM_NETWORK=mainnet</code> and
                  restart the dev server — otherwise HashPack (WalletConnect) may connect to <strong className="text-white">testnet</strong>{" "}
                  and mainnet swaps will fail or not sign.
                </div>
              )}

              <p className="mt-1 text-[10px] text-slate-600">
                Zenit · hops ≤ {AGGREGATOR_MAX_HOPS}
                {quoteContract && (
                  <>
                    {" "}
                    · quote <span className="font-mono text-indigo-400/90">{quoteContract.slice(0, 8)}…</span>
                  </>
                )}
                {exchangeContract && (
                  <>
                    {" "}
                    · exch <span className="font-mono text-cyan-400/80">{exchangeContract.slice(0, 8)}…</span>
                  </>
                )}
              </p>

              {quote?.quoteSource === "router_v2" && (
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  <strong className="text-cyan-300/90">Price &amp; execution:</strong>{" "}
                  {quote.swapExecution === "v2_clmm" ? (
                    <>
                      <strong className="text-slate-200">SaucerSwap V2 CLMM</strong> (QuoterV2 + SwapRouter{" "}
                      <code className="rounded bg-white/5 px-1 font-mono text-slate-400">exactInput</code>) — requires{" "}
                      <code className="rounded bg-white/5 px-1 font-mono text-slate-400">saucerswap_v2</code> on Exchange.
                    </>
                  ) : quote.saucerswapV2Reference ? (
                    <>
                      <strong className="text-slate-200">V2</strong> (QuoterV2) for spot;{" "}
                      <strong className="text-slate-300">min receive &amp; Zenit swap</strong> follow{" "}
                      <strong className="text-slate-300">V1</strong>{" "}
                      <code className="rounded bg-white/5 px-1 font-mono text-slate-400">getAmountsOut</code>.
                    </>
                  ) : (
                    <>
                      using <strong className="text-slate-300">V1</strong> (Quoter V2 returned no result — see below if
                      applicable).
                    </>
                  )}{" "}
                  CEX vs DEX spread is normal; compare the same amount in.
                </p>
              )}

              {quote?.quoteSource === "router_v2" && quote.saucerswapV2Error && !quote.saucerswapV2Reference && quote.swapExecution !== "v2_clmm" && (
                <div className="mt-2 rounded-lg border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-[10px] leading-relaxed text-amber-100/95">
                  <strong className="text-amber-200">V2 (CLMM):</strong> {quote.saucerswapV2Error}
                </div>
              )}

              {quoteError && (
                <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
                  {quoteError}
                </div>
              )}
              {onchainQuoteLoading && !quoteError && (
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500" aria-live="polite">
                  Fetching <strong className="text-slate-400">Exchange.quote</strong> (after router quote)…
                </p>
              )}
              {onchainSoftNote && !quoteError && (
                <div className="mt-3 rounded-lg border border-slate-500/30 bg-slate-900/40 px-3 py-2 text-[10px] leading-relaxed text-slate-300">
                  <strong className="text-slate-200">On-chain:</strong> {onchainSoftNote}
                </div>
              )}
              {onchainError && !quoteError && (
                <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-950/30 px-3 py-2 text-[10px] text-amber-100/90">
                  <strong className="text-amber-200">On-chain quote:</strong> {onchainError}
                </div>
              )}

              <div className="zenit-swapv2-panel mt-5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-400">Sell</span>
                  <div className="flex gap-1">
                    {(["25", "50", "max"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => applySellPct(k === "max" ? "max" : (k as "25" | "50"))}
                        disabled={
                          tokenIn === "HBAR"
                            ? effectiveNativeHbarBalance == null
                            : balanceInWei == null || decimalsInData === undefined
                        }
                        className="zenit-swapv2-pct disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {k === "max" ? "MAX" : `${k}%`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <ZenitDropdown
                        ariaLabel="Token to sell"
                        value={tokenIn}
                        onChange={setTokenIn}
                        options={tokenDropdownOptions}
                      />
                    </div>
                  </div>
                  <input
                    value={amountIn}
                    onChange={(e) => setAmountIn(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    className="zenit-swapv2-amount-in"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  <span className="text-slate-600">Balance · {tokenIn}:</span>{" "}
                  {!walletAddress ? (
                    <span className="text-slate-600">Connect wallet to view</span>
                  ) : (!resolvedIn || !isAddress(resolvedIn)) && tokenIn !== "HBAR" ? (
                    <span className="text-amber-200/90">Missing token address (env / Advanced)</span>
                  ) : tokenIn === "HBAR" && effectiveIsErrorNativeHbar ? (
                    <span className="text-rose-300/95" title={effectiveErrorNativeHbar?.message}>
                      Could not read native HBAR (RPC 295?)
                    </span>
                  ) : isErrorBalanceIn ? (
                    <span className="text-rose-300/95" title={errorBalanceIn?.message}>
                      Could not read balance (RPC chain 295?)
                    </span>
                  ) : showBalanceInLoading ? (
                    <span className="font-mono text-slate-500">Loading…</span>
                  ) : displayBalanceInHuman != null ? (
                    <span className="font-mono tabular-nums text-slate-300">
                      {Number(displayBalanceInHuman).toLocaleString(undefined, { maximumFractionDigits: 8 })}{" "}
                      <span className="text-slate-500">{tokenIn}</span>
                      {tokenIn === "HBAR" && (
                        <span className="ml-1 text-[9px] text-slate-600" title="Same native HBAR as in HashPack (not only WHBAR ERC-20).">
                          (native)
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="font-mono text-slate-500">—</span>
                  )}
                </p>
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-600">
                  Quotes refresh when you change <strong className="text-slate-500">amount</strong>,{" "}
                  <strong className="text-slate-500">pair</strong>, or <strong className="text-slate-500">slippage</strong>{" "}
                  (~{Math.round(AUTO_QUOTE_DEBOUNCE_MS / 100) / 10}s debounce after typing).
                </p>
                {tokenIn === "HBAR" && (
                  <p className="mt-2 rounded-lg border border-cyan-500/20 bg-cyan-950/20 px-2.5 py-1.5 text-[10px] leading-snug text-cyan-100/90">
                    <strong className="text-cyan-200">Native HBAR swap</strong>: The app automatically routes your swap via{" "}
                    <strong className="text-white">SaucerSwap V1 router</strong> (direct native HBAR → token) or{" "}
                    <strong className="text-white">Exchange + NativeHbarAdapter</strong> (wraps internally). No manual wrapping needed!
                  </p>
                )}
                {tokenIn === "WHBAR" && (
                  <p className="mt-2 rounded-lg border border-cyan-500/20 bg-cyan-950/20 px-2.5 py-1.5 text-[10px] leading-snug text-cyan-100/90">
                    <strong className="text-cyan-200">WHBAR swap</strong>: Using wrapped HBAR (ERC-20). The app will approve and swap via{" "}
                    <code className="text-cyan-300/90">Exchange.swap</code> (WHBAR → token out).
                  </p>
                )}
                {gasWarning && (
                  <div className={`mt-2 rounded-lg border px-2.5 py-1.5 text-[10px] leading-snug ${
                    gasWarning.startsWith("⚠️")
                      ? "border-amber-500/30 bg-amber-950/20 text-amber-200/90"
                      : "border-blue-500/20 bg-blue-950/20 text-blue-200/90"
                  }`}>
                    <p>{gasWarning}</p>
                    {/* Step 3: Show "Wrap HBAR to WHBAR" button when wrap is needed */}
                    {routeTransform?.needsWrap && routeTransform.balanceCheck !== "insufficient" && walletAddress && (
                      <button
                        type="button"
                        className="mt-1.5 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors"
                        onClick={() => void onSwap()}
                        disabled={swapBusy}
                      >
                        {swapBusy ? "Wrapping…" : "⚡ Wrap HBAR → WHBAR + Swap"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="zenit-swap-divider">
                <button
                  type="button"
                  onClick={flipTokens}
                  className="zenit-swap-fab"
                  title="Flip Sell / Buy"
                  aria-label="Swap token direction"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M7 16V4M7 4L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              <div className="zenit-swapv2-panel p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-400">Buy</span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <ZenitDropdown
                        ariaLabel="Token to buy"
                        value={tokenOut}
                        onChange={setTokenOut}
                        options={tokenDropdownOptions}
                      />
                    </div>
                  </div>
                  <div className="zenit-swapv2-amount-out min-h-[2rem] max-w-[55%] truncate text-right font-mono tabular-nums">
                    {quoteLoading ? "…" : quote ? displayExpectedOutHuman ?? quote.expectedOutHuman : "0"}
                  </div>
                </div>
                {quote?.swapExecution === "v2_clmm" && quote.v1AmmFallback && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    V1 AMM comparison (not used for swap):{" "}
                    <span className="font-mono text-slate-400">{quote.v1AmmFallback.expectedOutHuman}</span> {tokenOut}.
                  </p>
                )}
                {quote?.swapExecution !== "v2_clmm" &&
                  quote?.saucerswapV2Reference &&
                  quote.expectedOutHuman !== quote.saucerswapV2Reference.expectedOutHuman && (
                    <p className="mt-1 text-[10px] text-slate-500">
                      CLMM reference (QuoterV2, may match SaucerSwap app):{" "}
                      <span className="font-mono text-slate-400">
                        {quote.saucerswapV2Reference.expectedOutHuman}
                      </span>{" "}
                      {tokenOut} — Zenit swap still follows the V1 router above.
                    </p>
                  )}
                <p className="mt-2 text-xs text-slate-500">
                  <span className="text-slate-600">Balance · {tokenOut}:</span>{" "}
                  {!walletAddress ? (
                    <span className="text-slate-600">Connect wallet to view</span>
                  ) : (!resolvedOut || !isAddress(resolvedOut)) && tokenOut !== "HBAR" ? (
                    <span className="text-amber-200/90">Missing token address (env / Advanced)</span>
                  ) : tokenOut === "HBAR" && effectiveIsErrorNativeHbar ? (
                    <span className="text-rose-300/95" title={effectiveErrorNativeHbar?.message}>
                      Could not read native HBAR (RPC 295?)
                    </span>
                  ) : isErrorBalanceOut ? (
                    <span className="text-rose-300/95" title={errorBalanceOut?.message}>
                      Could not read balance (RPC chain 295?)
                    </span>
                  ) : showBalanceOutLoading ? (
                    <span className="font-mono text-slate-500">Loading…</span>
                  ) : displayBalanceOutHuman != null ? (
                    <span className="font-mono tabular-nums text-slate-300">
                      {Number(displayBalanceOutHuman).toLocaleString(undefined, { maximumFractionDigits: 8 })}{" "}
                      <span className="text-slate-500">{tokenOut}</span>
                      {tokenOut === "HBAR" && (
                        <span className="ml-1 text-[9px] text-slate-600" title="Native HBAR on the EVM wallet (same as HashPack).">
                          (native)
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="font-mono text-slate-500">—</span>
                  )}
                </p>
                {quote && effectiveSpotRate != null && (
                  <p className="mt-3 rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-center text-[13px] text-slate-300">
                    1 {tokenIn.trim().toUpperCase()} ≈{" "}
                    <span className="font-semibold tabular-nums text-[#7ef9c8]">{effectiveSpotRate.toFixed(6)}</span>{" "}
                    {tokenOut.trim().toUpperCase()}
                    <span className="mt-1 block text-[10px] font-normal text-slate-500">
                      {quote.swapExecution === "v2_clmm"
                        ? "Rate from V2 CLMM (same route as Zenit swap) — expected out ÷ amount in."
                        : quote.saucerswapV2Reference
                          ? "Rate from SaucerSwap V2 (CLMM) — expected out ÷ amount in."
                          : "Rate from V1 (no Quoter V2) — expected out ÷ amount in."}
                    </span>
                  </p>
                )}
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center gap-1.5 text-sm text-slate-400">
                  <span>Slippage tolerance</span>
                  <span className="cursor-help text-slate-600" title="Max % difference between quote and on-chain execution">
                    (?)
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SLIPPAGE_PRESET_BPS.map((bps) => (
                    <button
                      key={bps}
                      type="button"
                      data-active={slippageBps === bps ? "true" : "false"}
                      onClick={() => setSlippageBps(bps)}
                      className="zenit-swapv2-slip min-w-[4.5rem] flex-1 sm:flex-none"
                    >
                      {bps / 100}%
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-slate-600">
                  Custom slippage (bps): open <strong className="text-slate-500">Advanced</strong>.
                </p>
              </div>

              <div className="mt-4 space-y-2 border-t border-white/5 pt-4 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Network fee</span>
                  <span className="font-mono text-slate-200">≈0.2–0.6 HBAR</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">Min receive</span>
                  <span className="text-right font-mono text-[#acfadf] tabular-nums">
                    {minReceiveHumanDisplay != null ? `${minReceiveHumanDisplay} ${tokenOut}` : "—"}
                  </span>
                </div>
              </div>

              {quote?.swapExecution === "v2_clmm" && (
                <div className="mt-3 rounded-xl border border-cyan-500/35 bg-cyan-950/20 px-3 py-3 text-xs leading-relaxed">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-cyan-200">SaucerSwap V2 — Zenit swap (CLMM)</span>
                    <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] text-cyan-100">
                      adapter <code className="text-cyan-50">saucerswap_v2</code>
                    </span>
                  </div>
                  <p className="mt-2 text-slate-300">
                    Min receive and the swap use the same QuoterV2 route +{" "}
                    <code className="rounded bg-black/40 px-1 font-mono text-[10px]">exactInput(bytes path)</code>.
                  </p>
                </div>
              )}
              {quote?.saucerswapV2Reference && quote.swapExecution !== "v2_clmm" && (
                <div className="mt-3 rounded-xl border border-cyan-500/35 bg-cyan-950/20 px-3 py-3 text-xs leading-relaxed">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-cyan-200">SaucerSwap V2 (reference price — CLMM)</span>
                    <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] text-cyan-100">
                      {quote.saucerswapV2Reference.pathKind} · fee {quote.saucerswapV2Reference.feeTiers.join(" → ")}
                      {quote.saucerswapV2Reference.premiumVsV1Bps !== 0
                        ? ` · ${quote.saucerswapV2Reference.premiumVsV1Bps > 0 ? "+" : ""}${quote.saucerswapV2Reference.premiumVsV1Bps} bps vs V1`
                        : ""}
                    </span>
                  </div>
                  <p className="mt-2 text-slate-300">
                    Estimate (QuoterV2):{" "}
                    <strong className="font-mono text-cyan-100">
                      {quote.saucerswapV2Reference.expectedOutHuman} {tokenOut}
                    </strong>
                    <span className="text-slate-500">
                      {" "}
                      — min receive / Zenit follow <strong className="text-slate-400">V1</strong> quote above.
                    </span>
                  </p>
                </div>
              )}

              {quote?.venueSplitV1V2 && (
                <div className="mt-3 rounded-xl border border-violet-500/35 bg-violet-950/25 px-3 py-3 text-xs leading-relaxed">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-violet-200">Hybrid V1 + V2 (CLMM)</span>
                    <span className="rounded-full bg-violet-500/20 px-2 py-0.5 font-mono text-[10px] text-violet-100">
                      +{quote.venueSplitV1V2.improvementBpsVsBestSingle} bps vs max(V1,V2)
                    </span>
                  </div>
                  <p className="mt-2 text-slate-300">
                    Estimate if splitting liquidity:{" "}
                    <strong className="font-mono text-violet-100">
                      {quote.venueSplitV1V2.expectedOutHuman} {tokenOut}
                    </strong>
                    <span className="text-slate-500"> — </span>
                    <span className="font-mono text-slate-200">
                      {(quote.venueSplitV1V2.splitBpsToV1 / 100).toFixed(1)}%
                    </span>
                    <span className="text-slate-500"> V1 · </span>
                    <span className="font-mono text-slate-200">
                      {((10000 - quote.venueSplitV1V2.splitBpsToV1) / 100).toFixed(1)}%
                    </span>
                    <span className="text-slate-500"> V2 (fee {quote.venueSplitV1V2.v2FeeTiers.join(" → ")}).</span>
                  </p>
                  <p className="mt-1.5 font-mono text-[10px] text-slate-500">
                    V1: {shortPathAddrs(quote.venueSplitV1V2.v1Path)}
                    <br />
                    V2: {shortPathAddrs(quote.venueSplitV1V2.v2PathTokens)}
                  </p>
                  <p className="mt-2 border-t border-white/5 pt-2 text-[10px] text-slate-500">
                    Single-tx execution still follows the chosen single route (
                    {quote.expectedOutHuman} {tokenOut}). Splitting V1+V2 needs <strong className="text-slate-400">two transactions</strong>{" "}
                    (V1 router + CLMM SwapRouter) — shown for comparison with the official app.
                  </p>
                </div>
              )}

              {quote?.multiRouteSplit && (
                <div className="mt-3 rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-3 py-3 text-xs leading-relaxed">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-emerald-200">Multi-route (split across 2 pools)</span>
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-100">
                      +{quote.multiRouteSplit.improvementBps} bps vs 1 route
                    </span>
                  </div>
                  <p className="mt-2 text-slate-300">
                    Max estimate:{" "}
                    <strong className="font-mono text-[#acfadf]">
                      {quote.multiRouteSplit.expectedOutHuman} {tokenOut}
                    </strong>
                    <span className="text-slate-500"> — if splitting </span>
                    <span className="font-mono text-slate-200">
                      {(quote.multiRouteSplit.splitBpsToPathA / 100).toFixed(1)}%
                    </span>
                    <span className="text-slate-500"> / </span>
                    <span className="font-mono text-slate-200">
                      {((10000 - quote.multiRouteSplit.splitBpsToPathA) / 100).toFixed(1)}%
                    </span>
                    <span className="text-slate-500"> liquidity across two paths.</span>
                  </p>
                  <p className="mt-1.5 font-mono text-[10px] text-slate-500">
                    A: {shortPathAddrs(quote.multiRouteSplit.pathA)}
                    <br />
                    B: {shortPathAddrs(quote.multiRouteSplit.pathB)}
                  </p>
                  <p className="mt-2 border-t border-white/5 pt-2 text-[10px] text-slate-500">
                    Single on-chain swap still uses the <strong className="text-slate-400">best single route</strong> (
                    {quote.expectedOutHuman} {tokenOut}). CEX prices may differ due to order book / fees — not guaranteed to match Binance.
                  </p>
                </div>
              )}

              {quote?.htsRoutingNote && (
                <details className="mt-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[10px] leading-relaxed text-slate-500 open:border-[#62f9d6]/25 open:bg-[#62f9d6]/[0.04]">
                  <summary className="cursor-pointer list-none font-medium text-slate-400 marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-1.5">
                      {HTS_ROUTING_PANEL_TITLE}
                      <span className="text-slate-600">▾</span>
                    </span>
                  </summary>
                  <p className="mt-2 border-t border-white/5 pt-2 text-slate-500">{quote.htsRoutingNote}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-500">
                    {HTS_ROUTING_PANEL_BULLETS.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.07] bg-black/30">
                <div className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm text-slate-300">
                  <button
                    type="button"
                    onClick={() => setRoutePanelOpen((v) => !v)}
                    className="flex flex-1 items-center gap-2 text-left font-medium hover:text-white"
                  >
                    <span>Select route</span>
                    <span className="text-slate-500">{routePanelOpen ? "▴" : "▾"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onGetQuote()}
                    disabled={quoteLoading || !hasSellAmount}
                    className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-[#acfadf] hover:bg-white/10 disabled:opacity-40"
                  >
                    ↻ Refresh
                  </button>
                </div>
                {routePanelOpen && (
                  <div className="border-t border-white/5 px-3 py-3">
                    {rankedRoutesDisplay.length > 0 ? (
                      <>
                        <p className="mb-2 text-[10px] leading-relaxed text-slate-500">
                          <strong className="text-slate-400">#1</strong> = highest output (compare{" "}
                          <code className="text-slate-400">getAmountsOut</code> / QuoterV2). On-chain swap uses the route marked{" "}
                          <span className="text-[#acfadf]">Selected</span> (CLMM when a V2 pool exists, else V1).
                        </p>
                        <ul className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
                          {rankedRoutesDisplay.map((row) => (
                            <li
                              key={`${row.rank}-${row.kind}-${row.pathTokenAddresses.join("-")}`}
                              className={`rounded-lg border px-2.5 py-2 text-left ${
                                row.isPrimary
                                  ? "border-[#62f9d6]/55 bg-[#62f9d6]/[0.07]"
                                  : "border-white/[0.06] bg-black/25"
                              }`}
                            >
                              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <span className="min-w-0 break-all font-mono text-[11px] leading-snug text-[#acfadf] sm:text-xs">
                                  <span className="mr-1.5 shrink-0 text-slate-500">#{row.rank}</span>
                                  {row.label}
                                </span>
                                <span className="shrink-0 tabular-nums text-[11px] text-emerald-200/95 sm:text-xs">
                                  {row.expectedOutHuman} {tokenOut}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                                <span>{row.kind === "v2_clmm" ? "V2 (CLMM)" : "V1 (AMM)"}</span>
                                {row.isPrimary ? (
                                  <span className="rounded bg-[#62f9d6]/20 px-1.5 font-semibold text-[#acfadf]">Selected</span>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-2 text-[10px] text-slate-500">
                          <span aria-hidden>◉</span>
                          <span>{venueRouteBadge}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-lg border border-[#62f9d6]/40 bg-[#62f9d6]/5 px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-[#acfadf]">
                            <span className="text-base" aria-hidden>
                              ◉
                            </span>
                            <span className="font-mono text-xs sm:text-sm">{routePathLabel}</span>
                            <span className="ml-auto max-w-[min(200px,46%)] text-right text-[10px] leading-tight text-slate-500">
                              {venueRouteBadge}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-[10px] text-slate-600">
                          Spot price prefers Quoter <strong className="text-slate-500">V2 (CLMM)</strong>; min receive / on-chain swap via{" "}
                          <strong className="text-slate-500">V1 router</strong>. Set mainnet token addresses to see the full route list.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {quoteLoading && (
                <div className="zenit-swapv2-progress mt-4" aria-hidden>
                  <i />
                </div>
              )}
              {quote?.quoteRefinementPending && !quoteLoading && (
                <p className="mt-2 text-center text-[10px] text-slate-500" aria-live="polite">
                  Refining split-route comparison (background)…
                </p>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] text-slate-500">Venue</span>
                  <div className="mt-1">
                    <ZenitDropdown
                      ariaLabel="DEX venue"
                      value={selectedVenueId}
                      onChange={setSelectedVenueId}
                      options={venueDropdownOptions}
                      fullWidth
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="text-[10px] text-slate-500">Adapter id (optional)</span>
                  <input
                    value={customAdapterLabel}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      // Reject nếu user nhập địa chỉ 0x... thay vì label string
                      if (val && isAddress(val)) {
                        setSwapMsg("⚠️ Adapter id must be a label (e.g. saucerswap_v2), not a contract address (0x…). See Exchange.setAdapter docs.");
                        return;
                      }
                      setCustomAdapterLabel(e.target.value);
                      setSwapMsg(null);
                    }}
                    placeholder="e.g. saucerswap_v2 — do not paste 0x… contract"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#121318] px-2 py-2 font-mono text-[10px] text-slate-200"
                  />
                </label>
              </div>
              <p className="mt-1 font-mono text-[9px] text-slate-600">
                Adapter on-chain: {onchainAdapterBytes32.slice(0, 20)}…
                {quote?.swapExecution === "v2_clmm"
                  ? " · CLMM"
                  : quote?.swapExecution === "v1_amm"
                    ? " · V1 AMM"
                    : ""}
              </p>

              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="mt-3 text-[10px] text-slate-500 underline underline-offset-2 hover:text-[#acfadf]"
              >
                {showAdvanced ? "Hide" : "Advanced"}: RPC, token addresses, bps, split preview
              </button>
              {showAdvanced && (
                <div className="mt-2 space-y-3 rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
                  <label className="block">
                    <span className="text-[10px] text-slate-500">Token in address (0x…)</span>
                    <input
                      value={tokenInAddr}
                      onChange={(e) => setTokenInAddr(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-[#181818] px-2 py-2 font-mono text-[10px] text-white"
                      placeholder="Override env"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-slate-500">Token out address (0x…)</span>
                    <input
                      value={tokenOutAddr}
                      onChange={(e) => setTokenOutAddr(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-[#181818] px-2 py-2 font-mono text-[10px] text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-slate-500">Slippage (bps)</span>
                    <input
                      type="number"
                      min={1}
                      max={2000}
                      value={slippageBps}
                      onChange={(e) => setSlippageBps(Number(e.target.value) || DEFAULT_SLIPPAGE_BPS)}
                      className="mt-1 w-full rounded-lg border border-slate-600/50 bg-[#181818] px-2 py-2 font-mono text-sm text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-slate-500">Decimals in (fallback)</span>
                    <input
                      type="number"
                      min={0}
                      max={36}
                      value={decimalsIn}
                      onChange={(e) => setDecimalsIn(Number(e.target.value) || 18)}
                      className="mt-1 w-32 rounded-lg border border-slate-700 bg-[#181818] px-2 py-2 font-mono text-xs text-white"
                    />
                    {decimalsInData !== undefined && (
                      <span className="ml-2 font-mono text-[10px] text-emerald-500">on-chain: {String(decimalsInData)}</span>
                    )}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableSplitPlan}
                      onChange={(e) => setEnableSplitPlan(e.target.checked)}
                      className="rounded border-slate-500"
                    />
                    Preview split order (roadmap)
                  </label>
                  {enableSplitPlan && (
                    <div className="flex flex-wrap gap-4 text-[10px] text-slate-500">
                      <label>
                        Chunks
                        <input
                          type="number"
                          min={2}
                          max={48}
                          value={splitChunks}
                          onChange={(e) => setSplitChunks(Math.max(2, Number(e.target.value) || 2))}
                          className="ml-2 w-16 rounded border border-slate-600 bg-[#080a12] px-1 py-0.5 font-mono text-white"
                        />
                      </label>
                      <label>
                        Delay (s)
                        <input
                          type="number"
                          min={5}
                          max={3600}
                          value={splitDelaySec}
                          onChange={(e) => setSplitDelaySec(Math.max(5, Number(e.target.value) || 30))}
                          className="ml-2 w-16 rounded border border-slate-600 bg-[#080a12] px-1 py-0.5 font-mono text-white"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={primaryCta.disabled}
                onClick={() => {
                  if (primaryCta.action === "quote") void onGetQuote();
                  else if (primaryCta.action === "swap") void onSwap();
                }}
                className="zenit-swapv2-primary mt-5 w-full py-4 text-base"
              >
                {primaryCta.label}
              </button>

              {chainMismatch && (
                <div className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-left text-xs text-amber-100/95">
                  <span>
                    Wallet is on chain <strong className="text-white">{chainId}</strong>; this UI expects{" "}
                    <strong className="text-white">{expectedChainId}</strong>.
                  </span>
                  <button
                    type="button"
                    disabled={isSwitchChainPending}
                    onClick={() => switchChain({ chainId: expectedChainId })}
                    className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
                  >
                    {isSwitchChainPending ? "Switching network…" : `Switch wallet to chain ${expectedChainId}`}
                  </button>
                </div>
              )}

              {!exchangeContract && (
                <p className="mt-2 text-center text-[10px] text-slate-500">
                  Add <code className="text-slate-400">VITE_AGGREGATOR_EXCHANGE_CONTRACT</code> for on-chain swap.
                </p>
              )}
              {swapMsg && (
                <p className="mt-2 whitespace-pre-line rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-center text-[11px] leading-relaxed text-slate-300">
                  {swapMsg}
                </p>
              )}
              {swapTxHash && (
                <a
                  href={`https://hashscan.io/mainnet/transaction/${encodeURIComponent(swapTxHash)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block text-center text-xs font-medium text-[#62f9d6] underline underline-offset-2 hover:text-[#acfadf]"
                >
                  View transaction on HashScan ↗
                </a>
              )}

              {walletAddress && (
                <div className="mt-2 space-y-0.5 text-center font-mono text-[10px] text-slate-500">
                  <p>
                    EVM: {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
                    {wcSwapPath && (
                      <span className="ml-2 rounded bg-emerald-950/50 px-1.5 py-0.5 text-[9px] text-emerald-300/90">
                        HashPack WC
                      </span>
                    )}
                    {wagmiSwapPath && (
                      <span className="ml-2 rounded bg-slate-800/80 px-1.5 py-0.5 text-[9px] text-slate-400">wagmi</span>
                    )}
                  </p>
                  {hederaAccountId && wcSwapPath && (
                    <p className="text-slate-600">
                      Hedera: <span className="text-slate-400">{hederaAccountId}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Side: results + architecture */}
          <div className="space-y-4">
            {quoteError && (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{quoteError}</div>
            )}

            {onchainQuoteLoading && (
              <p className="text-[10px] text-slate-500" aria-live="polite">
                Fetching Exchange.quote (after router quote)…
              </p>
            )}

            {onchainSoftNote && (
              <div className="rounded-2xl border border-slate-500/30 bg-slate-900/35 px-4 py-3 text-xs leading-relaxed text-slate-300">
                <strong className="text-slate-200">On-chain:</strong> {onchainSoftNote}
              </div>
            )}
            {onchainError && (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-950/30 px-4 py-3 text-xs text-amber-100/90">
                <strong className="text-amber-200">On-chain:</strong> {onchainError}
              </div>
            )}

            {onchainFormatted != null && onchainRaw != null && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/25 px-4 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/90">
                  Expected out (Exchange.quote on-chain)
                </div>
                <div className="mt-1 font-mono text-lg tabular-nums text-emerald-100">
                  {decimalsOutKnown ? onchainFormatted : "…"}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  Raw wei: {onchainRaw.toString()} · decimals out: {decimalsOutKnown ? effectiveDecimalsOut : "…"}
                  {!decimalsOutKnown && " (waiting for token out decimals)"}
                </div>
              </div>
            )}

            {quote && (
              <div className="rounded-2xl border border-[#213b5f]/50 bg-[#1a1b23] p-5 shadow-[0_0_20px_rgba(98,222,249,0.12)]">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[#62f9d6]/90">
                  {quote.quoteSource === "router_v2"
                    ? quote.swapExecution === "v2_clmm"
                      ? "SaucerSwap V2 (CLMM) — Zenit execution"
                      : quote.saucerswapV2Reference
                        ? "SaucerSwap V2 (price) · V1 (Zenit execution)"
                        : "SaucerSwap — V1 only (no Quoter V2)"
                    : "Simulated route"}
                </h3>
                {quote.quoteSource === "router_v2" && quote.swapExecution === "v2_clmm" && (
                  <p className="mt-2 text-[10px] leading-relaxed text-cyan-200/80">
                    <strong>CLMM:</strong> hops below = concentrated pools; adapter{" "}
                    <code className="rounded bg-black/30 px-1">saucerswap_v2</code>.
                  </p>
                )}
                {quote.quoteSource === "router_v2" && quote.saucerswapV2Reference && quote.swapExecution !== "v2_clmm" && (
                  <p className="mt-2 text-[10px] leading-relaxed text-cyan-200/80">
                    <strong>CLMM (V2):</strong> spot like the app. <strong>V1:</strong> hops below = AMM pools for min receive /
                    swap adapter.
                  </p>
                )}
                <div className="mt-3 grid gap-2 text-sm">
                  {quote.saucerswapV2Reference && quote.swapExecution !== "v2_clmm" && (
                    <div className="flex justify-between gap-2 text-slate-400">
                      <span>Expected out (V2 Quoter)</span>
                      <span className="max-w-[55%] text-right font-mono tabular-nums text-cyan-200/95">
                        {quote.saucerswapV2Reference.expectedOutHuman}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-400">
                    <span>
                      {quote.swapExecution === "v2_clmm"
                        ? "Expected out (V2 · swap)"
                        : quote.saucerswapV2Reference
                          ? "Expected out (V1 · adapter)"
                          : "Expected out"}
                    </span>
                    <span className="tabular-nums text-[#acfadf]">{quote.expectedOutHuman}</span>
                  </div>
                  {quote.v1AmmFallback && quote.swapExecution === "v2_clmm" && (
                    <div className="flex justify-between gap-2 text-slate-400">
                      <span>V1 AMM comparison</span>
                      <span className="max-w-[55%] text-right font-mono tabular-nums text-slate-400">
                        {quote.v1AmmFallback.expectedOutHuman}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-400">
                    <span>Min out (current slippage)</span>
                    <span className="tabular-nums text-[#e8ffce]/90">{minReceiveHumanDisplay ?? quote.minOutHuman}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Price impact</span>
                    <span className="text-amber-200/90">
                      {quote.quoteSource === "router_v2" ? "— (see pool on-chain)" : `${quote.priceImpactPercent}% (mock)`}
                    </span>
                  </div>
                </div>
                <ol className="mt-4 space-y-2 border-t border-white/5 pt-4">
                  {quote.hops.map((h, idx) => {
                    const labels = quotePathDisplayLabels;
                    const addrs = quote.pathTokenAddresses;
                    const hopPair =
                      labels &&
                      addrs &&
                      labels.length === addrs.length &&
                      idx < labels.length - 1
                        ? `${labels[idx]} → ${labels[idx + 1]}`
                        : `${h.tokenIn} → ${h.tokenOut}`;
                    return (
                      <li key={h.step} className="rounded-lg bg-black/30 px-3 py-2 text-xs">
                        <span className="font-mono text-[#acfadf]">{hopPair}</span>
                        <span className="mt-1 block text-slate-500">
                          {h.venueLabel} · {h.rateHint}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* FAQ */}
        <section className="pb-8">
          <h2 className="text-center text-2xl font-extrabold text-white sm:text-3xl">FAQ</h2>
          <div className="mx-auto mt-8 max-w-3xl space-y-3">
            {FAQ_ITEMS.map((item, i) => {
              const open = openFaqIndex === i;
              return (
                <div
                  key={item.q}
                  className="rounded-lg border border-indigo-500/25 bg-[#12141c] px-5 py-4 shadow-[0_0_20px_rgba(79,70,229,0.12)]"
                >
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 text-left text-base font-medium text-white"
                    onClick={() => setOpenFaqIndex(open ? null : i)}
                  >
                    {item.q}
                    <span className={`shrink-0 transition ${open ? "rotate-90 text-indigo-400" : "text-slate-500"}`}>›</span>
                  </button>
                  {open && <p className="mt-3 text-sm font-light leading-relaxed text-[#c5c5c5]">{item.a}</p>}
                </div>
              );
            })}
          </div>
        </section>

        <div className="rounded-2xl border border-indigo-500/15 bg-[#0a0c14] p-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Venues (adapter stubs)</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            {AGGREGATOR_VENUES.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 last:border-0">
                <span>
                  {v.name}
                  {v.adapterIdHint != null && (
                    <span className="ml-2 font-mono text-[10px] text-slate-500">id: {v.adapterIdHint}</span>
                  )}
                </span>
                <span className={v.supported ? "text-emerald-400" : "text-slate-600"}>{v.supported ? "live" : "planned"}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
