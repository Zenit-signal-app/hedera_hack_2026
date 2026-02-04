"use client";

import { useState } from "react";
import CommonModal from "@/components/common/modal";
import LoadingAI from "@/components/common/loading/loading_ai";
import Input from "@/components/common/input";
import { vaultApi } from "@/services/vaultServices";

interface DepositModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	vaultId: string;
	poolId: string;
	walletAddress: string | null;
	onSuccess?: () => void;
}

const DepositModal = ({
	isOpen,
	onOpenChange,
	vaultId,
	poolId,
	walletAddress,
	onSuccess,
}: DepositModalProps) => {
	const [depositAmount, setDepositAmount] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleDeposit = async () => {
		if (!walletAddress) {
			setError("Wallet not connected");
			return;
		}

		if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) {
			setError("Please enter a valid amount");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const amountLovelace = Math.floor(Number(depositAmount) * 1_000_000);

			const result = await vaultApi.depositToVault({
				vault_id: vaultId,
				pool_id: poolId,
				amount_ada: Number(depositAmount),
				amount_lovelace: amountLovelace,
				contributor_address: walletAddress,
			});

			setDepositAmount("");
			onOpenChange(false);
			onSuccess?.();

			alert(`Deposit successful! TX: ${result.tx_id}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Deposit failed. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<CommonModal
			title="Deposit to Vault"
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
					<label className="block text-sm font-medium text-dark-gray-200 mb-2">
						Amount (ADA)
					</label>
					<Input
						type="number"
						value={depositAmount}
						onChange={(e) => {
							setDepositAmount(e.target.value);
							setError(null);
						}}
						placeholder="0.00"
						disabled={isLoading}
						className="border-dark-gray-600 focus-within:border-primary-600"
					/>
				</div>

				<div className="flex gap-3 pt-4">
					<button
						onClick={() => {
							onOpenChange(false);
							setDepositAmount("");
							setError(null);
						}}
						disabled={isLoading}
						className="flex-1 py-2 px-3 bg-dark-gray-800 border border-dark-gray-600 rounded text-white font-medium hover:bg-dark-gray-700 disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						onClick={handleDeposit}
						disabled={isLoading || !depositAmount}
						className="flex-1 py-2 px-3 bg-primary-700 rounded text-white font-medium hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2"
					>
						{isLoading ? (
							<>
								<LoadingAI />
								Processing...
							</>
						) : (
							"Deposit"
						)}
					</button>
				</div>
			</div>
		</CommonModal>
	);
};

export default DepositModal;
