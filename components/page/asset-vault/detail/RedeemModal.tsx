"use client";

import { useEffect, useMemo, useState } from "react";
import CommonModal from "@/components/common/modal";
import AmountSlider from "@/components/common/slider/AmountSlider";
import { vaultApi } from "@/services/vaultServices";
import { toast } from "sonner";
import Loader from "@/components/common/loading/loader";
import { useWalletStore } from "@/store/walletStore";
import { getServerChainId } from "@/services/chainServices";

interface RedeemModalProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	vaultId: string;
	walletAddress: string | null;
	minAmount: number;
	maxAmount: number;
	onSuccess?: () => void;
}

const RedeemModal = ({
	isOpen,
	onOpenChange,
	vaultId,
	walletAddress,
	minAmount,
	maxAmount,
	onSuccess,
}: RedeemModalProps) => {
	const [redeemAmount, setRedeemAmount] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const { activeChain } = useWalletStore();

	const safeMaxAmount = useMemo(() => {
		return Number.isFinite(maxAmount) ? Math.max(maxAmount, 0) : 0;
	}, [maxAmount]);
	const safeMinAmount = useMemo(() => {
		return Number.isFinite(minAmount) ? Math.max(minAmount, 0) : 0;
	}, [minAmount]);
	const effectiveMin = Math.min(safeMinAmount, safeMaxAmount);
	const hasEnoughForMin = safeMaxAmount >= safeMinAmount;

	useEffect(() => {
		if (!isOpen) {
			setRedeemAmount(0);
			return;
		}

		if (safeMaxAmount <= 0) {
			setRedeemAmount(0);
			return;
		}

		setRedeemAmount(effectiveMin);
	}, [isOpen, safeMaxAmount, effectiveMin]);

	const handleRedeem = async () => {
		if (!walletAddress) {
			toast.error("Wallet not connected");
			return;
		}

		if (!Number.isFinite(redeemAmount) || redeemAmount <= 0) {
			toast.error("Please enter a valid amount");
			return;
		}

		if (redeemAmount < safeMinAmount) {
			toast.error(`Minimum withdraw is ${safeMinAmount} ADA`);
			return;
		}

		if (redeemAmount > safeMaxAmount) {
			toast.error(
				`Redeem amount exceeds your deposit value (Max: ${safeMaxAmount.toFixed(2)} ADA)`,
			);
			return;
		}

		setIsLoading(true);

		try {
			const chainId = await getServerChainId(activeChain ?? "");
			const result = await vaultApi.withdrawFromVault({
				vault_id: vaultId,
				wallet_address: walletAddress,
				amount_ada: redeemAmount,
				chain_id: chainId,
			});

			// Check if withdrawal was successful
			if (result.status === "invalid") {
				throw new Error(result.reason || "Withdrawal failed");
			}

			setRedeemAmount(0);
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
		setRedeemAmount(safeMaxAmount);
	};

	return (
		<CommonModal
			title="Redeem from Vault"
			isOpen={isOpen}
			onOpenChange={onOpenChange}
		>
			<div className="space-y-4">
				<div>
					<div className="flex items-center justify-between">
						<button
							onClick={handleMaxClick}
							disabled={isLoading || safeMaxAmount <= 0}
							className="text-xs text-primary-600 hover:text-primary-500 disabled:opacity-50"
						>
							Max: {safeMaxAmount.toFixed(2)} ADA
						</button>
					</div>
					<AmountSlider
						label="Amount (ADA)"
						min={safeMinAmount}
						max={safeMaxAmount}
						value={redeemAmount}
						step={0.01}
						onChange={setRedeemAmount}
						disabled={isLoading}
					/>
					{!hasEnoughForMin && (
						<p className="text-xs text-red-400">
							Balance is below minimum withdraw.
						</p>
					)}
				</div>

				<div className="flex gap-3 pt-4">
					<button
						onClick={() => {
							onOpenChange(false);
							setRedeemAmount(0);
						}}
						disabled={isLoading}
						className="flex-1 py-2 px-3 bg-dark-gray-800 border border-dark-gray-600 rounded text-white font-medium hover:bg-dark-gray-700 disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						onClick={handleRedeem}
						disabled={
							isLoading ||
							redeemAmount <= 0 ||
							safeMaxAmount <= 0 ||
							!hasEnoughForMin
						}
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
