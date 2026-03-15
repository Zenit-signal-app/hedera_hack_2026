import React, { useMemo, useState } from "react";
import Image from "next/image";
import Input, { NumberInput } from "@/components/common/input";
import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import { useWalletStore } from "@/store/walletStore";
import { TokenData } from "@/types";
import { PopoverWrapper } from "@/components/common/popover";
import { useTokenLoadMore } from "@/hooks/useTokenLoadMore";
import InfiniteScroll from "react-infinite-scroll-component";
import { Loader2 } from "lucide-react";
import { TokenPriceData } from "@/types/token";
import { cn } from "@/lib/utils";
import type { SwapToken } from "@/hooks/useSwapLogic";

interface TokenInputCardProps extends TokenData {
	onAmountChange: (value: string) => void;
	isLoading: boolean;
	onSelect?: (token: SwapToken) => void;
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
	const { activeChain, chainBalances } = useWalletStore();
	const balances = activeChain ? chainBalances[activeChain] ?? [] : [];
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const {
		tokens,
		isLoading: isLoadingTokens,
		canLoadMore,
		loadMore,
	} = useTokenLoadMore(searchQuery, activeChain);

	const error = useMemo(() => {
		const balanceEntry = balances.find(
			(b) => b.symbol.toUpperCase() === token?.toUpperCase()
		);
		const available = parseFloat(balanceEntry?.balance ?? "0");
		return parseFloat(value || "0") > available || !balanceEntry;
	}, [value, token, balances]);

	const balanceForToken = (sym: string) => {
		const entry = balances.find(
			(b) => b.symbol.toUpperCase() === sym.toUpperCase()
		);
		return entry?.balance ?? "0";
	};

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
						inputClassName={cn("text-2xl font-bold text-white placeholder--dark-gray-100", error && isSell && "text-red-500")}
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
								placeholder="Search token..."
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
										Loading...
									</div>
								}
								scrollableTarget={"token-input-scroll"}
								className="gap-y-2"
							>
								{tokens.map((t: TokenPriceData) => {
									const balanceLabel = balanceForToken(t.coin);

									return (
										<button
											key={t.symbol}
											onClick={() => {
												const swapToken: SwapToken = {
													id: t.symbol,
													symbol: t.coin,
													name: t.coin,
													logo: t.image,
													decimals: 6,
													price: t.price,
												};
												onSelect?.(swapToken);
												setOpen(false);
											}}
											className="w-full flex items-center justify-between gap-x-4 bg-dark-gray-900 py-2 px-4 my-1 rounded-md hover:bg-dark-gray-700"
										>
											<div className="flex items-center gap-x-2">
												<Image
													src={t.image}
													width={24}
													height={24}
													alt={t.coin}
													className="rounded-full"
													unoptimized
												/>
												<div className="text-left">
													<div className="text-sm font-medium">
														{t.coin}
													</div>
													<div className="text-xs text-gray-400">
														{t.symbol}
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
