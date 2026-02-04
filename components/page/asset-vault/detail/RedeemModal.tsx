"use client";

import { useState } from "react";
import CommonModal from "@/components/common/modal";
import LoadingAI from "@/components/common/loading/loading_ai";
import Input from "@/components/common/input";
import { vaultApi } from "@/services/vaultServices";

interface RedeemModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	vaultId: string;
	poolId: string;
	walletAddress: string | null;
	maxAmount: number;
	onSuccess?: () => void;
}

const RedeemModal = ({
	isOpen,
	onOpenChange,
	vaultId,
	poolId,
	walletAddress,
	maxAmount,
	onSuccess,
}: RedeemModalProps) => {
	const [redeemAmount, setRedeemAmount] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleRedeem = async () => {
		if (!walletAddress) {
			setError("Wallet not connected");
			return;
		}

		if (!redeemAmount || isNaN(Number(redeemAmount)) || Number(redeemAmount) <= 0) {
			setError("Please enter a valid amount");
			return;
		}

		if (Number(redeemAmount) > maxAmount) {
			setError(`Redeem amount exceeds your deposit value (Max: $${maxAmount.toFixed(2)})`);
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const amountLovelace = Math.floor(Number(redeemAmount) * 1_000_000);

			const result = await vaultApi.redeemFromVault({
				vault_id: vaultId,
				pool_id: poolId,
				amount_ada: Number(redeemAmount),
				amount_lovelace: amountLovelace,
				recipient_address: walletAddress,
			});

			setRedeemAmount("");
			onOpenChange(false);
			onSuccess?.();

			alert(`Redeem successful! TX: ${result.tx_id}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Redeem failed. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	const handleMaxClick = () => {
		setRedeemAmount(maxAmount.toString());
		setError(null);
	};

	return (
		<CommonModal
			title="Redeem from Vault"
			isOpen={isOpen}
			onOpenChange={onOpenChange}
		>
			<div className="space-y-4">
				{error && (
					<div className="bg-red-500/20 border border-red-500 text-red-400 p-3 rounded">
						{error}
					</div>
				)}

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
					<Input
						type="number"
						value={redeemAmount}
						onChange={(e) => {
							setRedeemAmount(e.target.value);
							setError(null);
						}}
						placeholder="0.00"
						max={maxAmount}
						disabled={isLoading || maxAmount <= 0}
						className="border-dark-gray-600 focus-within:border-primary-600"
					/>
				</div>

				<div className="flex gap-3 pt-4">
					<button
						onClick={() => {
							onOpenChange(false);
							setRedeemAmount("");
							setError(null);
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
								<LoadingAI />
								Processing...
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
