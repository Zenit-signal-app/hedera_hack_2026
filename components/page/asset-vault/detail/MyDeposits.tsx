"use client";

import { useState, useEffect, useCallback } from "react";
import { useWalletStore } from "@/store/walletStore";
import DepositModal from "./DepositModal";
import RedeemModal from "./RedeemModal";
import { vaultApi } from "@/services/vaultServices";
import { UserVaultEarningInfoResponse } from "@/types/vault";

interface MyDepositsProps {
	vaultId: string;
	poolId: string;
	vaultAddress: string;
	userDepositValue?: number;
	userDepositShare?: number;
	onDepositSuccess?: () => void;
	onRedeemSuccess?: () => void;
}

const MyDeposits = ({
	vaultId,
	poolId,
	vaultAddress,
	onDepositSuccess,
	onRedeemSuccess,
}: MyDepositsProps) => {
	const walletAddress = useWalletStore((state) => state.usedAddress);
	const [showDepositModal, setShowDepositModal] = useState(false);
	const [showRedeemModal, setShowRedeemModal] = useState(false);
	const [earningInfo, setEarningInfo] =
		useState<UserVaultEarningInfoResponse | null>(null);
	const [isEarningLoading, setIsEarningLoading] = useState(false);

	const fetchEarningInfo = useCallback(async () => {
		if (!walletAddress || !vaultId) {
			setEarningInfo(null);
			return;
		}

		setIsEarningLoading(true);
		try {
			const data = await vaultApi.getUserVaultEarningInfo(
				vaultId,
				walletAddress,
			);
			setEarningInfo(data);
		} catch (err) {
			console.error("Failed to fetch vault earning info:", err);
			setEarningInfo(null);
		} finally {
			setIsEarningLoading(false);
		}
	}, [vaultId, walletAddress]);

	useEffect(() => {
		fetchEarningInfo();
	}, [fetchEarningInfo]);

	const effectiveDepositValue = earningInfo?.total_deposit || 0;
	const hasDeposited = effectiveDepositValue > 0;
	const isRedeemed = Boolean(earningInfo?.is_redeemed);
	const isRedeemDisabled = !hasDeposited || isRedeemed;

	const handleDepositSuccess = async () => {
		await fetchEarningInfo();
		onDepositSuccess?.();
	};

	const handleRedeemSuccess = async () => {
		await fetchEarningInfo();
		onRedeemSuccess?.();
	};

	return (
		<div className="box-border flex flex-col items-start p-3 gap-3 rounded-3xl border border-dark-gray-700">
			<h1
				className="font-quickSan text-subtitle-2 font-bold text-white"
				style={{ textShadow: "0px 4px 4px rgba(0, 0, 0, 0.25)" }}
			>
				My deposits
			</h1>

			<div className="bg-dark-glass flex flex-row items-center p-3 px-4 gap-2 w-full rounded-lg">
				<div className="flex flex-col justify-center items-start flex-1">
					<div className="font-quickSan text-body-3 font-medium text-dark-gray-200 mb-0">
						Values
					</div>
					<div className="font-quickSan text-subtitle-2 font-bold text-white">
						${effectiveDepositValue.toFixed(2)}
					</div>
				</div>
				<div className="flex flex-col justify-center items-start flex-1">
					<div className="font-quickSan text-body-3 font-medium text-dark-gray-200 mb-0">
						Shared
					</div>
					<div className="font-quickSan text-subtitle-2 font-bold text-white">
						{earningInfo?.profit_rate.toFixed(2) || 0}%
					</div>
				</div>
			</div>

			<div className="flex flex-row items-center gap-3 w-full">
				<button
					onClick={() => setShowDepositModal(true)}
					className="flex flex-row justify-center items-center py-2 px-3 gap-2 h-10 flex-1 bg-primary-700 rounded-lg font-museomoderno text-label-3 font-semibold text-white cursor-pointer hover:-translate-y-0.5 active:translate-y-0 transition-transform duration-200"
				>
					Deposit
				</button>
				<button
					onClick={() => setShowRedeemModal(true)}
					disabled={isRedeemDisabled || isEarningLoading}
					className="box-border flex flex-row justify-center items-center py-2 px-3 gap-2 h-10 flex-1 bg-dark-gray-950 border border-primary-600 rounded-lg font-museomoderno text-label-3 font-medium text-white cursor-pointer hover:-translate-y-0.5 active:translate-y-0 transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Redeem
				</button>
			</div>

			{isRedeemed && (
				<div className="text-xs text-dark-gray-400">
					You have already redeemed your position.
				</div>
			)}

			<DepositModal
				isOpen={showDepositModal}
				onOpenChange={setShowDepositModal}
				poolId={poolId}
				vaultAddress={vaultAddress}
				walletAddress={walletAddress}
				onSuccess={handleDepositSuccess}
			/>

			<RedeemModal
				isOpen={showRedeemModal}
				onOpenChange={setShowRedeemModal}
				vaultId={vaultId}
				walletAddress={walletAddress}
				maxAmount={effectiveDepositValue}
				onSuccess={handleRedeemSuccess}
			/>
		</div>
	);
};

export default MyDeposits;
