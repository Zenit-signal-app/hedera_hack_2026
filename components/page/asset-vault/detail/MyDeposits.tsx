"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWalletStore } from "@/store/walletStore";
import DepositModal from "./DepositModal";
import RedeemModal from "./RedeemModal";
import { vaultApi } from "@/services/vaultServices";
import { UserVaultEarningInfoResponse } from "@/types/vault";
import { useVaultSocket } from "@/hooks/useVaultSocket";

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
	const [socketExtraValue, setSocketExtraValue] = useState(0);
	const [socketEnabled, setSocketEnabled] = useState(false);
	const pendingTxIdsRef = useRef<Set<string>>(new Set());
	const socketExtraValueRef = useRef(0);
	const lastApiTotalRef = useRef<number | null>(null);

	useEffect(() => {
		socketExtraValueRef.current = socketExtraValue;
	}, [socketExtraValue]);

	const handleVaultSocketMessage = useCallback(
		(payload: Record<string, unknown>) => {
			const wallet =
				(payload.wallet_address as string | undefined) ||
				(payload.walletAddress as string | undefined);
			const vault =
				(payload.vault_id as string | undefined) ||
				(payload.vaultId as string | undefined);
			const txId =
				(payload.transaction_id as string | undefined) ||
				(payload.tx_id as string | undefined) ||
				(payload.txId as string | undefined);
			const status =
				(payload.status as string | undefined) ||
				(payload.result as string | undefined) ||
				(payload.state as string | undefined);
			const value =
				(payload.value as number | undefined) ??
				(payload.amount as number | undefined) ??
				(payload.amount_ada as number | undefined) ??
				(payload.amountAda as number | undefined);

			if (!walletAddress || !vaultId) return;
			if (wallet && wallet !== walletAddress) return;
			if (vault && vault !== vaultId) return;
			if (txId && !pendingTxIdsRef.current.has(txId)) return;
			if (
				status &&
				![
					"ok",
					"oke",
					"success",
					"confirmed",
					"completed",
				].includes(String(status).toLowerCase())
			) {
				return;
			}
			if (typeof value !== "number" || Number.isNaN(value)) return;

			setSocketExtraValue((prev) => prev + value);
			if (txId) {
				pendingTxIdsRef.current.delete(txId);
			}
		},
		[vaultId, walletAddress]
	);

	const { sendMessage } = useVaultSocket({
		onMessage: handleVaultSocketMessage,
		enabled: socketEnabled,
	});

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

			const previousApiTotal = lastApiTotalRef.current;
			if (
				previousApiTotal !== null &&
				socketExtraValueRef.current > 0 &&
				data.total_deposit >=
					previousApiTotal + socketExtraValueRef.current - 0.000001
			) {
				setSocketExtraValue(0);
				pendingTxIdsRef.current.clear();
				setSocketEnabled(false);
			}
			lastApiTotalRef.current = data.total_deposit;
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

	const effectiveDepositValue =
		(earningInfo?.total_deposit || 0) + socketExtraValue;
	const hasDeposited = effectiveDepositValue > 0;
	const isRedeemed = Boolean(earningInfo?.is_redeemed);
	const isRedeemDisabled = !hasDeposited || isRedeemed;

	const handleDepositSuccess = async (txId: string) => {
		if (walletAddress && vaultId && txId) {
			pendingTxIdsRef.current.add(txId);
			setSocketEnabled(true);
			sendMessage({
				channel: "vault_deposit",
				wallet_address: walletAddress,
				transaction_id: txId,
				vault_id: vaultId,
			});
		}
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
