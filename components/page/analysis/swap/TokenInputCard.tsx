// components/SwapInterface.tsx

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Input from "@/components/common/input";
import SwapIcon from "@/components/icon/Icon_Swap";
import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import { TransactionDetails } from "./TransactionDetail";
import { Loader2 } from "lucide-react";
import { useSwapLogic } from "@/hooks/useSwapLogic";
import { useWalletStore } from "@/store/walletStore";
import { TokenData } from "@/types";
import PopoverWrapper from "@/components/common/popover";
import { MinswapBalanceItem } from "@/types/minswap";
import { useTokenStore } from "@/store/tokenStore";
import { parseTokenPair } from "@/lib/ultils";
interface TokenInputCardProps extends TokenData {
	onAmountChange: (value: string) => void;
	isLoading: boolean;
	onSelect?: (token: MinswapBalanceItem) => void;
}

const TokenInputCard: React.FC<TokenInputCardProps> = ({
	type,
	value,
	usdValue,
	token,
	balance,
	iconUrl,
	onAmountChange,
	isLoading,
	onSelect
}) => {
	const isSell = type === "sell";
	const listToken = useWalletStore((state) => state.balance);
	const [open, setOpen] = useState(false);
	const isSelectable = isSell;
	return (
		<div
			className={`px-5 py-4 rounded-xl bg-white/10 border border-dark-gray-600`}
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
					<span className="text-dark-gray-100 font-semibold text-sm mt-2">
						{usdValue}
					</span>
				</div>
{isSell ? <PopoverWrapper
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
					<div className="flex flex-col gap-y-2">{listToken.map((item) => {
						return (<button key={item.asset.token_id} onClick={() => onSelect && onSelect(item)} className="flex items-center justify-between gap-x-4 bg-dark-gray-900 py-2 px-4 rounded-md hover:bg-dark-gray-700">
							<Image src={item.asset.logo} width={24} height={24} alt={item.asset.token_id} className="rounded-full"/>
							{item.asset.ticker}
						</button>)
					})}</div>
				</PopoverWrapper> :<div className="flex items-center space-x-2 p-1 bg-white/5 border-dark-gray-500 border rounded-full cursor-pointer">
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
						</div> }
				
			</div>

			<div className="text-right text-gray-500 text-sm mt-2">
				{balance}
			</div>
		</div>
	);
};
type TokenSide = 'IN' | 'OUT' | null;

export const SwapInterface: React.FC = () => {


	const { balance } = useWalletStore();
	const token = useTokenStore((state) => state.token)
	const {baseToken} = parseTokenPair(token)

	const [selectingSide, setSelectingSide] = useState<TokenSide>(null);
	const initialIn = balance.find(a => a.asset.ticker === 'ADA') || balance[0];
const initialOut = balance.find(a => a.asset.ticker === baseToken) || balance[1];
const { 
    topCardData, 
    bottomCardData, 
    swapState, 
    handleSwapDirection, 
    setInputAmount,signAndSubmitSwap,
		handleChangeTokenIn,
		handleChangeTokenOut
} = useSwapLogic({
    initialTokenIn: initialIn,
    initialTokenOut: initialOut,
});

	const { usedAddress } = useWalletStore();

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string | null>(null);

	const isQuoteLoading = swapState.isQuoteLoading;
	const isReadyToSwap =
		parseFloat(topCardData.value) > 0 && !!swapState.quote;

	const handleSwapSubmit = async () => {
		if (!isReadyToSwap || isSubmitting) return;
		if (!usedAddress || !swapState.quote) return; // Kiểm tra ví và quote lần cuối

		setIsSubmitting(true);
		setTxHash(null);

		try {
			const currentQuote = swapState.quote;
			const amountIn = topCardData.value;

			const transactionId = await signAndSubmitSwap();

			setTxHash(transactionId || "");
		} catch (error: any) {
			console.error("Giao dịch Swap thất bại:", error);
			alert(
				error.message ||
					"Giao dịch thất bại. Vui lòng kiểm tra lại phí hoặc lỗi từ ví."
			);
		} finally {
			setIsSubmitting(false);
		}
	};
const handleTokenSelect = (token: MinswapBalanceItem) => {
        // Chỉ gọi handler cho Token IN
        handleChangeTokenIn(token); 
    };
	return (
		<div className="w-full relative mx-auto rounded-2xl shadow-2xl flex flex-col gap-y-5">
			<div className="flex flex-col space-y-2">
				{/* Card Sell */}
				<TokenInputCard
					{...topCardData}
					onAmountChange={setInputAmount}
					isLoading={isQuoteLoading}
					onSelect={(token) => handleTokenSelect(token)}
					type="sell"
				/>

				{/* Nút Swap Direction */}
				<div className="relative z-10">
					<button
						onClick={handleSwapDirection}
						disabled={isQuoteLoading}
						className="w-8 h-8 rounded-full left-1/2 -ml-4 -top-3.5 absolute bg-purple-700 hover:bg-purple-800 transition-colors text-white flex items-center justify-center border-4 border-[#0a0a1a]"
						aria-label="Swap tokens"
					>
						<SwapIcon className="w-5 h-5" />
					</button>
				</div>

				{/* Card Buy */}
				<TokenInputCard
					{...bottomCardData}
					onAmountChange={() => {}}
					isLoading={isQuoteLoading}
					type="buy"
				/>
			</div>
			<TransactionDetails />
			<button
				onClick={handleSwapSubmit}
				disabled={!isReadyToSwap || isSubmitting}
				className={`w-full py-3 text-lg font-bold text-white rounded-lg transition-colors ${
					!isReadyToSwap || isSubmitting
						? "bg-gray-600 cursor-not-allowed"
						: "bg-primary-700 hover:shadow-md hover:shadow-primary-800"
				}`}
			>
				{isSubmitting ? (
					<Loader2 className="w-6 h-6 mx-auto animate-spin" />
				) : (
					"Swap"
				)}
			</button>

			{swapState.error && (
				<p className="text-red-500 text-sm">{swapState.error}</p>
			)}
			{txHash && (
				<p className="text-green-500 text-sm">
					TX Hash: {txHash.slice(0, 15)}...
				</p>
			)}
		</div>
	);
};
