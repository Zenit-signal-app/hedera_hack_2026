import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Input, { NumberInput } from "@/components/common/input";
import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import { useWalletStore } from "@/store/walletStore";
import { TokenData } from "@/types";
import { PopoverWrapper } from "@/components/common/popover";
import { MinswapBalanceItem } from "@/types/minswap";
import { useTokenLoadMore } from "@/hooks/useTokenLoadMore";
import InfiniteScroll from "react-infinite-scroll-component";
import { Loader2 } from "lucide-react";
import { TokenPriceData } from "@/types/token";
import { formatTokenAmount } from "@/lib/ultils";
import { cn } from "@/lib/utils";

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
	onSelect,
}) => {
	const isSell = type === "sell";
	const listBalanceToken = useWalletStore((state) => state.balance);
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const {
		tokens,
		isLoading: isLoadingTokens,
		canLoadMore,
		loadMore,
	} = useTokenLoadMore(searchQuery);
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
					<NumberInput
						value={value}
						onChange={(e) =>
							isSell && onAmountChange(e.target.value)
						}
						className="text-2xl bg-transparent font-bold px-0 py-0 border-none text-white outline-none focus:outline-none w-full max-w-[200px]"
						placeholder="0"
						disabled={!isSell || isLoadingTokens}
						inputClassName={cn("text-2xl font-bold text-white placeholder--dark-gray-100", error && "text-red-500")}

					/>
				</div>
				<PopoverWrapper
					open={open}
					onOpenChange={(r) => setOpen(r)}
					trigger={
						<div className="flex items-center space-x-2 p-1 bg-white/5 border-dark-gray-500 border rounded-full cursor-pointer">
							<Image
								src={iconUrl}
								alt={token || "Token"}
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
					<div className="w-64">
						<div className="p-2">
							<Input
								placeholder="Tìm token..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="bg-dark-gray-800 text-sm"
							/>
						</div>

						<div
							id="token-input-scroll"
							className="max-h-64 overflow-y-auto"
						>
							<InfiniteScroll
								dataLength={tokens.length}
								next={() => loadMore()}
								hasMore={canLoadMore}
								loader={
									<div className="p-2 flex justify-center items-center text-gray-500">
										<Loader2 className="w-4 h-4 animate-spin mr-2" />{" "}
										Đang tải...
									</div>
								}
								scrollableTarget={"token-input-scroll"}
								className="gap-y-2"
							>
								{tokens.map((t: TokenPriceData) => {
									const found = listBalanceToken.find(
										(b) => b.asset.token_id === t.id
									);
									const balanceLabel = found
										? formatTokenAmount(
												parseFloat(found.amount),
												found.asset.decimals
										  )
										: "0";

									return (
										<button
											key={t.id}
											onClick={() => {
												const item: MinswapBalanceItem =
													{
														amount: found
															? found.amount
															: "0",
														asset: {
															token_id: t.id,
															logo: t.logo_url,
															ticker: t.symbol,
															decimals: 6,
															is_verified: true,
															price_by_ada:
																t.price,
															project_name:
																t.name,
														},
													};

												onSelect && onSelect(item);
												setOpen(false);
											}}
											className="w-full flex items-center justify-between gap-x-4 bg-dark-gray-900 py-2 px-4 my-1 rounded-md hover:bg-dark-gray-700"
										>
											<div className="flex items-center gap-x-2">
												<Image
													src={t.logo_url}
													width={24}
													height={24}
													alt={t.name}
													className="rounded-full"
													unoptimized
												/>
												<div className="text-left">
													<div className="text-sm font-medium">
														{t.symbol}
													</div>
													<div className="text-xs text-gray-400">
														{t.name}
													</div>
												</div>
											</div>
											<div className="text-xs text-gray-300">
												{balanceLabel}
											</div>
										</button>
									);
								})}
							</InfiniteScroll>
						</div>
					</div>
				</PopoverWrapper>
			</div>

			<div className="text-right text-gray-500 text-sm mt-2">
				{balance}
			</div>
		</div>
	);
};

export default TokenInputCard;
