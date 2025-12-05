/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useMarketStore } from "@/store/marketStore";
import { useWalletStore } from "@/store/walletStore";
import {
	fetchQuote,
	buildTransaction,
	fetchEstimate,
	finalizeAndSubmitTransaction,
	fetchMinswapTokenInfo,
} from "@/services/swapApi";
import { formatNumber } from "@/lib/format";
import { TokenData } from "@/types";
import { convertUtxosToHex, formatTokenAmount } from "@/lib/ultils";
import { MinswapBalanceItem } from "@/types/minswap";
import { Cardano } from "@cardano-sdk/core";
import { useTokenStore } from "@/store/tokenStore";

export interface SwapPathDetail {
	pool_id: string;
	protocol: string;
	lp_token: string;
	token_in: string;
	token_out: string;
	amount_in: string;
	amount_out: string;
	min_amount_out: string;
	lp_fee: string;
	dex_fee: string;
	deposits: string;
	price_impact: number;
}
export interface SwapQuote {
	token_in: string;
	token_out: string;
	amount_in: string;
	amount_out: string;
	min_amount_out: string; // ✨ Rất quan trọng cho Build-Tx Body
	total_lp_fee: string;
	total_dex_fee: string;
	deposits: string;
	avg_price_impact: number;
	paths: SwapPathDetail[][]; // Có thể có multi-hop
	aggregator_fee: string;
	aggregator_fee_percent: number;
	amount_in_decimal: boolean;
}
type SwapDirection = "sell" | "buy";

interface SwapState {
	inputAmount: string;
	quote: SwapQuote | null;
	isQuoteLoading: boolean;
	error: string | null;
	isSubmitting: boolean;
}

interface UseSwapLogicProps {
	initialTokenIn?: MinswapBalanceItem;
	initialTokenOut?: MinswapBalanceItem;
}
const FALLBACK_ADA: MinswapBalanceItem = {
	amount: "0",
	asset: {
		token_id: "lovelace",
		logo: "/images/ada.png",
		ticker: "ADA",
		is_verified: true,
		price_by_ada: 1,
		project_name: "Cardano",
		decimals: 6,
	},
};

const FALLBACK_USDM: MinswapBalanceItem = {
	amount: "0",
	asset: {
		decimals: 6,
		is_verified: true,
		logo: "https://asset-logos.minswap.org/c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d",
		price_by_ada: 2.2754404927623213,
		project_name: "USDM",
		ticker: "USDM",
		token_id:
			"c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d",
	},
};

const getBalanceByTicker = (
	ticker: string,
	allAssets: MinswapBalanceItem[]
): string => {
	const asset = allAssets.find((a) => a.asset.ticker === ticker);
	if (!asset) return "0";

	const amount = parseFloat(asset.amount);
	return formatTokenAmount(amount, asset.asset.decimals);
};

