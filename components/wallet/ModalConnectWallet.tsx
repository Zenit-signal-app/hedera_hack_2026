"use client";

import React, { useState, useEffect } from "react";
import Modal from "@/components/common/modal";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import { WalletInfo } from "@/types/wallet";
import DirectIcon from "../icon/IconDirect";
import Image from "next/image";
import { useWalletStore } from "@/store/walletStore";

type ModalState = "SELECT" | "CONNECTING" | "REJECTED";

interface ModalConnectWalletProps {
	isOpen: boolean;
	onClose: () => void;
}

const ModalConnectWallet: React.FC<ModalConnectWalletProps> = ({
	isOpen,
	onClose,
}) => {
	const { connect, isLoading } = useWalletConnect();
	const { availableWallets, error } = useWalletStore();
	const [modalState, setModalState] = useState<ModalState | string>("SELECT");
	const [selectedWallet, setSelectedWallet] = useState<WalletInfo | null>(null);

	useEffect(() => {
		if (!isOpen) {
			const timeoutId = window.setTimeout(() => {
				setModalState("SELECT");
				setSelectedWallet(null);
			}, 0);
			return () => {
				window.clearTimeout(timeoutId);
			};
		}
		return;
	}, [isOpen]);

	const handleWalletSelect = async (wallet: WalletInfo) => {
		setSelectedWallet(wallet);
		setModalState("CONNECTING");

		try {
			await connect(wallet.id);
			onClose();
		} catch (err) {
			setModalState("REJECTED");
		}
	};
	console.log(availableWallets);

	const renderContent = () => {
		switch (modalState) {
			case "SELECT":
				return (
					<div className="space-y-2 mt-4 max-h-96 overflow-y-auto">
						{availableWallets.length > 0 ? (
							availableWallets.map((wallet) => (
								<button
									key={wallet.id}
									onClick={() => handleWalletSelect(wallet)}
									className="flex items-center bg-dark-gray-950 rounded-md justify-between w-full py-2.5 px-4 transition duration-150 text-white disabled:opacity-50"
									disabled={isLoading}>
									<div className="flex items-center">
										<Image
											src={wallet.icon}
											alt={`${wallet.name} icon`}
											className="w-7 h-7 mr-3 rounded-full"
											width={28}
											height={28}
										/>
										<span className="font-medium">{wallet.name}</span>
									</div>
									<DirectIcon className="text-gray-400" size={20} />
								</button>
							))
						) : (
							<p className="text-gray-400 text-sm">
								No Cardano wallet found. Please install a wallet.
							</p>
						)}
					</div>
				);

			case "CONNECTING":
				return (
					<div className="flex flex-col items-center justify-center p-8 space-y-4">
						{selectedWallet && (
							<Image
								src={selectedWallet.icon}
								alt={`${selectedWallet.name} icon`}
								className="w-14 h-14 mb-3"
								width={56}
								height={56}
							/>
						)}
						<p className="text-sm font-bold text-white font-exo">
							Waiting for {selectedWallet?.name}
						</p>
						<div className="w-full bg-gray-700 p-3 rounded-md  font-museomoderno font-semibold text-center text-gray-400 text-sm">
							Connecting...
						</div>
					</div>
				);

			case "REJECTED":
				return (
					<div className="flex flex-col items-center justify-center p-8 space-y-4">
						{selectedWallet && (
							<img
								src={selectedWallet.icon}
								alt={`${selectedWallet.name} icon`}
								className="w-12 h-12 rounded-full mb-4"
							/>
						)}
						<p className="text-xl font-bold text-red-500">
							Connection declined
						</p>
						<p className="text-sm text-gray-400 text-center">
							Connection could be declined if a previous request is still
							active.
						</p>
						<button
							onClick={() => setModalState("SELECT")}
							className="w-full px-4 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition">
							Try again
						</button>
					</div>
				);
			default:
				return null;
		}
	};

	// Xác định Title và có nút Back hay không
	const getTitleAndBack = () => {
		switch (modalState) {
			case "SELECT":
				return { title: "Connect a wallet", showBack: false };
			case "CONNECTING":
				return { title: "Back", showBack: true };
			case "REJECTED":
				return { title: "Reject", showBack: true };
			default:
				return { title: "Connect Wallet", showBack: false };
		}
	};

	const { title, showBack } = getTitleAndBack();

	return (
		<Modal
			isOpen={isOpen}
			onOpenChange={onClose}
			title={title}
			showBack={showBack}
			handleBack={(x: string) => setModalState(x)}
			className="">
			{/* Nội dung chính của Modal */}
			{renderContent()}

			{/* Nếu có lỗi chung không liên quan đến rejected */}
			{error && modalState !== "REJECTED" && (
				<p className="text-red-500 text-sm mt-3">{error}</p>
			)}
		</Modal>
	);
};

export default ModalConnectWallet;
