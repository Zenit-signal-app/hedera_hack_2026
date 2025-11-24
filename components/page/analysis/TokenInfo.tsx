"use client";

import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import GuildeIcon from "@/components/icon/Icon_GuildeBook";
import PlayIcon from "@/components/icon/Icon_Play";
import { ChevronDownIcon } from "lucide-react";
import Image from "next/image";

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
	const priceChangeDisplay = `${
		data.priceChangeAmount > 0 ? "+" : ""
	}${data.priceChangeAmount.toFixed(5)} (${data.priceChangePercent.toFixed(
		2
	)}%)`;

	const formattedPrice = data.currentPrice.toFixed(6);

	return (
		<div className="w-full p-3 flex gap-x-4 items-start text-white font-sans">
			<div className="flex items-center gap-x-4 flex-1">
				<Image
					src={data.avatarUrl}
					alt={data.baseAsset}
					className="w-10 h-10 rounded-full"
					width={40}
					height={40}
				/>

				<div className="flex items-start space-x-2 cursor-pointer">
					<div className="flex flex-col">
						<span className="text-white text-sm font-bold">
							{data.pair}
						</span>
						<span className="text-dark-gray-200 text-xs">
							{data.baseAsset}
						</span>
					</div>
					<ChevronDownMini
						className="w-6 h-6 text-white bg-dark-gray-900 rounded-sm"
						size={24}
					/>
				</div>
				<div className="flex items-center space-x-8">
					<div className="flex flex-col items-start">
						<span
							className={`text-sm font-bold ${priceColorClass}`}
						>
							{formattedPrice}
						</span>
						<span className="text-dark-gray-200 text-xs font-medium">
							${formattedPrice}
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
							value={data.low24h.toFixed(6)}
						/>
						<StatColumn
							label={`24H Vol(USDT)`}
							value={`${data.volume24h.toFixed(2)}${
								data.volumeUnit
							}`}
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
	);
};
