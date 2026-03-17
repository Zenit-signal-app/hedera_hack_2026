"use client";

import React, { useState } from "react";
import Image from "next/image";
import CommonModal from "@/components/common/modal";
import DirectIcon from "@/components/icon/IconDirect";
import { CHAIN_DEFINITIONS, ChainId, ChainWalletInfo } from "@/lib/constant";
import { getInstalledWalletIds, useChainWalletConnect } from "@/hooks/useChainWalletConnect";
import { useWalletStore } from "@/store/walletStore";

type ModalState = "SELECT" | "CONNECTING" | "REJECTED" | "NOT_INSTALLED" | "SUCCESS";

interface Props {
	chainId: ChainId;
	isOpen: boolean;
	onClose: () => void;
}

/** Renders the wallet icon image if available, otherwise a colored initial avatar. */
const WalletIcon: React.FC<{ wallet: ChainWalletInfo; size?: number }> = ({
	wallet,
	size = 28,
}) =>
	wallet.icon ? (
		<Image
			src={wallet.icon}
			alt={wallet.name}
			width={size}
			height={size}
			className="rounded-full"
			style={{ minWidth: size }}
		/>
	) : (
		<span
			style={{
				width: size,
				height: size,
				minWidth: size,
				background: wallet.bgColor,
				borderRadius: "50%",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				fontSize: size * 0.45,
				fontWeight: 700,
				color: "#fff",
				userSelect: "none",
			}}
		>
			{wallet.name[0]}
		</span>
	);