export const useSwapLogic = () => {
	const {
		activeWallet,
		usedAddress,
		balance: walletBalance,
	} = useWalletStore();
	const ohlcData = useMarketStore((state) => state.prices?.ohlc);
	const [direction, setDirection] = useState<SwapDirection>("sell");
	const { token, quoteToken } = useTokenStore((state) => state);
	const [swapState, setSwapState] = useState<SwapState>({
		inputAmount: "",
		quote: null,
		isQuoteLoading: false,
		error: null,
		isSubmitting: false,
	});
	const [tokenIn, setTokenIn] = useState<MinswapBalanceItem>(FALLBACK_ADA);
	const [tokenOut, setTokenOut] = useState<MinswapBalanceItem>(FALLBACK_USDM);
	const handleSetEstimateDetail = useTokenStore(
		(state) => state.handleSetEstimateDetail
	);

	const sellToken = direction === "sell" ? tokenIn : tokenOut;
	const buyToken = direction === "sell" ? tokenOut : tokenIn;

	const getSocketKey = (t1: MinswapBalanceItem, t2: MinswapBalanceItem) => {
		const inId = t1.asset?.ticker === "ADA" ? "lovelace" : t1.asset?.ticker;
		const outId =
			t2.asset?.ticker === "ADA" ? "lovelace" : t2.asset?.ticker;
		return `${inId}/${outId}`;
	};
	const executeFetchQuote = useCallback(
		async (
			amount: string,
			inToken: MinswapBalanceItem,
			outToken: MinswapBalanceItem
		) => {
			if (!amount || parseFloat(amount) <= 0 || !inToken || !outToken)
				return;

			setSwapState((prev) => ({
				...prev,
				isQuoteLoading: true,
				error: null,
			}));

			try {
				const estimateResult = await fetchEstimate({
					amount: amount,
					token_in:
						inToken.asset.ticker === "ADA"
							? "lovelace"
							: inToken.asset.token_id,
					token_out:
						outToken.asset.ticker === "ADA"
							? "lovelace"
							: outToken.asset.token_id,
					slippage: SLIPPAGE_RATE,
				});
				setSwapState((prev) => ({ ...prev, quote: estimateResult }));
				handleSetEstimateDetail(estimateResult);
			} catch (e: any) {
				setSwapState((prev) => ({
					...prev,
					error: e.message || "Không thể lấy tỷ giá swap.",
					quote: null,
				}));
			} finally {
				setSwapState((prev) => ({ ...prev, isQuoteLoading: false }));
			}
		},
		[]
	);
	const marketPriceKey = getSocketKey(sellToken, buyToken);
	const currentSocketPrice = ohlcData?.[marketPriceKey]?.price || 1;
	const sellTokenActualBalance = getBalanceByTicker(
		sellToken.asset.ticker,
		walletBalance
	);
	const calculateUsdValue = (amount: number, price: number) => {
		return formatNumber(amount * price, 2);
	};

	useEffect(() => {
		const handleGetTokenInfo = async () => {
			try {
				const res = await fetchMinswapTokenInfo({
					query:
						direction === "sell" ? quoteToken.symbol : token.symbol,
					only_verified: true,
					assets: [direction === "sell" ? quoteToken.id : token.id],
				});

				if (res) {
					const amount = walletBalance.find(
						(item) => item.asset.token_id === res?.tokens[0]?.token_id
					)?.amount;
					const tokenInfo = {
						amount: amount
							? formatTokenAmount(amount, res.tokens[0].decimals || 6)
							: "0",
						asset: res.tokens[0],
					};

					setTokenOut(tokenInfo);
				}
			} catch (err: any) {
				throw new Error(err);
			}
		};
		handleGetTokenInfo();
	}, [token, walletBalance]);

	const handleChangeTokenIn = useCallback((token: MinswapBalanceItem) => {
		setTokenIn(token);
		setSwapState((prev) => ({ ...prev, quote: null, inputAmount: "0" }));
	}, []);

	const handleChangeTokenOut = useCallback((token: MinswapBalanceItem) => {
		setTokenOut(token);
		setSwapState((prev) => ({ ...prev, quote: null, inputAmount: "0" }));
	}, []);
	const handleSwapDirection = useCallback(() => {
		const currentIn = tokenIn;
		const currentOut = tokenOut;

		setTokenIn(currentOut);
		setTokenOut(currentIn);

		setSwapState((prev) => ({
			...prev,
			inputAmount: "0",
			quote: null,
		}));
	}, [tokenIn, tokenOut, buyToken, walletBalance]);

	const SLIPPAGE_RATE = 0.005;

	const signAndSubmitSwap = useCallback(async () => {
		const currentQuote = swapState.quote;
		if (
			!activeWallet ||
			!usedAddress ||
			!currentQuote ||
			!tokenIn ||
			!tokenOut
		) {
			setSwapState((prev) => ({
				...prev,
				error: "Ví chưa sẵn sàng hoặc thiếu quote.",
			}));
			return;
		}
		try {
			const utxos: Cardano.Utxo[] = await activeWallet.getUtxos();
			const inputsToChoose = utxos ? utxos : [];

			const buildData = await buildTransaction({
				sender: usedAddress,
				estimate: {
					...currentQuote,
					amount: Number(swapState.inputAmount),
					slippage: 0.005,
				},
				inputsToChoose,
			});
			const unsignedTxCbor = buildData.cbor;
			const txWitnessSetHex = await activeWallet.signTx(unsignedTxCbor);
			const submitData = await finalizeAndSubmitTransaction(
				unsignedTxCbor,
				txWitnessSetHex
			);
			console.log(submitData);

			return submitData;
		} catch (error: any) {}
	}, [
		activeWallet,
		usedAddress,
		swapState.quote,
		swapState.inputAmount,
		sellToken.asset?.ticker,
		buyToken.asset?.ticker,
	]);

	const amountOut = Number(swapState.quote?.amount_out) || 0;

	const topCardData = useMemo(
		() => ({
			type: "Sell",
			value: swapState.inputAmount,
			usdValue: `$${calculateUsdValue(
				parseFloat(swapState.inputAmount || "0"),
				sellToken.asset.price_by_ada
			)}`,
			token: sellToken.asset?.ticker,
			balance: `${formatNumber(sellTokenActualBalance)} ${
				sellToken.asset.ticker
			}`,
			iconUrl: sellToken.asset.logo,
		}),
		[swapState.inputAmount, sellToken, sellTokenActualBalance]
	);
	const bottomCardData = useMemo(
		() => ({
			type: "Buy",
			value: amountOut > 0 ? formatNumber(amountOut, 4) : "0",
			usdValue: `$${calculateUsdValue(
				amountOut,
				buyToken.asset?.price_by_ada
			)}`,
			token: buyToken.asset?.ticker,
			balance: `${buyToken.amount} ${
				buyToken.asset?.ticker
			}`,
			iconUrl: buyToken.asset?.logo,
		}),
		[amountOut, buyToken]
	);

	useEffect(() => {
		const amount = swapState.inputAmount;
		if (!amount || parseFloat(amount) <= 0) return;

		const handler = setTimeout(() => {
			executeFetchQuote(amount, sellToken, buyToken);
		}, 500);

		return () => clearTimeout(handler);
	}, [
		swapState.inputAmount,
		sellToken.asset?.token_id,
		buyToken.asset?.token_id,
	]);

	return {
		topCardData,
		bottomCardData,
		swapState,
		handleSwapDirection,
		setInputAmount: (amount: string) =>
			setSwapState((prev) => ({ ...prev, inputAmount: amount })),
		signAndSubmitSwap,
		currentSocketPrice,
		tokenIn: sellToken,
		tokenOut: buyToken,
		handleChangeTokenIn,
		handleChangeTokenOut,
	};
};
