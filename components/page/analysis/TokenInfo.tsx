"use client";
import GuildeIcon from "@/components/icon/Icon_GuildeBook";
import PlayIcon from "@/components/icon/Icon_Play";
import { getListToken } from "@/services/analysisServices";
import { useTokenStore } from "@/store/tokenStore";
import Image from "next/image";
import { useEffect, useMemo } from "react";
import { TokenSelector } from "./TokenSelector";
import { parseTokenPair } from "@/lib/ultils";
import { useMarketStore } from "@/store/marketStore";
import { useMarketSocket } from "@/hooks/useMarketSocket";
import { formatNumber } from "@/lib/format";
import dynamic from "next/dynamic";
const AdvancedRealTimeChart = dynamic(
	() =>
		import("react-ts-tradingview-widgets").then(
			(w) => w.AdvancedRealTimeChart
		),
	{
		ssr: false,
	}
);
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
	<div className="flex flex-col text-right items-end mr-6">
		<span className="text-dark-gray-200 text-xs">{label}</span>
		<span className={`text-xs font-medium ${valueClassName}`}>{value}</span>
	</div>
);

export const TradingPairInfoComponent: React.FC = () => {
	const data = mockPairData;
	const priceColorClass = data.isPriceUp ? "text-green-500" : "text-red-500";

	const { token, listToken } = useTokenStore();
	useMarketSocket(token, "token_info");
	useMarketSocket(token, "ohlc");
	const { baseToken, quoteToken } = parseTokenPair(token);
	const tokenInfo = useMemo(() => {
		const foundToken = listToken.find((item) => item?.symbol === baseToken);
		return foundToken ?? listToken?.[0];
	}, [baseToken, listToken]);
	const ohlcToken = useMarketStore((state) => state.prices?.ohlc?.[token]);
	const tokenInfoSocket = useMarketStore(
		(state) => state.prices.token_info?.[baseToken]
	);
	const priceChangeDisplay = `${
		tokenInfoSocket?.change_24h > 0 ? "+" : ""
	}${tokenInfoSocket?.change_24h?.toFixed(
		5
	)} (${tokenInfoSocket?.change_24h?.toFixed(2)}%)`;

	return (
		<div>
			<div className="w-full p-3 flex gap-x-4 items-start text-white font-sans">
				<div className="flex items-center gap-x-4 flex-1">
					<Image
						src={tokenInfo?.logo_url || "/images/snek.png"}
						alt={tokenInfo?.name || "Snek"}
						className="w-10 h-10 rounded-full"
						width={40}
						height={40}
					/>

					<div className="flex items-start space-x-2 cursor-pointer">
						<div className="flex flex-col">
							<span className="text-white text-sm font-bold">
								{baseToken}/{quoteToken}
							</span>
							<span className="text-dark-gray-200 text-xs">
								{tokenInfo?.name}
							</span>
						</div>
						<TokenSelector />
					</div>
					<div className="flex items-center space-x-8">
						<div className="flex flex-col items-start">
							<span
								className={`text-sm font-bold ${priceColorClass}`}
							>
								{formatNumber(tokenInfoSocket?.price || 0)}
							</span>
							<span className="text-dark-gray-200 text-xs font-medium">
								$
								{formatNumber(
									tokenInfoSocket?.price_change_percentage_24h ||
										0
								)}
							</span>
						</div>
						<div className="flex space-x-4">
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
								label={`24H Vol(USDT)`}
								value={formatNumber(ohlcToken?.volume)}
							/>
						</div>
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
			<AdvancedRealTimeChart
				theme="dark"
				height={470}
				width={"100%"}
				symbol="BITGET:SNEKUSDT"
			></AdvancedRealTimeChart>
		</div>
	);
};
