/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useEffect, useState } from "react";
import CommonModal from "@/components/common/modal";
import { ArrowDown, Loader2, CheckCircle2, X } from "lucide-react";
import Image from "next/image";

type TokenDisplay = {
	amount: string;
	token?: string;
	usd?: string;
	iconUrl?: string;
};

type ReviewData = {
	sell: TokenDisplay;
	buy: TokenDisplay;
	fee: string;
	feeUsd?: string;
};

type SwapModalsProps = {
	step: "none" | "review" | "wallet" | "inprogress" | "success";
	reviewData: ReviewData;
	onClose: () => void;
	onConfirm: () => Promise<void> | void;
	miniStep: "none" | "submitting" | "submitted";
	txHash?: string | null;
	onViewExplorer?: (txHash: string) => void;
};

const TokenRow: React.FC<TokenDisplay> = ({ amount, token, usd, iconUrl }) => {
	return (
		<div className="flex items-center gap-3">
			<div className="relative w-8 h-8 rounded-full overflow-hidden">
				{iconUrl ? (
					<Image
						src={iconUrl}
						alt={token || "token"}
						fill
						sizes="32px"
						unoptimized
					/>
				) : (
					<div className="w-full h-full bg-dark-gray-800" />
				)}
			</div>
			<div className="flex flex-col leading-tight">
				<span className="text-white text-base font-semibold">
					{amount} {token}
				</span>
				{usd ? (
					<span className="text-dark-gray-100 text-sm">{usd}</span>
				) : null}
			</div>
		</div>
	);
};

const Divider = () => (
	<div className="w-full h-px bg-[rgba(255,255,255,0.08)]" aria-hidden />
);

const SectionTitle: React.FC<{ fee: string; feeUsd?: string }> = ({ fee, feeUsd }) => (
	<div className="flex items-center justify-between w-full text-sm text-dark-gray-100">
		<div className="flex items-center gap-1">
			<span>Network fee</span>
			<span className="text-dark-gray-100 text-sm">?</span>
		</div>
		<span className="text-white">
			{fee}
			{feeUsd ? (
				<span className="text-dark-gray-100 ml-1">({feeUsd})</span>
			) : null}
		</span>
	</div>
);

const PrimaryButton: React.FC<{
	label: string;
	onClick: () => void;
	loading?: boolean;
	disabled?: boolean;
}> = ({ label, onClick, loading, disabled }) => (
	<button
		onClick={onClick}
		disabled={disabled || loading}
		className="w-full h-10 rounded-md bg-primary-700 text-white font-museomoderno text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
	>
		{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
		{label}
	</button>
);

const ModalFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<div className="bg-[#111113]  rounded-3xl text-white flex flex-col gap-4 min-w-[320px] max-w-[420px]">
		{children}
	</div>
);