const ModalConnectChainWallet: React.FC<Props> = ({ chainId, isOpen, onClose }) => {
	const chain = CHAIN_DEFINITIONS.find((c) => c.id === chainId)!;
	const { connect, isLoading } = useChainWalletConnect();
	const { chainConnections } = useWalletStore();

	const [state, setState] = useState<ModalState>("SELECT");
	const [selected, setSelected] = useState<ChainWalletInfo | null>(null);
	const [connectedAddress, setConnectedAddress] = useState<string>("");
	const [errorMsg, setErrorMsg] = useState<string>("");
	const [showAllWallets, setShowAllWallets] = useState(false);

	/** Number of wallets to show before "View options" toggle. */
	const INITIAL_VISIBLE = 3;

	const installedIds = typeof window !== "undefined" ? getInstalledWalletIds(chainId) : [];

	const handleClose = () => {
		setState("SELECT");
		setSelected(null);
		setErrorMsg("");
		setShowAllWallets(false);
		onClose();
	};

	const handleWalletSelect = async (wallet: ChainWalletInfo) => {
		const isInstalled = installedIds.includes(wallet.id);
		if (!isInstalled) {
			setSelected(wallet);
			setState("NOT_INSTALLED");
			return;
		}

		setSelected(wallet);
		setState("CONNECTING");

		const result = await connect(chainId, wallet.id, wallet.name);
		if (result.ok) {
			setConnectedAddress(result.address);
			setState("SUCCESS");
			setTimeout(handleClose, 1500);
		} else {
			setErrorMsg(result.error);
			setState("REJECTED");
		}
	};

	// Sort wallets: detected first, then alphabetical
	const sortedWallets = [...chain.wallets].sort((a, b) => {
		const aInstalled = installedIds.includes(a.id) ? 0 : 1;
		const bInstalled = installedIds.includes(b.id) ? 0 : 1;
		if (aInstalled !== bInstalled) return aInstalled - bInstalled;
		return a.name.localeCompare(b.name);
	});

	const visibleWallets = showAllWallets
		? sortedWallets
		: sortedWallets.slice(0, INITIAL_VISIBLE);

	// If chain already has a connection, show "already connected" view
	const existingConnection = chainConnections[chainId];

	const renderContent = () => {
		if (existingConnection && state === "SELECT") {
			return (
				<div className="mt-4 space-y-4">
					<div className="flex items-center gap-3 p-4 bg-primary-950 rounded-xl">
						<WalletIcon
							wallet={
								chain.wallets.find(
									(w) => w.id === existingConnection.walletId
								) ?? { id: "", name: existingConnection.walletName, bgColor: chain.color }
							}
							size={40}
						/>
						<div className="flex flex-col min-w-0">
							<span className="text-white font-semibold text-sm">
								{existingConnection.walletName}
							</span>
							<span className="text-dark-gray-400 text-xs truncate">
								{existingConnection.address.slice(0, 12)}…
								{existingConnection.address.slice(-6)}
							</span>
						</div>
						<span className="ml-auto flex items-center gap-1 text-green-400 text-xs font-medium">
							<span className="w-2 h-2 rounded-full bg-green-400" />
							Connected
						</span>
					</div>

					<p className="text-dark-gray-400 text-xs text-center">
						Switch to a different wallet:
					</p>
					{chain.wallets
						.filter((w) => w.id !== existingConnection.walletId)
						.map((wallet) => (
							<button
								key={wallet.id}
								onClick={() => handleWalletSelect(wallet)}
								disabled={isLoading}
								className="flex items-center bg-primary-950 rounded-md justify-between w-full py-2.5 px-4 transition duration-150 text-white disabled:opacity-50"
							>
								<div className="flex items-center gap-3">
									<WalletIcon wallet={wallet} />
									<span className="font-medium text-sm">{wallet.name}</span>
								</div>
								<DirectIcon className="text-gray-400" size={20} />
							</button>
						))}
				</div>
			);
		}

		switch (state) {
			case "SELECT":
				return (
					<div className="mt-4">
						<p className="text-center text-dark-gray-300 text-sm mb-5">
							Connect a wallet on {chain.name} to continue
						</p>

						<div className="space-y-1">
							{visibleWallets.map((wallet) => {
								const isDetected = installedIds.includes(wallet.id);
								return (
									<button
										key={wallet.id}
										onClick={() => handleWalletSelect(wallet)}
										disabled={isLoading}
										className="flex items-center justify-between w-full py-3 px-4 rounded-lg hover:bg-primary-950 transition duration-150 text-white disabled:opacity-50"
									>
										<div className="flex items-center gap-3">
											<WalletIcon wallet={wallet} size={32} />
											<span className="font-medium text-[15px]">
												{wallet.name}
											</span>
										</div>
										{isDetected && (
											<span className="text-dark-gray-400 text-sm">
												Detected
											</span>
										)}
									</button>
								);
							})}
						</div>

						{sortedWallets.length > INITIAL_VISIBLE && (
							<button
								onClick={() => setShowAllWallets(!showAllWallets)}
								className="w-full mt-4 py-2 flex items-center justify-center gap-1.5 text-dark-gray-400 hover:text-white text-sm transition"
							>
								{showAllWallets ? (
									<>
										Less options
										<svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="mt-0.5">
											<path d="M3 7.5L6 4.5L9 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
										</svg>
									</>
								) : (
									<>
										Already have a wallet? View options
										<svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="mt-0.5">
											<path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
										</svg>
									</>
								)}
							</button>
						)}
					</div>
				);

			case "CONNECTING":
				return (
					<div className="flex flex-col items-center justify-center p-8 space-y-4">
						<WalletIcon wallet={selected!} size={56} />
						<p className="text-sm font-bold text-white font-exo">
							Waiting for {selected?.name}
						</p>
						<div className="w-full bg-gray-700 p-3 rounded-md font-museomoderno font-semibold text-center text-gray-400 text-sm">
							Connecting…
						</div>
					</div>
				);

			case "SUCCESS":
				return (
					<div className="flex flex-col items-center justify-center p-8 space-y-4">
						<WalletIcon wallet={selected!} size={56} />
						<p className="text-lg font-bold text-green-400">Connected!</p>
						<p className="text-xs text-dark-gray-400 break-all text-center">
							{connectedAddress}
						</p>
					</div>
				);

			case "REJECTED":
				return (
					<div className="flex flex-col items-center justify-center p-8 space-y-4">
						<WalletIcon wallet={selected!} size={48} />
						<p className="text-xl font-bold text-red-500">Connection declined</p>
						<p className="text-sm text-gray-400 text-center">{errorMsg}</p>
						<button
							onClick={() => setState("SELECT")}
							className="w-full px-4 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition"
						>
							Try again
						</button>
					</div>
				);

			case "NOT_INSTALLED":
				return (
					<div className="flex flex-col items-center justify-center p-8 space-y-4">
						<WalletIcon wallet={selected!} size={56} />
						<p className="text-xl font-bold text-white">
							{selected?.name} is not installed
						</p>
						<p className="text-sm text-gray-400 text-center">
							Install the {selected?.name} extension to continue.
						</p>
						{selected?.url && (
							<button
								onClick={() => {
									window.open(selected.url, "_blank", "noopener,noreferrer");
									setState("SELECT");
								}}
								className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
							>
								<span>Install {selected.name}</span>
								<DirectIcon size={16} />
							</button>
						)}
						<button
							onClick={() => setState("SELECT")}
							className="w-full px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 transition"
						>
							Back
						</button>
					</div>
				);

			default:
				return null;
		}
	};

	const showBack = state !== "SELECT" && state !== "SUCCESS";

	return (
		<CommonModal
			title={`Connect to ${chain.name}`}
			isOpen={isOpen}
			onOpenChange={(open) => !open && handleClose()}
			showBack={showBack}
			handleBack={() => setState("SELECT")}
		>
			{renderContent()}
		</CommonModal>
	);
};

export default ModalConnectChainWallet;
