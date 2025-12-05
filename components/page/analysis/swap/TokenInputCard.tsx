import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Input from "@/components/common/input";
import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import { useWalletStore } from "@/store/walletStore";
import { TokenData } from "@/types";
import {PopoverWrapper} from "@/components/common/popover";
import { MinswapBalanceItem } from "@/types/minswap";

interface TokenInputCardProps extends TokenData {
	onAmountChange: (value: string) => void;
	isLoading: boolean;
	onSelect?: (token: MinswapBalanceItem) => void;
}

const TokenInputCard: React.FC<TokenInputCardProps> = ({
	type,
	value,
	token,
	balance,
	iconUrl,
	onAmountChange,
	isLoading,
	onSelect,
}) => {
	const isSell = type === "sell";
	const listBalanceToken = useWalletStore((state) => state.balance);
	const [open, setOpen] = useState(false);
	const error = useMemo(() => {
		const balanceToken = listBalanceToken.find(
			(item) => item.asset.ticker.toUpperCase() === token?.toUpperCase()
		);

		const valueToken =
			balanceToken?.asset.ticker === "ADA"
				? Number(balanceToken.amount) / 1000000
				: Number(balanceToken?.amount);

		return Number(value) > Number(valueToken) || balanceToken === undefined;
	}, [value, token, listBalanceToken]);

	return (
		<div
			className={`px-5 py-4 rounded-xl bg-white/10 border hover:border-primary-600 border-dark-gray-600`}
		>
			<div className="flex justify-between items-center mb-4">
				<span className="text-sm font-semibold text-dark-gray-100 capitalize">
					{type}
				</span>
			</div>

			<div className="flex justify-between items-start">
				<div className="flex flex-col">
					<Input
						type="text"
						value={value}
						onChange={(e) =>
							isSell && onAmountChange(e.target.value)
						}
						className="text-2xl bg-transparent font-bold px-0 py-0 border-none text-white outline-none focus:outline-none w-full max-w-[200px]"
						placeholder="0"
						disabled={!isSell || isLoading}
					/>
				</div>
				{isSell ? (
					<PopoverWrapper
						open={open}
						onOpenChange={(r) => setOpen(r)}
						trigger={
							<div className="flex items-center space-x-2 p-1 bg-white/5 border-dark-gray-500 border rounded-full cursor-pointer">
								<Image
									src={iconUrl}
									alt={token}
									className="w-6 h-6 rounded-full"
									width={24}
									height={24}
									unoptimized
								/>
								<span className="text-white font-bold text-base">
									{token}
								</span>
								<ChevronDownMini size={20} />
							</div>
						}
					>
						<div className="flex flex-col gap-y-2">
							{listBalanceToken.map((item) => {
								return (
									<button
										key={item.asset.token_id}
										onClick={() =>
											onSelect && onSelect(item)
										}
										className="flex items-center justify-between gap-x-4 bg-dark-gray-900 py-2 px-4 rounded-md hover:bg-dark-gray-700"
									>
										<Image
											src={item.asset.logo}
											width={24}
											height={24}
											alt={item.asset.token_id}
											className="rounded-full"
										/>
										{item.asset.ticker}
									</button>
								);
							})}
						</div>
					</PopoverWrapper>
				) : (
					<div className="flex items-center space-x-2 p-1 bg-white/5 border-dark-gray-500 border rounded-full cursor-pointer">
						<Image
							src={iconUrl}
							alt={token}
							className="w-6 h-6 rounded-full"
							width={24}
							height={24}
							unoptimized
						/>
						<span className="text-white font-bold text-base">
							{token}
						</span>
						<ChevronDownMini size={20} />
					</div>
				)}
			</div>

			<div className="text-right text-gray-500 text-sm mt-2">
				{balance}
			</div>
		</div>
	);
};

export default TokenInputCard;