const SwapModals: React.FC<SwapModalsProps> = ({
	step,
	reviewData,
	onClose,
	onConfirm,
	miniStep,
	txHash,
	onViewExplorer,
}) => {
	const [progress, setProgress] = useState(100);

	useEffect(() => {
		if (miniStep === "submitting") {
			setProgress(100);
			const interval = setInterval(() => {
				setProgress((p) => (p > 0 ? p - 2 : 0));
			}, 100);
			return () => clearInterval(interval);
		} else {
			setProgress(100);
		}
	}, [miniStep]);

	return (
		<>
			<CommonModal
				isOpen={step === "review"}
				onOpenChange={(open) => !open && onClose()}
				hiddenClose
			>
				<ModalFrame>
					<div className="flex items-start justify-between">
						<h3 className="text-lg font-bold">
							Transaction confirmation
						</h3>
						<button
							onClick={onClose}
							aria-label="Close"
							className="text-gray-400 hover:text-white"
						>
							<X className="w-4 h-4" />
						</button>
					</div>

					<TokenRow {...reviewData.sell} />
					<ArrowDown className="text-dark-gray-100" />
					<TokenRow {...reviewData.buy} />
					<Divider />
					<SectionTitle fee={reviewData.fee} feeUsd={reviewData.feeUsd} />
					<PrimaryButton label="Confirm" onClick={onConfirm} />
				</ModalFrame>
			</CommonModal>

			<CommonModal
				isOpen={step === "wallet"}
				onOpenChange={(open) => !open && onClose()}
				hiddenClose
			>
				<ModalFrame>
					<div className="flex items-start justify-between">
						<h3 className="text-lg font-bold">
							Transaction confirmation
						</h3>
						<button
							onClick={onClose}
							aria-label="Close"
							className="text-gray-400 hover:text-white"
						>
							<X className="w-4 h-4" />
						</button>
					</div>

					<TokenRow {...reviewData.sell} />
					<ArrowDown className="text-dark-gray-100" />
					<TokenRow {...reviewData.buy} />
					<Divider />
					<SectionTitle fee={reviewData.fee} feeUsd={reviewData.feeUsd} />
					<PrimaryButton
						label="Confirm in your wallet"
						onClick={onConfirm}
						loading
					/>
				</ModalFrame>
			</CommonModal>

			<CommonModal
				isOpen={step === "inprogress"}
				onOpenChange={(open) => !open && onClose()}
				hiddenClose
			>
				<ModalFrame>
					<div className="flex items-start justify-between">
						<div className="flex items-center gap-2 text-gray-300 text-base">
							<Loader2 className="w-5 h-5 animate-spin" />
							<span>The transaction is in progress.</span>
						</div>
						<button
							onClick={onClose}
							aria-label="Close"
							className="text-gray-400 hover:text-white"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
					<Divider />
					<TokenRow {...reviewData.sell} />
					<ArrowDown className="text-dark-gray-100" />
					<TokenRow {...reviewData.buy} />
					<Divider />
					<SectionTitle fee={reviewData.fee} feeUsd={reviewData.feeUsd} />
				</ModalFrame>
			</CommonModal>

			<CommonModal
				isOpen={step === "success"}
				onOpenChange={(open) => !open && onClose()}
				hiddenClose
			>
				<ModalFrame>
					<div className="flex items-start justify-between">
						<div className="flex items-center gap-2 text-lg font-bold">
							<CheckCircle2 className="w-5 h-5 text-green-500" />
							<span>Swap Success!</span>
						</div>
						<button
							onClick={onClose}
							aria-label="Close"
							className="text-gray-400 hover:text-white"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
					<Divider />
					<TokenRow {...reviewData.sell} />
					<ArrowDown className="text-dark-gray-100" />
					<TokenRow {...reviewData.buy} />
					<Divider />
					<SectionTitle fee={reviewData.fee} feeUsd={reviewData.feeUsd} />
				</ModalFrame>
			</CommonModal>

			{miniStep !== "none" && (
				<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
					<div className="backdrop-blur-lg bg-[#111113] border border-dark-gray-700 rounded-xl shadow-2xl px-4 py-3 w-[320px] relative">
						<div className="flex items-center gap-3 text-white">
							<CheckCircle2 className="w-5 h-5 text-green-500" />
							<div className="flex-1 text-sm font-semibold">
								Transaction submitted
							</div>
							<button
								onClick={onClose}
								className="text-gray-300 hover:text-white"
							>
								<X className="w-4 h-4" />
							</button>
						</div>
						{miniStep === "submitting" && (
							<div className="mt-2 h-[3px] bg-transparent overflow-hidden rounded-full">
								<div
									className="h-full bg-dark-gray-100 transition-all duration-100"
									style={{ width: `${progress}%` }}
								/>
							</div>
						)}
						{miniStep === "submitted" && txHash && (
							<div className="mt-3 flex items-center justify-between gap-3">
								<div className="text-sm text-dark-gray-100">
									Your swap was successful.
								</div>
								<button
									onClick={() => onViewExplorer?.(txHash)}
									className="px-3 py-2 rounded-md bg-primary-700 text-white text-xs font-semibold"
								>
									View on explorer
								</button>
							</div>
						)}
					</div>
				</div>
			)}
		</>
	);
};

export default SwapModals;
