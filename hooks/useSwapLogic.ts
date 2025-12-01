/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState, useCallback, useEffect, useMemo } from "react";
import { useMarketStore } from "@/store/marketStore";
import { useWalletStore } from "@/store/walletStore";
import {
	fetchQuote,
    buildTransaction,
    fetchEstimate,
} from "@/services/swapApi";
import { formatNumber } from "@/lib/format";
import { TokenData } from "@/types";
import { convertUtxosToHex } from "@/lib/ultils";
import { MinswapBalanceItem } from "@/types/minswap";
import { Cardano } from "@cardano-sdk/core";

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
    amount: '0',
    asset: {
        token_id: 'lovelace',
        logo: '/images/ada.png', 
        ticker: 'ADA',
        is_verified: true,
        price_by_ada: 1,
        project_name: 'Cardano',
        decimals: 6,
    }
};

export const useSwapLogic = ({ initialTokenIn, initialTokenOut }: UseSwapLogicProps) => {
    const { activeWallet, usedAddress, balance: walletBalance } = useWalletStore(); 
    const ohlcData = useMarketStore((state) => state.prices?.ohlc);

    const [direction, setDirection] = useState<SwapDirection>('sell');
    const [swapState, setSwapState] = useState<SwapState>({
        inputAmount: '500',
        quote: null,
        isQuoteLoading: false,
        error: null,
        isSubmitting: false,
    });
    const [tokenIn, setTokenIn] = useState<MinswapBalanceItem>(initialTokenIn || FALLBACK_ADA); 
    const [tokenOut, setTokenOut] = useState<MinswapBalanceItem>(initialTokenOut || FALLBACK_ADA); 

    const sellToken = direction === 'sell' ? tokenIn : tokenOut;
    const buyToken = direction === 'sell' ? tokenOut : tokenIn;
    
    // Dữ liệu từ Socket
    const marketPriceKey = `${sellToken.asset.ticker}/${buyToken?.asset?.ticker}`;
    const currentSocketPrice = ohlcData?.[marketPriceKey]?.price || 1;

    const calculateUsdValue = (amount: number, price: number) => {
        return formatNumber(amount * price, 2);
    };

    const handleChangeTokenIn = useCallback((token: MinswapBalanceItem) => {
        setTokenIn(token);
        setSwapState(prev => ({ ...prev, quote: null, inputAmount: '0' }));
    }, []);

    const handleChangeTokenOut = useCallback((token: MinswapBalanceItem) => {
        setTokenOut(token);
        setSwapState(prev => ({ ...prev, quote: null, inputAmount: '0' }));
    }, []);


    // --- HÀM FETCH QUOTE ---
    const fetchQuoteData = useCallback(async () => {
        const amount = parseFloat(swapState.inputAmount);
        // Kiểm tra nếu chưa chọn token hoặc amount <= 0
        if (isNaN(amount) || amount <= 0 || swapState.isQuoteLoading || !tokenIn || !tokenOut) return;

        setSwapState((prev) => ({
            ...prev,
            isQuoteLoading: true,
            error: null,
        }));

        try {
            const estimateResult = await fetchEstimate({
        amount: swapState.inputAmount,
        token_in: sellToken.asset.ticker === "ADA" ? "lovelace": sellToken.asset.token_id,
        token_out: buyToken.asset.ticker === "ADA" ? "lovelace" : buyToken.asset.token_id,
        slippage: SLIPPAGE_RATE,
      });
            setSwapState((prev) => ({ ...prev, quote: estimateResult }));
        } catch (e: any) {
            setSwapState((prev) => ({
                ...prev,
                error: e.message || "Không thể lấy tỷ giá swap.",
                quote: null,
            }));
        } finally {
            setSwapState((prev) => ({ ...prev, isQuoteLoading: false }));
        }
    }, [
        swapState.inputAmount,
        tokenIn, // Dependency quan trọng
        tokenOut, // Dependency quan trọng
    ]);


    // --- EFFECT & HANDLER SWAP DIRECTION ---
    useEffect(() => {
        const handler = setTimeout(() => { fetchQuoteData(); }, 500);
        return () => clearTimeout(handler);
    }, [swapState.inputAmount, tokenIn, tokenOut, direction, fetchQuoteData]); // Thêm tokenIn/Out

    const handleSwapDirection = useCallback(() => {
        // ✨ Hoán đổi giá trị của state tokenIn và tokenOut
        setTokenIn(tokenOut);
        setTokenOut(tokenIn);
        
        // Đảo chiều (chỉ đảo trạng thái UI, token đã được hoán đổi ở trên)
        setDirection((prev) => (prev === "sell" ? "buy" : "sell")); 
        
        // Reset state
        setSwapState((prev) => ({
            ...prev,
            inputAmount: "0",
            quote: null,
        }));
    }, [tokenIn, tokenOut]);

    const SLIPPAGE_RATE = 0.005; // 0.5%
    
    const signAndSubmitSwap = useCallback(async () => {
        const currentQuote = swapState.quote;
        const amountIn = swapState.inputAmount;

        if (!activeWallet || !usedAddress || !currentQuote || !tokenIn || !tokenOut) {
            setSwapState((prev) => ({ ...prev, error: "Ví chưa sẵn sàng hoặc thiếu quote.", }));
            return;
        }

        const amountOut = parseFloat(`${currentQuote.amount_out}`);
        const minAmountOut = (amountOut * (1 - SLIPPAGE_RATE)).toString();
        
        try {

           const utxos: Cardano.Utxo[] = await activeWallet.getUtxos(); 
            const inputsToChoose: string[] = utxos.map((u) => convertUtxosToHex(u)); 

            const buildData = await buildTransaction({
                sender: usedAddress, 
                estimate: currentQuote,
                inputsToChoose,
            });
            const unsignedTxCbor = buildData.cbor;
            return unsignedTxCbor
        } catch (error: any) {
        }
    }, [activeWallet, usedAddress, swapState.quote, swapState.inputAmount, sellToken.asset.ticker, buyToken.asset.ticker]);

    const amountOut = Number(swapState.quote?.amount_out) || 0;

    const topCardData = useMemo(() => ({
        type: "Sell",
        value: swapState.inputAmount,
        usdValue: `$${calculateUsdValue(parseFloat(swapState.inputAmount || "0"), sellToken.asset.price_by_ada)}`,
        token: sellToken.asset.ticker,
        balance: sellToken.asset.ticker === "ADA" ? `${formatNumber((Number(sellToken.amount)/1000000))} ${sellToken.asset.ticker}` : `${formatNumber(parseFloat(sellToken.amount))} ${sellToken.asset.ticker}`,
        iconUrl: sellToken.asset.logo,
    }), [swapState.inputAmount, sellToken]);

    const bottomCardData = useMemo(() => ({
        type: "Buy",
        value: amountOut > 0 ? formatNumber(amountOut, 4) : "0",
        usdValue: `$${calculateUsdValue(amountOut, buyToken.asset.price_by_ada)}`,
        token: buyToken.asset.ticker,
        balance: `${formatNumber(parseFloat(buyToken.amount))} ${buyToken.asset.ticker}`,
        iconUrl: buyToken.asset.logo,
    }), [amountOut, buyToken]);


    useEffect(() => {
    const handler = setTimeout(() => {
      fetchQuoteData();
    }, 500); 
    return () => clearTimeout(handler);
}, [swapState.inputAmount, direction, fetchQuoteData]);

    return {
        topCardData,
        bottomCardData,
        swapState,
        handleSwapDirection,
        setInputAmount: (amount: string) => setSwapState((prev) => ({ ...prev, inputAmount: amount })),
        signAndSubmitSwap,
        currentSocketPrice,
        tokenIn: sellToken,
        tokenOut: buyToken,
        handleChangeTokenIn,
        handleChangeTokenOut,
    };
};
