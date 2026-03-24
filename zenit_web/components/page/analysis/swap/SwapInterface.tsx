/* eslint-disable @typescript-eslint/no-explicit-any */
import { useSwapLogic } from "@/hooks/useSwapLogic";
import { useWalletStore } from "@/store/walletStore";
import { useMemo } from "react";
import TokenInputCard from "./TokenInputCard";
import SwapIcon from "@/components/icon/Icon_Swap";
import { Transition } from "@headlessui/react";
import { TransactionDetails } from "./TransactionDetail";
import Loader from "@/components/common/loading/loader";
import SwapModals from "./SwapModals";

export const SwapInterface: React.FC = () => {
	const { activeChain, chainConnections, chainBalances } = useWalletStore();
	const walletAddress = activeChain
		? chainConnections[activeChain]?.address
		: undefined;

	const {
		topCardData,
		bottomCardData,
		swapState,
		handleSwapDirection,
		setInputAmount,
		handleChangeTokenIn,
		handleChangeTokenOut,
		tokenIn,
		tokenOut,
		modalStep,
		miniStep,
		reviewData,
		openReviewModal,
		closeModal,
		handleSwapFlow,
		handleViewExplorer,
		txHash,
	} = useSwapLogic();

	const balances = activeChain ? chainBalances[activeChain] ?? [] : [];

	const isInsufficientBalance = useMemo(() => {
		const balanceEntry = balances.find(
			(b) =>
				b.symbol.toUpperCase() === topCardData.token?.toUpperCase()
		);
		const available = parseFloat(balanceEntry?.balance ?? "0");
		return (
			parseFloat(topCardData.value || "0") > available ||
			!balanceEntry
		);
	}, [topCardData.value, topCardData.token, balances]);

	const isQuoteLoading = swapState.isQuoteLoading;
	const isReadyToSwap =
		parseFloat(topCardData.value) > 0 && !!swapState.quote;

	const handleSwapSubmit = async () => {
		if (!isReadyToSwap || swapState.isSubmitting) return;
		if (!walletAddress || !swapState.quote) return;
		openReviewModal();
	};

	const isButtonDisabled =
		!isReadyToSwap || swapState.isSubmitting || isInsufficientBalance;

	return (
		<div className="w-full relative mx-auto rounded-2xl shadow-2xl flex flex-col gap-y-5">
			<div className="flex flex-col space-y-2">
				<TokenInputCard
					{...topCardData}
					onAmountChange={setInputAmount}
					isLoading={isQuoteLoading}
					onSelect={(token) => handleChangeTokenIn(token)}
					type="sell"
				/>

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
				<TokenInputCard
					{...bottomCardData}
					onAmountChange={() => {}}
					isLoading={isQuoteLoading}
					onSelect={(token) => handleChangeTokenOut(token)}
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
							tokenIn={tokenIn}
							tokenOut={tokenOut}
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
				{swapState.isSubmitting ? (
					<Loader className="w-6 h-6 mx-auto animate-spin" />
				) : !walletAddress ? (
					"Connect Wallet"
				) : isInsufficientBalance ? (
					`Insufficient ${topCardData.token} Balance`
				) : (
					"Swap"
				)}
			</button>

			<SwapModals
				step={modalStep}
				reviewData={reviewData}
				onClose={closeModal}
				onConfirm={handleSwapFlow}
				miniStep={miniStep}
				txHash={txHash || undefined}
				onViewExplorer={(hash) => handleViewExplorer(hash)}
			/>
		</div>
	);
};
