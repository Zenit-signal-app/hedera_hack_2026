/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import GuildeIcon from "@/components/icon/Icon_GuildeBook";
import PlayIcon from "@/components/icon/Icon_Play";
import { getListToken } from "@/services/analysisServices";
import { getDefaultToken, useTokenStore } from "@/store/tokenStore";
import { useWalletStore } from "@/store/walletStore";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { TokenSelector } from "./TokenSelector";
import { parseTokenPair } from "@/lib/ultils";
import { useMarketStore } from "@/store/marketStore";
import { useMarketSocket } from "@/hooks/useMarketSocket";
import { formatNumber } from "@/lib/format";
import dynamic from "next/dynamic";
import { useSwapLogic } from "@/hooks/useSwapLogic";
import { useIsMobile } from "@/src/components/hooks/useIsMobile";
import { TVChartContainer } from "@/components/common/tvChart";

interface TradingPairInfo {
	pair: string;
	baseAsset: string;
	currentPrice: number;
	priceChangeAmount: number;
	priceChangePercent: number;
	isPriceUp: boolean;
	low24h: number;
	volume24h: number;
	volumeUnit: string;
	avatarUrl: string;
}

// mockdata/Trading.ts
export const mockPairData: TradingPairInfo = {
	pair: "SNEK/ADA",
	baseAsset: "SNEK",
	currentPrice: 0.0024652,
	priceChangeAmount: -0.0001575,
	priceChangePercent: -6.01,
	isPriceUp: false, // Dựa vào giá trị âm
	low24h: 0.0027146,
	volume24h: 100.39,
	volumeUnit: "K", // Đã thu gọn
	avatarUrl: "/images/SNEK.png", // Đường dẫn ảnh mock
};

interface TradingPairInfo {
	pair: string;
	baseAsset: string;
	currentPrice: number;
	priceChangeAmount: number;
	priceChangePercent: number;
	isPriceUp: boolean;
	low24h: number;
	volume24h: number;
	volumeUnit: string;
	avatarUrl: string;
}

// Helper component cho các cột thông tin
interface StatColumnProps {
	label: string;
	value: string | number;
	valueClassName?: string;
}

const StatColumn: React.FC<StatColumnProps> = ({
	label,
	value,
	valueClassName = "text-white",
}) => (
	<div className="flex flex-col text-right lg:items-end items-start mr-6">
		<span className="text-dark-gray-200 text-xs">{label}</span>
		<span className={`text-xs font-medium ${valueClassName}`}>{value}</span>
	</div>
);

export const TradingPairInfoComponent: React.FC = () => {
	const data = mockPairData;
	const priceColorClass = data.isPriceUp ? "text-green-500" : "text-red-500";
	const { token, listToken, quoteToken, setDefaultsForChain } = useTokenStore();
	const isMobile = useIsMobile();
	const [apiTokenInfo, setApiTokenInfo] = useState<any>(null);
	const [isLoadingTokenInfo, setIsLoadingTokenInfo] = useState(false);

	const { activeChain } = useWalletStore();

	// Sync token defaults when activeChain doesn't match (e.g. after page refresh)
	useEffect(() => {
		if (activeChain && token.chain !== activeChain) {
			setDefaultsForChain(activeChain);
		}
	}, [activeChain, token.chain, setDefaultsForChain]);

	const pairSymbol = `${token.coin}_${quoteToken.coin}`;
	useMarketSocket(pairSymbol, "token_info");
	useMarketSocket(pairSymbol, "ohlc");

	const tokenInfoSocket = useMarketStore(
		(state) => state.prices.token_info?.[pairSymbol]
	);

	
	useEffect(() => {
		if (tokenInfoSocket) {
			setApiTokenInfo(null);
			return;
		}

		const fetchTokenInfo = async () => {
			try {
				setIsLoadingTokenInfo(true);
			const response = await getListToken({
					query: token.coin,
					limit: 1,
					offset: 0,
					...(activeChain ? { chain: activeChain } : {}),
				});
				if (response.tokens && response.tokens.length > 0) {
					setApiTokenInfo(response.tokens[0]);
				}
			} catch (error) {
				console.error("Failed to fetch token info from API:", error);
			} finally {
				setIsLoadingTokenInfo(false);
			}
		};

		fetchTokenInfo();
	}, [token.coin, tokenInfoSocket, activeChain]);

	const tokenInfo = useMemo(() => {
		const foundToken = listToken.find(
			(item) => item?.coin === token.coin
		);
		return foundToken ?? getDefaultToken(activeChain ?? "solana");
	}, [token.coin, listToken, activeChain]);

	const ohlcToken = useMarketStore(
		(state) => state.prices?.ohlc?.[pairSymbol]
	);

	const effectiveTokenInfo = apiTokenInfo;

	const priceChangeDisplay = `${
		effectiveTokenInfo?.priceChangePercent > 0 ? "+" : ""
	}${effectiveTokenInfo?.priceChange?.toFixed(
		5
	)} (${effectiveTokenInfo?.priceChangePercent?.toFixed(2)}%)`;

	return (
		<div>
			<div className="w-full lg:p-3 flex gap-x-4 gap-y-3 items-start text-white lg:flex-row flex-col  font-sans">
				<div className="flex lg:items-center items-start lg:flex-row flex-col gap-y-3 gap-x-4 w-full">
					<div className="flex items-center gap-x-2 flex-1">
						<Image
							src={tokenInfo?.image || "/images/snek.png"}
							alt={tokenInfo?.coin || "Token"}
							className="w-10 h-10 rounded-full"
							width={40}
							height={40}
							unoptimized
						/>

						<div className="flex items-start space-x-2 cursor-pointer">
							<div className="flex flex-col">
								<span className="text-white text-sm font-bold">
									{token.coin}/{quoteToken.coin}
								</span>
								<span className="text-dark-gray-200 text-xs">
									{tokenInfo?.coin}
								</span>
							</div>
							<TokenSelector />
						</div>
					</div>
					<div className="lg:flex lg:flex-row grid grid-cols-2 gap-2 lg:items-center items-start lg:gap-x-8 lg:w-auto w-full">
						<div className="flex flex-col items-start col-span-1">
							<span
								className={`text-sm font-bold ${priceColorClass}`}
							>
								{formatNumber(effectiveTokenInfo?.price || 0)}
							</span>
							<span className="text-dark-gray-200 text-xs font-medium">
								$
								{formatNumber(
									effectiveTokenInfo?.price_change_percentage_24h ||
										0
								)}
							</span>
						</div>
						<StatColumn
							label="24H Change"
							value={priceChangeDisplay}
							valueClassName={priceColorClass}
						/>
						<StatColumn
							label="24H Low"
							value={formatNumber(ohlcToken?.low)}
						/>
						<StatColumn
							label={`24H Vol(USD)`}
							value={formatNumber(ohlcToken?.volume)}
						/>
					</div>
				</div>

				<div className="flex items-center space-x-4 flex-0 justify-end">
					<div className="flex items-center space-x-1 cursor-pointer text-dark-gray-200 hover:text-white transition-colors">
						<PlayIcon className="w-5 h-5" />
						<span className="text-xs">Tutorial</span>
					</div>
					<div className="flex items-center space-x-1 cursor-pointer text-dark-gray-200 hover:text-white transition-colors">
						<GuildeIcon className="w-5 h-5" />
						<span className="text-xs">Guide</span>
					</div>
				</div>
			</div>
			{isMobile ? null : (
				<TVChartContainer
					symbol={`${token.coin}_${quoteToken.coin}`}
					className="w-full h-80 rounded-lg"
					interval="1D"
				/>
			)}
		</div>
	);
};
