import React, { useCallback, useState } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import { useTokenLoadMore } from "@/hooks/useTokenLoadMore";
import { Loader2, Search } from "lucide-react";
import { PopoverWrapper } from "@/components/common/popover";
import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import Image from "next/image";
import Input from "@/components/common/input";
import SearchIcon from "@/components/icon/Icon_ Search";
import TabsWrapper from "@/components/common/tabs";
import { INITIAL_ADA, INITIAL_USDM, useTokenStore } from "@/store/tokenStore";
import { TokenPriceData } from "@/types/token";

const SCROLL_CONTAINER_ID = "token-list-scroll-container";

export const TokenSelector: React.FC = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const { tokens, isLoading } = useTokenLoadMore(searchQuery);
	const {
		handleSelectToken,
		handleSelectQuoteAsset,
		quoteAsset,
		handleSelectQuoteToken,
	} = useTokenStore();
	const [tab, setTabs] = useState(quoteAsset);
	const handleToken = useCallback(
		(token: TokenPriceData) => {
			setIsOpen(false);
			handleSelectToken(token);
			handleSelectQuoteAsset(tab);
			tab === "USDM"
				? handleSelectQuoteToken(INITIAL_USDM)
				: handleSelectQuoteToken(INITIAL_ADA);
		},
		[tab]
	);
	return (
		<PopoverWrapper
			trigger={
				<ChevronDownMini className="bg-dark-gray-700 rounded-sm flex flex-col items-center justify-center" />
			}
			open={isOpen}
			onOpenChange={setIsOpen}
		>
			{/* Thanh tìm kiếm */}
			<div className="flex items-center">
				<Input
					startIcon={<SearchIcon className="w-4 h-4" />}
					placeholder="Tìm kiếm..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className=" text-dark-gray-400 text-sm bg-transparent outline-none py-1"
				/>
			</div>

			<TabsWrapper
				tabs={[
					{ value: "USDM", label: "USDM" },
					{ value: "ADA", label: "ADA" },
				]}
				defaultValue={"USDM"}
				value={tab}
				variant="underline"
				className="text-sm py-1 px-0"
				onValueChange={(tab) => setTabs(tab as "USDM" | "ADA")}
			/>

			<div id={SCROLL_CONTAINER_ID} className="max-h-60 overflow-y-auto">
				<InfiniteScroll
					dataLength={tokens.length}
					next={() => {}}
					hasMore={false}
					loader={
						<div className="p-2 flex justify-center items-center text-gray-500">
							<Loader2 className="w-4 h-4 animate-spin mr-2" />{" "}
							Đang tải...
						</div>
					}
					scrollableTarget={SCROLL_CONTAINER_ID}
				>
					{tokens.map((token) => (
						<div
							key={token.id}
							onClick={() => handleToken(token)}
							className="p-2 cursor-pointer hover:bg-dark-gray-900 flex justify-between items-center gap-x-2 text-xs"
						>
							<Image
								src={token.logo_url}
								width={32}
								height={32}
								alt={token.name}
								className="rounded-full"
							/>{" "}
							<div className="flex items-center flex-wrap justify-end gap-x-1">
								<p>{token.name}</p>{" "}
								<p>
									({`${token.symbol}/${tab.toUpperCase()}`})
								</p>
							</div>
						</div>
					))}

					{/* {!canLoadMore && tokens.length > 0 && (
						<div className="text-center py-2 text-gray-500 text-xs border-t mt-1">
							Đã tải hết {tokens.length} token.
						</div>
					)} */}
				</InfiniteScroll>

				{!isLoading && tokens.length === 0 && (
					<div className="p-4 text-center text-gray-500 text-sm">
						Không tìm thấy token nào.
					</div>
				)}
			</div>
		</PopoverWrapper>
	);
};
