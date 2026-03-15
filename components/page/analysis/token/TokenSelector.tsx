/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable react-hooks/preserve-manual-memoization */
import React, { useCallback, useState } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import { useTokenLoadMore } from "@/hooks/useTokenLoadMore";
import { Loader2 } from "lucide-react";
import { PopoverWrapper } from "@/components/common/popover";
import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import Image from "next/image";
import Input from "@/components/common/input";
import { useWalletStore } from "@/store/walletStore";
import SearchIcon from "@/components/icon/Icon_ Search";
import TabsWrapper from "@/components/common/tabs";
import { getDefaultToken, getDefaultQuoteToken, useTokenStore } from "@/store/tokenStore";
import { TokenPriceData } from "@/types/token";

const SCROLL_CONTAINER_ID = "token-list-scroll-container";

export const TokenSelector: React.FC = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const { activeChain } = useWalletStore();
	const { tokens, isLoading } = useTokenLoadMore(searchQuery, activeChain);
	const {
		handleSelectToken,
		handleSelectQuoteToken,
	} = useTokenStore();
	const [tab, setTabs] = useState("USDC");
	const handleToken = useCallback(
		(token: TokenPriceData) => {
			setIsOpen(false);
			handleSelectToken(token);
			tab === "USDC"
				? handleSelectQuoteToken(getDefaultQuoteToken(activeChain ?? "solana"))
				: handleSelectQuoteToken(getDefaultToken(activeChain ?? "solana"));
		},
		[tab, activeChain, handleSelectToken, handleSelectQuoteToken]
	);
	return (
		<PopoverWrapper
			trigger={
				<ChevronDownMini className="bg-dark-gray-700 rounded-sm flex flex-col items-center justify-center" />
			}
			open={isOpen}
			onOpenChange={setIsOpen}
		>
			<div className="flex items-center">
				<Input
					startIcon={<SearchIcon className="w-4 h-4" />}
					placeholder="Search..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className=" text-dark-gray-400 text-sm bg-transparent outline-none py-1"
				/>
			</div>

			{/* <TabsWrapper
				tabs={[
					{ value: "USDM", label: "USDM" },
					{ value: "ADA", label: "ADA" },
				]}
				defaultValue={"USDM"}
				value={tab}
				variant="underline"
				className="text-sm py-1 px-0"
				onValueChange={(tab) => setTabs(tab as "USDM" | "ADA")}
			/> */}

			<div id={SCROLL_CONTAINER_ID} className="max-h-60 lg:mt-4 overflow-y-auto">
				<InfiniteScroll
					dataLength={tokens.length}
					next={() => {}}
					hasMore={false}
					loader={
						<div className="p-2 flex justify-center items-center text-gray-500">
							<Loader2 className="w-4 h-4 animate-spin mr-2" />{" "}
							Loading...
						</div>
					}
					scrollableTarget={SCROLL_CONTAINER_ID}
				>
					{tokens.map((token) => (
						<div
							key={token.symbol}
							onClick={() => handleToken(token)}
							className="p-2 cursor-pointer hover:bg-dark-gray-900 flex justify-between items-center gap-x-2 text-xs"
						>
							<Image
								src={token.image}
								width={32}
								height={32}
								alt={token.coin}
								className="rounded-full"
								unoptimized
							/>{" "}
							<div className="flex items-center flex-wrap justify-end gap-x-1">
								<p>{token.coin}</p>{" "}
								<p>
									({`${token.coin}/${tab.toUpperCase()}`})
								</p>
							</div>
						</div>
					))}
				</InfiniteScroll>

				{!isLoading && tokens.length === 0 && (
					<div className="p-4 text-center text-gray-500 text-sm">
						No tokens found.
					</div>
				)}
			</div>
		</PopoverWrapper>
	);
};
