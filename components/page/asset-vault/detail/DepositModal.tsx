"use client";

import { useState, useEffect, useMemo } from "react";
import CommonModal from "@/components/common/modal";
import LoadingAI from "@/components/common/loading/loading_ai";
import { NumberInput } from "@/components/common/input";
import AmountSlider from "@/components/common/slider/AmountSlider";
import { useVaultDeposit } from "@/hooks/useVaultDeposit";
import { VaultConfig } from "@/lib/vault-transaction";
import { toast } from "sonner";
import { useWalletStore } from "@/store/walletStore";
import Image from "next/image";
interface DepositModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	poolId: string;
	vaultAddress: string;
	walletAddress: string | null;
	minDeposit: number;
	onSuccess?: (txId: string) => void;
}

const DepositModal = ({
	isOpen,
	onOpenChange,
	poolId,
	vaultAddress,
	walletAddress,
	minDeposit,
	onSuccess,
}: DepositModalProps) => {
	const [depositAmount, setDepositAmount] = useState(0);
	const [feeLovelace, setFeeLovelace] = useState<number | null>(null);
	const [isFeeLoading, setIsFeeLoading] = useState(false);

	const {
		deposit,
		estimateFee,
		isDepositing,
		error: depositError,
		txHash,
		reset,
	} = useVaultDeposit();
	const walletBalance = useWalletStore((state) => state.balance);

	// Vault configuration from props
	const vaultConfig: VaultConfig = useMemo(() => {
		const minAda = Number.isFinite(minDeposit)
			? Math.max(minDeposit, 0)
			: 0;
		return {
			vault_address: vaultAddress,
			pool_id: poolId,
			min_lovelace: Math.round(minAda * 1_000_000),
		};
	}, [poolId, vaultAddress, minDeposit]);

	const hasVaultConfig = Boolean(poolId && vaultAddress);

	const amountAda = Number(depositAmount);
	const feeAda = feeLovelace !== null ? feeLovelace / 1_000_000 : null;
	const netAda =
		feeAda !== null && !Number.isNaN(amountAda)
			? Math.max(amountAda - feeAda, 0)
			: null;
	const adaBalance = useMemo(() => {
		const adaItem = walletBalance.find(
			(item) =>
				item.asset.ticker === "ADA" ||
				item.asset.token_id === "lovelace",
		);
		if (!adaItem) return 0;

		const rawAmount = Number(adaItem.amount);
		if (Number.isNaN(rawAmount)) return 0;
		const decimals = adaItem.asset.decimals ?? 6;
		return rawAmount / Math.pow(10, decimals);
	}, [walletBalance]);
	const safeMinDeposit = Number.isFinite(minDeposit)
		? Math.max(minDeposit, 0)
		: 0;
	const safeMaxDeposit = Number.isFinite(adaBalance)
		? Math.max(adaBalance, 0)
		: 0;
	const hasValidAmount = !Number.isNaN(amountAda) && amountAda > 0;
	const isInsufficientBalance = hasValidAmount && amountAda > safeMaxDeposit;
	const hasEnoughForMin = safeMaxDeposit >= safeMinDeposit;

	// Reset when modal closes
	useEffect(() => {
		if (!isOpen) {
			setDepositAmount(0);
			setFeeLovelace(null);
			setIsFeeLoading(false);
			reset();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		if (!hasEnoughForMin) {
			setDepositAmount(0);
			return;
		}
		setDepositAmount(safeMinDeposit);
	}, [isOpen, hasEnoughForMin, safeMinDeposit]);

	useEffect(() => {
		if (depositError) {
			toast.error(depositError);
		}
	}, [depositError]);

	useEffect(() => {
		if (!isOpen) return;

		const amountAda = Number(depositAmount);
		if (!walletAddress || Number.isNaN(amountAda) || amountAda <= 0) {
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
				const fee = await estimateFee(
					vaultConfig,
					amountAda,
					walletAddress,
				);
				if (!isCancelled) {
					setFeeLovelace(fee);
				}
			} catch (err) {
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
	}, [
		depositAmount,
		estimateFee,
		isOpen,
		walletAddress,
		vaultConfig,
		poolId,
		vaultAddress,
	]);

	const handleDeposit = async () => {
		if (!walletAddress) {
			toast.error("Please connect your wallet first");
			return;
		}

		if (!hasVaultConfig) {
			toast.error(
				"Vault configuration is missing. Please refresh and try again.",
			);
			return;
		}

		if (Number.isNaN(amountAda) || amountAda <= 0) {
			toast.error("Please enter a valid amount");
			return;
		}

		if (isInsufficientBalance) {
			toast.error("Insufficient balance");
			return;
		}

		if (amountAda < safeMinDeposit) {
			toast.error(`Minimum deposit is ${safeMinDeposit} ADA`);
			return;
		}

		// Call deposit hook - it will handle building, signing and submitting transaction
		const resultTxHash = await deposit(
			vaultConfig,
			amountAda,
			walletAddress,
		);

		if (resultTxHash) {
			// Success
			setDepositAmount(0);
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
				{!hasVaultConfig && (
					<div className="bg-yellow-500/20 border border-yellow-500 text-yellow-400 p-3 rounded">
						Vault config missing. Please reload the page.
					</div>
				)}

				{/* Success display */}
				{txHash && (
					<div className="bg-green-500/20 border border-green-500 text-green-400 p-3 rounded">
						<p className="font-medium mb-1">
							✓ Deposit Successful!
						</p>
						<p className="text-xs break-all">TX: {txHash}</p>
					</div>
				)}

				<div>
					<label className="block text-sm font-medium text-dark-gray-200 mb-2">
						Amount (ADA)
					</label>
					<NumberInput
						value={Number.isFinite(depositAmount) ? depositAmount : 0}
						onValueChange={(values) => {
							const nextValue = values.floatValue ?? 0;
							setDepositAmount(nextValue);
							reset();
						}}
						allowNegative={false}
						decimalScale={6}
						placeholder="0.00"
						disabled={isDepositing}
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
					<div className="flex items-center justify-between mt-2">
						<button
							onClick={() => setDepositAmount(safeMaxDeposit)}
							disabled={isDepositing || safeMaxDeposit <= 0}
							className="text-xs text-primary-600 hover:text-primary-500 disabled:opacity-50"
						>
							Max: {safeMaxDeposit.toFixed(2)} ADA
						</button>
					</div>
					<AmountSlider
						label="Amount (ADA)"
						min={safeMinDeposit}
						max={safeMaxDeposit}
						value={depositAmount}
						step={0.01}
						onChange={(nextValue) => {
							setDepositAmount(nextValue);
							reset();
						}}
						disabled={isDepositing}
					/>
					{!hasEnoughForMin && (
						<p className="text-xs text-red-400">
							Balance is below minimum deposit.
						</p>
					)}
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
							setDepositAmount(0);
							reset();
						}}
						disabled={isDepositing}
						className="flex-1 py-2 px-3 bg-dark-gray-800 border border-dark-gray-600 rounded text-white font-medium hover:bg-dark-gray-700 disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						onClick={handleDeposit}
						disabled={
							isDepositing ||
							!hasVaultConfig ||
							!hasEnoughForMin ||
							depositAmount <= 0 ||
							isInsufficientBalance
						}
						className="flex-1 py-2 px-3 bg-primary-700 rounded text-white font-medium hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2"
					>
						{isDepositing ? (
							<>
								<LoadingAI />
								Processing...
							</>
						) : isInsufficientBalance ? (
							"Insufficient balance"
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
