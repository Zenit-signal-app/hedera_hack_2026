import { useSwapLogic } from "@/hooks/useSwapLogic";
import { useTokenStore } from "@/store/tokenStore";
import { useWalletStore } from "@/store/walletStore";
import { MinswapBalanceItem } from "@/types/minswap";
import { useMemo, useState } from "react";
import TokenInputCard from "./TokenInputCard";
import SwapIcon from "@/components/icon/Icon_Swap";
import { Transition } from "@headlessui/react";
import { TransactionDetails } from "./TransactionDetail";
import Loader from "@/components/common/loading/loader";

export const SwapInterface: React.FC = () => {
	const { balance } = useWalletStore();
	const token = useTokenStore((state) => state.token);
	const initialIn =
		balance.find((a) => a.asset.ticker === "ADA") || balance[0];
	const initialOut =
		balance.find((a) => a.asset.ticker === token.symbol) || balance[1];

	const {
		topCardData,
		bottomCardData,
		swapState,
		handleSwapDirection,
		setInputAmount,
		signAndSubmitSwap,
		handleChangeTokenIn,
	} = useSwapLogic({
		initialTokenIn: initialIn,
		initialTokenOut: initialOut,
	});
	const isInsufficientBalance = useMemo(() => {
		const balanceToken = balance.find(
			(item) =>
				item.asset.ticker.toUpperCase() ===
				topCardData.token?.toUpperCase()
		);

		const valueToken =
			balanceToken?.asset.ticker === "ADA"
				? Number(balanceToken.amount) / 1000000
				: Number(balanceToken?.amount);

		return (
			Number(topCardData.value) > Number(valueToken) ||
			balanceToken === undefined
		);
	}, [topCardData.value, topCardData.token, balance]);
	const { usedAddress } = useWalletStore();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isQuoteLoading = swapState.isQuoteLoading;
	const isReadyToSwap =
		parseFloat(topCardData.value) > 0 && !!swapState.quote;

	const handleSwapSubmit = async () => {
		if (!isReadyToSwap || isSubmitting) return;
		if (!usedAddress || !swapState.quote) return;

		setIsSubmitting(true);

		try {
			await signAndSubmitSwap();
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
		handleChangeTokenIn(token);
	};

	const isButtonDisabled =
		!isReadyToSwap || isSubmitting || isInsufficientBalance;
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
						className="w-8 h-8 rounded-sm left-1/2 -ml-4 -top-3.5 absolute bg-purple-700 hover:bg-purple-800 transition-colors text-white flex items-center justify-center"
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
			<Transition
				show={topCardData.value !== "0" || !topCardData.value}
				enter="transition-all duration-300 ease-out"
				enterFrom="opacity-0 max-h-0 -translate-y-2"
				enterTo="opacity-100 max-h-[500px] translate-y-0"
				leave="transition-all duration-200 ease-in"
				leaveFrom="opacity-100 max-h-[500px] translate-y-0"
				leaveTo="opacity-0 max-h-0 -translate-y-2"
			>
				<div>
					{swapState.isQuoteLoading ? (
						<div>
							<Loader />
						</div>
					) : (
						<TransactionDetails
							tokenIn={topCardData.token}
							tokenOut={bottomCardData.token}
						/>
					)}
				</div>
			</Transition>
			<button
				onClick={handleSwapSubmit}
				disabled={isButtonDisabled}
				className={`w-full py-3 text-lg font-bold text-white font-museomoderno rounded-lg transition-colors ${
					isButtonDisabled
						? "bg-gray-600 cursor-not-allowed"
						: "bg-primary-700 hover:shadow-md hover:shadow-primary-800"
				}`}
			>
				{isSubmitting ? (
					<Loader className="w-6 h-6 mx-auto animate-spin" />
				) : isInsufficientBalance ? (
					`Insufficient ${topCardData.token.toUpperCase()} Balance`
				) : (
					"Swap"
				)}
			</button>
		</div>
	);
};
