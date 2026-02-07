"use client";

import { useState } from "react";
import CommonModal from "@/components/common/modal";
import LoadingAI from "@/components/common/loading/loading_ai";
import Input, { NumberInput } from "@/components/common/input";
import { vaultApi } from "@/services/vaultServices";
import { toast } from "sonner";
import Image from "next/image";
import Loader from "@/components/common/loading/loader";

interface RedeemModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	vaultId: string;
	walletAddress: string | null;
	maxAmount: number;
	onSuccess?: () => void;
}

const RedeemModal = ({
	isOpen,
	onOpenChange,
	vaultId,
	walletAddress,
	maxAmount,
	onSuccess,
}: RedeemModalProps) => {
	const [redeemAmount, setRedeemAmount] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleRedeem = async () => {
		if (!walletAddress) {
			toast.error("Wallet not connected");
			return;
		}

		if (
			!redeemAmount ||
			isNaN(Number(redeemAmount)) ||
			Number(redeemAmount) <= 0
		) {
			toast.error("Please enter a valid amount");
			return;
		}

		if (Number(redeemAmount) > maxAmount) {
			toast.error(
				`Redeem amount exceeds your deposit value (Max: $${maxAmount.toFixed(2)})`,
			);
			return;
		}

		setIsLoading(true);

		try {
			const result = await vaultApi.withdrawFromVault({
				vault_id: vaultId,
				wallet_address: walletAddress,
				amount_ada: Number(redeemAmount),
			});

			// Check if withdrawal was successful
			if (result.status === "invalid") {
				throw new Error(result.reason || "Withdrawal failed");
			}

			setRedeemAmount("");
			onOpenChange(false);
			onSuccess?.();

			toast.success("Withdrawal request submitted successfully!");
		} catch (err) {
			toast.error(
				err instanceof Error
					? err.message
					: "Withdrawal failed. Please try again.",
			);
		} finally {
			setIsLoading(false);
		}
	};

	const handleMaxClick = () => {
		setRedeemAmount(maxAmount.toString());
	};

	return (
		<CommonModal
			title="Redeem from Vault"
			isOpen={isOpen}
			onOpenChange={onOpenChange}
		>
			<div className="space-y-4">
				<div>
					<div className="flex items-center justify-between mb-2">
						<label className="block text-sm font-medium text-dark-gray-200">
							Amount (ADA)
						</label>
						<button
							onClick={handleMaxClick}
							disabled={isLoading || maxAmount <= 0}
							className="text-xs text-primary-600 hover:text-primary-500 disabled:opacity-50"
						>
							Max: ${maxAmount.toFixed(2)}
						</button>
					</div>
					<NumberInput
						value={redeemAmount}
						onChange={(e) => {
							setRedeemAmount(e.target.value);
						}}
						placeholder="0.00"
						max={maxAmount}
						disabled={isLoading || maxAmount <= 0}
						className="border-dark-gray-600 focus-within:border-primary-600"
						startIcon={
							<Image
								src="/images/ada.png"
								alt="icon"
								width={20}
								height={20}
							/>
						}
					/>
				</div>

				<div className="flex gap-3 pt-4">
					<button
						onClick={() => {
							onOpenChange(false);
							setRedeemAmount("");
						}}
						disabled={isLoading}
						className="flex-1 py-2 px-3 bg-dark-gray-800 border border-dark-gray-600 rounded text-white font-medium hover:bg-dark-gray-700 disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						onClick={handleRedeem}
						disabled={isLoading || !redeemAmount || maxAmount <= 0}
						className="flex-1 py-2 px-3 bg-primary-700 rounded text-white font-medium hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2"
					>
						{isLoading ? (
							<>
								<Loader size={"sm"} />
							</>
						) : (
							"Redeem"
						)}
					</button>
				</div>
			</div>
		</CommonModal>
	);
};

export default RedeemModal;
