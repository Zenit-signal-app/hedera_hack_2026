"use client";

import { useState, useEffect, useMemo } from "react";
import CommonModal from "@/components/common/modal";
import LoadingAI from "@/components/common/loading/loading_ai";
import Input from "@/components/common/input";
import { useVaultDeposit } from "@/hooks/useVaultDeposit";
import { VaultConfig } from "@/lib/vault-transaction";

interface DepositModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	poolId: string;
	vaultAddress: string;
	walletAddress: string | null;
	onSuccess?: (txId: string) => void;
}

const DepositModal = ({
	isOpen,
	onOpenChange,
	poolId,
	vaultAddress,
	walletAddress,
	onSuccess,
}: DepositModalProps) => {
	const [depositAmount, setDepositAmount] = useState("");
	const [feeLovelace, setFeeLovelace] = useState<number | null>(null);
	const [isFeeLoading, setIsFeeLoading] = useState(false);
	
	const { deposit, estimateFee, isDepositing, error: depositError, txHash, reset } = useVaultDeposit();

	// Vault configuration from props
	const vaultConfig: VaultConfig = useMemo(
		() => ({
			vault_address: vaultAddress,
			pool_id: poolId,
			min_lovelace: 2_000_000, // 2 ADA minimum
		}),
		[poolId, vaultAddress]
	);

	const hasVaultConfig = Boolean(poolId && vaultAddress);

	const amountAda = Number(depositAmount);
	const feeAda = feeLovelace !== null ? feeLovelace / 1_000_000 : null;
	const netAda =
		feeAda !== null && !Number.isNaN(amountAda)
			? Math.max(amountAda - feeAda, 0)
			: null;

	// Reset when modal closes
	useEffect(() => {
		if (!isOpen) {
			setDepositAmount("");
			setFeeLovelace(null);
			setIsFeeLoading(false);
			reset();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;

		const amountAda = Number(depositAmount);
		if (!walletAddress || !depositAmount || Number.isNaN(amountAda) || amountAda <= 0) {
			setFeeLovelace(null);
			setIsFeeLoading(false);
			return;
		}

		if (walletAddress.length < 80) {
		}

		let isCancelled = false;
		setIsFeeLoading(true);

		const timer = setTimeout(async () => {
			try {
				const fee = await estimateFee(vaultConfig, amountAda, walletAddress);
				if (!isCancelled) {
					setFeeLovelace(fee);
				}
			} catch (err) {
				console.error("Failed to estimate fee:", err);
				if (!isCancelled) {
					setFeeLovelace(null);
				}
			} finally {
				if (!isCancelled) {
					setIsFeeLoading(false);
				}
			}
		}, 400);

		return () => {
			isCancelled = true;
			clearTimeout(timer);
		};
	}, [depositAmount, estimateFee, isOpen, walletAddress, vaultConfig, poolId, vaultAddress]);

	const handleDeposit = async () => {
		if (!walletAddress) {
			alert("Please connect your wallet first");
			return;
		}

		if (!hasVaultConfig) {
			alert("Vault configuration is missing. Please refresh and try again.");
			return;
		}

		if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) {
			alert("Please enter a valid amount");
			return;
		}

		const amountAda = Number(depositAmount);
		const minAda = vaultConfig.min_lovelace / 1_000_000;

		if (amountAda < minAda) {
			alert(`Minimum deposit is ${minAda} ADA`);
			return;
		}

		// Call deposit hook - it will handle building, signing and submitting transaction
		const resultTxHash = await deposit(vaultConfig, amountAda, walletAddress);

		if (resultTxHash) {
			// Success
			setDepositAmount("");
			onOpenChange(false);
			onSuccess?.(resultTxHash);
		}
	};

	return (
		<CommonModal
			title="Deposit to Vault"
			isOpen={isOpen}
			onOpenChange={onOpenChange}
		>
			<div className="space-y-4">
				{/* Error display */}
				{depositError && (
					<div className="bg-red-500/20 border border-red-500 text-red-400 p-3 rounded">
						{depositError}
					</div>
				)}

				{!hasVaultConfig && (
					<div className="bg-yellow-500/20 border border-yellow-500 text-yellow-400 p-3 rounded">
						Vault config missing. Please reload the page.
					</div>
				)}

				{/* Success display */}
				{txHash && (
					<div className="bg-green-500/20 border border-green-500 text-green-400 p-3 rounded">
						<p className="font-medium mb-1">✓ Deposit Successful!</p>
						<p className="text-xs break-all">TX: {txHash}</p>
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
							reset(); // Reset error when user types
						}}
						placeholder="0.00"
						disabled={isDepositing}
						className="border-dark-gray-600 focus-within:border-primary-600"
					/>
					<p className="text-xs text-dark-gray-400 mt-1">
						Minimum: {vaultConfig.min_lovelace / 1_000_000} ADA
					</p>
					{isFeeLoading && (
						<p className="text-xs text-dark-gray-400 mt-1">
							Estimating fee...
						</p>
					)}
					{feeAda !== null && !isFeeLoading && (
						<p className="text-xs text-dark-gray-400 mt-1">
							Estimated fee: {feeAda.toFixed(6)} ADA
						</p>
					)}
					{netAda !== null && !isFeeLoading && (
						<p className="text-xs text-dark-gray-400 mt-1">
							Estimated deposit after fee: {netAda.toFixed(6)} ADA
						</p>
					)}
				</div>

				<div className="flex gap-3 pt-4">
					<button
						onClick={() => {
							onOpenChange(false);
							setDepositAmount("");
							reset();
						}}
						disabled={isDepositing}
						className="flex-1 py-2 px-3 bg-dark-gray-800 border border-dark-gray-600 rounded text-white font-medium hover:bg-dark-gray-700 disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						onClick={handleDeposit}
						disabled={isDepositing || !depositAmount || !hasVaultConfig}
						className="flex-1 py-2 px-3 bg-primary-700 rounded text-white font-medium hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2"
					>
						{isDepositing ? (
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
