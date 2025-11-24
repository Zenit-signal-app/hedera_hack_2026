import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import Image from "next/image";
import Input from "@/components/common/input";
import SwapIcon from "@/components/icon/Icon_Swap";
import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import { TransactionDetails } from "./TransactionDetail";

type SwapDirection = "sell" | "buy";

interface TokenData {
	type: "Sell" | "Buy";
	value: string;
	usdValue: string;
	token: string;
	balance: string;
	iconUrl: string;
}

interface TokenInputCardProps extends TokenData {
	children?: React.ReactNode;
}

const TokenInputCard: React.FC<TokenInputCardProps> = ({
	type,
	value,
	usdValue,
	token,
	balance,
	iconUrl,
}) => {
	return (
		<div
			className={`px-5 py-4 rounded-xl bg-white/10 border border-dark-gray-600`}
		>
			<div className="flex justify-between items-center mb-4">
				<span className="text-lg font-semibold text-dark-gray-100">
					{type}
				</span>
			</div>

			<div className="flex justify-between items-start">
				<div className="flex flex-col">
					<Input
						type="text"
						value={value}
						onChange={(e) => {
							console.log(e.target.value);
						}}
						className="text-2xl bg-transparent font-bold px-0.  py-0 border-none text-white outline-none focus:outline-none w-full max-w-[200px]"
						placeholder="0"
					/>
					<span className="text-dark-gray-100 font-semibold text-sm mt-2">
						{usdValue}
					</span>
				</div>
				<div className="flex items-center space-x-2 p-1 bg-white/5 border-dark-gray-500 border rounded-full cursor-pointer">
					<Image
						src={iconUrl}
						alt={token}
						className="w-6 h-6 rounded-full"
						width={24}
						height={24}
					/>
					<span className="text-white font-bold text-base">
						{token}
					</span>
					<ChevronDownMini size={20} />
				</div>
			</div>

			<div className="text-right text-gray-500 text-sm mt-2">
				{balance}
			</div>
		</div>
	);
};

export const SwapInterface: React.FC = () => {
	const [direction, setDirection] = useState<SwapDirection>("sell");

	const tokenA: Omit<TokenData, "type"> = {
		value: "500",
		usdValue: "$500",
		token: "USDT",
		balance: "2,000 USDT",
		iconUrl: "/images/usdt.png",
	};

	const tokenB: Omit<TokenData, "type"> = {
		value: "126,093",
		usdValue: "$300.00",
		token: "SNEK",
		balance: "0 SNEK",
		iconUrl: "/images/snek.png",
	};

	const handleSwapDirection = () => {
		setDirection((prev) => (prev === "sell" ? "buy" : "sell"));
	};

	let topCardData: TokenData;
	let bottomCardData: TokenData;

	if (direction === "sell") {
		topCardData = { ...tokenA, type: "Sell" };
		bottomCardData = { ...tokenB, type: "Buy" };
	} else {
		topCardData = { ...tokenB, type: "Sell" };
		bottomCardData = { ...tokenA, type: "Buy" };
	}

	return (
		<div className="w-full relative mx-auto rounded-2xl shadow-2xl flex flex-col gap-y-5">
			<div className="flex flex-col space-y-2">
				<TokenInputCard {...topCardData} />

				<div className="relative z-10">
					<button
						onClick={handleSwapDirection}
						className="w-7 h-7 rounded-sm left-1/2 -top-3.5 absolute group-hover bg-primary-700 transition-colors text-white"
						aria-label="Swap tokens"
					>
						<SwapIcon
							className="mb-px ml-px hover:animate-spin"
							size={20}
						/>
					</button>
				</div>
				<TokenInputCard {...bottomCardData} />
			</div>
			<TransactionDetails />
			<button className="w-full mt-6 py-3 text-lg font-bold text-white bg-primary-700 rounded-lg hover:shadow-md duration-100 hover:shadow-primary-800 transition-colors">
				Swap
			</button>
		</div>
	);
};
