/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useTokenStore } from "@/store/tokenStore";
import {
	getSwapQuote,
	executeSwap,
	getExplorerUrl,
	CHAIN_DEFAULT_SWAP_TOKENS,
	type SwapToken,
	type SwapQuoteResult,
} from "@/services/chainSwapService";
import { formatNumber } from "@/lib/format";
import type { ChainId } from "@/lib/constant";
import { toast } from "sonner";

type SwapModalStep = "none" | "review" | "wallet" | "inprogress" | "success";
type SwapMiniStep = "none" | "submitting" | "submitted";

interface SwapState {
	inputAmount: string;
	quote: SwapQuoteResult | null;
	isQuoteLoading: boolean;
	error: string | null;
	isSubmitting: boolean;
}

const SLIPPAGE_BPS = 50; // 0.5%

export type { SwapToken, SwapQuoteResult };

export const useSwapLogic = () => {
	const { activeChain, chainConnections, chainBalances } = useWalletStore();
	const walletAddress = activeChain
		? chainConnections[activeChain]?.address
		: undefined;

	const { token, quoteToken } = useTokenStore();
	const handleSetEstimateDetail = useTokenStore(
		(s) => s.handleSetEstimateDetail
	);

	// ── Default tokens based on active chain ────────────────────────────────
	const chainDefaults = activeChain
		? CHAIN_DEFAULT_SWAP_TOKENS[activeChain as ChainId]
		: CHAIN_DEFAULT_SWAP_TOKENS.solana;

	const [tokenIn, setTokenIn] = useState<SwapToken>(chainDefaults.tokenIn);
	const [tokenOut, setTokenOut] = useState<SwapToken>(chainDefaults.tokenOut);

	// ── Sync defaults when active chain changes ─────────────────────────────
	useEffect(() => {
		if (!activeChain) return;
		const defaults = CHAIN_DEFAULT_SWAP_TOKENS[activeChain as ChainId];
		if (defaults) {
			setTokenIn(defaults.tokenIn);
			setTokenOut(defaults.tokenOut);
			setSwapState((prev) => ({
				...prev,
				inputAmount: "",
				quote: null,
				error: null,
			}));
		}
	}, [activeChain]);

	// ── Sync with global token store (when user picks from chart/analysis) ──
	useEffect(() => {
		if (!token || !quoteToken) return;
		setTokenIn((prev) =>
			prev.symbol === token.coin
				? prev
				: {
						id: token.symbol,
						symbol: token.coin,
						name: token.coin,
						logo: token.image,
						decimals: 6,
						price: token.price,
				  }
		);
		setTokenOut((prev) =>
			prev.symbol === quoteToken.coin
				? prev
				: {
						id: quoteToken.symbol,
						symbol: quoteToken.coin,
						name: quoteToken.coin,
						logo: quoteToken.image,
						decimals: 6,
						price: quoteToken.price,
				  }
		);
	}, [token, quoteToken]);

	// ── State ───────────────────────────────────────────────────────────────
	const [swapState, setSwapState] = useState<SwapState>({
		inputAmount: "",
		quote: null,
		isQuoteLoading: false,
		error: null,
		isSubmitting: false,
	});

	const [modalStep, setModalStep] = useState<SwapModalStep>("none");
	const [miniStep, setMiniStep] = useState<SwapMiniStep>("none");
	const [txHash, setTxHash] = useState<string | null>(null);
	const miniTimer = useRef<NodeJS.Timeout | null>(null);

	// ── Balances from store ─────────────────────────────────────────────────
	const balances = useMemo(
		() => (activeChain ? chainBalances[activeChain] ?? [] : []),
		[activeChain, chainBalances]
	);

	const getBalanceForToken = useCallback(
		(symbol: string): string => {
			const found = balances.find(
				(b) => b.symbol.toUpperCase() === symbol.toUpperCase()
			);
			return found?.balance ?? "0";
		},
		[balances]
	);

	const sellTokenBalance = getBalanceForToken(tokenIn.symbol);
	const buyTokenBalance = getBalanceForToken(tokenOut.symbol);

	// ── Quote fetching ──────────────────────────────────────────────────────
	const executeFetchQuote = useCallback(
		async (amount: string, inToken: SwapToken, outToken: SwapToken) => {
			if (
				!amount ||
				parseFloat(amount) <= 0 ||
				!activeChain ||
				!inToken ||
				!outToken
			)
				return;

			setSwapState((prev) => ({
				...prev,
				isQuoteLoading: true,
				error: null,
			}));

			try {
				// Convert human amount to smallest unit
				const rawAmount = Math.floor(
					parseFloat(amount) * Math.pow(10, inToken.decimals)
				).toString();

				const quoteResult = await getSwapQuote(
					activeChain as ChainId,
					inToken.id,
					outToken.id,
					rawAmount,
					SLIPPAGE_BPS
				);

				setSwapState((prev) => ({ ...prev, quote: quoteResult }));
				handleSetEstimateDetail(quoteResult);
			} catch (e: any) {
				setSwapState((prev) => ({
					...prev,
					error: e.message || "Failed to get swap quote.",
					quote: null,
				}));
				handleSetEstimateDetail(null);
			} finally {
				setSwapState((prev) => ({ ...prev, isQuoteLoading: false }));
			}
		},
		[activeChain, handleSetEstimateDetail]
	);

	// ── Debounced quote fetch ───────────────────────────────────────────────
	useEffect(() => {
		const amount = swapState.inputAmount;
		if (!amount || parseFloat(amount) <= 0) return;

		const handler = setTimeout(() => {
			executeFetchQuote(amount, tokenIn, tokenOut);
		}, 500);

		return () => clearTimeout(handler);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [swapState.inputAmount, tokenIn.id, tokenOut.id, executeFetchQuote]);

	// ── Swap direction toggle ───────────────────────────────────────────────
	const handleSwapDirection = useCallback(() => {
		const currentIn = tokenIn;
		const currentOut = tokenOut;
		setTokenIn(currentOut);
		setTokenOut(currentIn);
		setSwapState((prev) => ({
			...prev,
			inputAmount: "",
			quote: null,
		}));
	}, [tokenIn, tokenOut]);

	// ── Token change handlers ───────────────────────────────────────────────
	const handleChangeTokenIn = useCallback((t: SwapToken) => {
		setTokenIn(t);
		setSwapState((prev) => ({ ...prev, quote: null, inputAmount: "" }));
	}, []);

	const handleChangeTokenOut = useCallback((t: SwapToken) => {
		setTokenOut(t);
		setSwapState((prev) => ({ ...prev, quote: null, inputAmount: "" }));
	}, []);

	// ── Output amount ───────────────────────────────────────────────────────
	const amountOut = useMemo(() => {
		if (!swapState.quote) return 0;
		return (
			Number(swapState.quote.amountOut) /
			Math.pow(10, tokenOut.decimals)
		);
	}, [swapState.quote, tokenOut.decimals]);

	// ── Card data for UI ────────────────────────────────────────────────────
	const topCardData = useMemo(
		() => ({
			type: "Sell" as const,
			value: swapState.inputAmount,
			usdValue: `$${formatNumber(
				parseFloat(swapState.inputAmount || "0") * (tokenIn.price || 0),
				2
			)}`,
			token: tokenIn.symbol,
			balance: `${sellTokenBalance} ${tokenIn.symbol}`,
			iconUrl: tokenIn.logo,
		}),
		[swapState.inputAmount, tokenIn, sellTokenBalance]
	);

	const bottomCardData = useMemo(
		() => ({
			type: "Buy" as const,
			value: amountOut > 0 ? formatNumber(amountOut, 4) : "0",
			usdValue: `$${formatNumber(
				amountOut * (tokenOut.price || 0),
				2
			)}`,
			token: tokenOut.symbol,
			balance: `${buyTokenBalance} ${tokenOut.symbol}`,
			iconUrl: tokenOut.logo,
		}),
		[amountOut, tokenOut, buyTokenBalance]
	);

	// ── Mini timer ──────────────────────────────────────────────────────────
	const clearMiniTimer = () => {
		if (miniTimer.current) {
			clearTimeout(miniTimer.current);
			miniTimer.current = null;
		}
	};

	// ── Execute swap ────────────────────────────────────────────────────────
	const handleSwapFlow = useCallback(async () => {
		if (!activeChain || !walletAddress || !swapState.quote) {
			toast.error("Please connect your wallet to swap.");
			return;
		}

		setSwapState((prev) => ({ ...prev, isSubmitting: true }));
		setModalStep("wallet");

		try {
			setModalStep("inprogress");
			setMiniStep("submitting");

			const result = await executeSwap(
				activeChain as ChainId,
				swapState.quote.rawQuote,
				walletAddress
			);

			setTxHash(result.txHash);
			setModalStep("success");
			setMiniStep("submitted");

			// Auto-close mini toast after 8s
			clearMiniTimer();
			miniTimer.current = setTimeout(() => {
				setMiniStep("none");
			}, 8000);

			toast.success("Swap successful!");
		} catch (err: any) {
			setModalStep("none");
			setMiniStep("none");
			toast.error(err?.message || "Swap transaction failed");
		} finally {
			setSwapState((prev) => ({ ...prev, isSubmitting: false }));
		}
	}, [activeChain, walletAddress, swapState.quote]);

	// ── Modal controls ──────────────────────────────────────────────────────
	const openReviewModal = useCallback(() => {
		setModalStep("review");
	}, []);

	const closeModal = useCallback(() => {
		setModalStep("none");
		setMiniStep("none");
		clearMiniTimer();
	}, []);

	// ── Review data ─────────────────────────────────────────────────────────
	const reviewData = useMemo(() => {
		const q = swapState.quote;
		const fee = q?.fee || "—";

		return {
			sell: {
				amount: topCardData.value,
				token: topCardData.token,
				usd: topCardData.usdValue,
				iconUrl: topCardData.iconUrl,
			},
			buy: {
				amount: bottomCardData.value,
				token: bottomCardData.token,
				usd: bottomCardData.usdValue,
				iconUrl: bottomCardData.iconUrl,
			},
			fee,
			feeUsd: q?.feeUsd || "",
		};
	}, [topCardData, bottomCardData, swapState.quote]);

	// ── Explorer URL helper ─────────────────────────────────────────────────
	const handleViewExplorer = useCallback(
		(hash: string) => {
			const url = getExplorerUrl(activeChain ?? "solana", hash);
			window.open(url, "_blank", "noopener,noreferrer");
		},
		[activeChain]
	);

	return {
		topCardData,
		bottomCardData,
		swapState,
		handleSwapDirection,
		setInputAmount: (amount: string) =>
			setSwapState((prev) => ({ ...prev, inputAmount: amount })),
		tokenIn,
		tokenOut,
		handleChangeTokenIn,
		handleChangeTokenOut,
		modalStep,
		miniStep,
		reviewData,
		txHash,
		openReviewModal,
		closeModal,
		handleSwapFlow,
		handleViewExplorer,
		activeChain,
	};
};
