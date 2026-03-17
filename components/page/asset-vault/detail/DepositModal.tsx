"use client";

import { useState, useEffect, useMemo } from "react";
import CommonModal from "@/components/common/modal";
import LoadingAI from "@/components/common/loading/loading_ai";
import { NumberInput } from "@/components/common/input";
import AmountSlider from "@/components/common/slider/AmountSlider";
import { useVaultDeposit } from "@/hooks/useVaultDeposit";
import { VaultConfig, CHAIN_DECIMALS, CHAIN_NATIVE_SYMBOL, fromSmallestUnit, toSmallestUnit } from "@/lib/vault-transaction";
import { toast } from "sonner";
import { useWalletStore } from "@/store/walletStore";
import type { ChainId } from "@/lib/constant";

interface DepositModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	poolId: string;
	vaultAddress: string;
	walletAddress: string | null | undefined;
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
	const [feeSmallest, setFeeSmallest] = useState<number | null>(null);
	const [isFeeLoading, setIsFeeLoading] = useState(false);

	const {
		deposit,
		estimateFee,
		isDepositing,
		error: depositError,
		txHash,
		reset,
	} = useVaultDeposit();

	const activeChain = useWalletStore((state) => state.activeChain) as ChainId | null;
	const chainBalances = useWalletStore((state) => state.chainBalances);

	const nativeSymbol = activeChain ? CHAIN_NATIVE_SYMBOL[activeChain] : "";
	const decimals = activeChain ? CHAIN_DECIMALS[activeChain] : 6;

	// Vault configuration from props
	const vaultConfig: VaultConfig = useMemo(() => {
		const minAmount = Number.isFinite(minDeposit)
			? Math.max(minDeposit, 0)
			: 0;
		return {
			vault_address: vaultAddress,
			pool_id: poolId,
			min_deposit: activeChain ? toSmallestUnit(minAmount, activeChain) : 0,
		};
	}, [poolId, vaultAddress, minDeposit, activeChain]);

	const hasVaultConfig = Boolean(poolId && vaultAddress);

	const amount = Number(depositAmount);
	const feeNative = feeSmallest !== null && activeChain
		? fromSmallestUnit(feeSmallest, activeChain)
		: null;
	const netAmount =
		feeNative !== null && !Number.isNaN(amount)
			? Math.max(amount - feeNative, 0)
			: null;

	const nativeBalance = useMemo(() => {
		if (!activeChain || !chainBalances[activeChain]) return 0;
		const balances = chainBalances[activeChain];
		const nativeItem = balances.find(
			(item) =>
				item.symbol === nativeSymbol ||
				item.symbol === nativeSymbol.toUpperCase(),
		);
		if (!nativeItem) return 0;
		const rawAmount = Number(nativeItem.balance);
		if (Number.isNaN(rawAmount)) return 0;
		return rawAmount;
	}, [activeChain, chainBalances, nativeSymbol]);

	const safeMinDeposit = Number.isFinite(minDeposit)
		? Math.max(minDeposit, 0)
		: 0;
	const safeMaxDeposit = Number.isFinite(nativeBalance)
		? Math.max(nativeBalance, 0)
		: 0;
	const hasValidAmount = !Number.isNaN(amount) && amount > 0;
	const isInsufficientBalance = hasValidAmount && amount > safeMaxDeposit;
	const hasEnoughForMin = safeMaxDeposit >= safeMinDeposit;

	// Reset when modal closes
	useEffect(() => {
		if (!isOpen) {
			setDepositAmount(0);
			setFeeSmallest(null);
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

		const currentAmount = Number(depositAmount);
		if (!walletAddress || Number.isNaN(currentAmount) || currentAmount <= 0) {
			setFeeSmallest(null);
			setIsFeeLoading(false);
			return;
		}

		let isCancelled = false;
		setIsFeeLoading(true);

		const timer = setTimeout(async () => {
			try {
				const fee = await estimateFee(
					vaultConfig,
					currentAmount,
					walletAddress,
				);
				if (!isCancelled) {
					setFeeSmallest(fee);
				}
			} catch {
				if (!isCancelled) {
					setFeeSmallest(null);
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

		if (Number.isNaN(amount) || amount <= 0) {
			toast.error("Please enter a valid amount");
			return;
		}

		if (isInsufficientBalance) {
			toast.error("Insufficient balance");
			return;
		}

		if (amount < safeMinDeposit) {
			toast.error(`Minimum deposit is ${safeMinDeposit} ${nativeSymbol}`);
			return;
		}

		const resultTxHash = await deposit(
			vaultConfig,
			amount,
			walletAddress,
		);

		if (resultTxHash) {
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
						Amount ({nativeSymbol})
					</label>
					<NumberInput
						value={Number.isFinite(depositAmount) ? depositAmount : 0}
						onValueChange={(values) => {
							const nextValue = values.floatValue ?? 0;
							setDepositAmount(nextValue);
							reset();
						}}
						allowNegative={false}
						decimalScale={decimals}
						placeholder="0.00"
						disabled={isDepositing}
						className="border-dark-gray-600 focus-within:border-primary-600"
					/>
					<div className="flex items-center justify-between mt-2">
						<button
							onClick={() => setDepositAmount(safeMaxDeposit)}
							disabled={isDepositing || safeMaxDeposit <= 0}
							className="text-xs text-primary-600 hover:text-primary-500 disabled:opacity-50"
						>
							Max: {safeMaxDeposit.toFixed(2)} {nativeSymbol}
						</button>
					</div>
					<AmountSlider
						label={`Amount (${nativeSymbol})`}
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
					{feeNative !== null && !isFeeLoading && (
						<p className="text-xs text-dark-gray-400 mt-1">
							Estimated fee: {feeNative.toFixed(6)} {nativeSymbol}
						</p>
					)}
					{netAmount !== null && !isFeeLoading && (
						<p className="text-xs text-dark-gray-400 mt-1">
							Estimated deposit after fee: {netAmount.toFixed(6)} {nativeSymbol}
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
