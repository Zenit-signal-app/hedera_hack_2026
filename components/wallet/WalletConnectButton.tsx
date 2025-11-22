// components/Wallet/WalletConnectButton.tsx

import React, { useMemo, useState } from "react";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import ModalConnectWallet from "./ModalConnectWallet";
import WalletIcon from "../icon/Icon_ Wallet";
import { useWalletStore } from "@/store/walletStore";

const WalletConnectButton: React.FC = () => {
	const { disconnect } = useWalletConnect();

	const { isConnected, usedAddress, isWalletInfoLoading } = useWalletStore();
	const [isModalOpen, setIsModalOpen] = useState(false);

	const buttonText = useMemo(() => {
		return isConnected
			? isWalletInfoLoading
				? "Đang tải thông tin..."
				: `${usedAddress?.slice(0, 6)}...${usedAddress?.slice(-4)}`
			: "Connect Wallet";
	}, [isConnected, usedAddress, isWalletInfoLoading]);

	return (
		<>
			<button
				onClick={() => {
					if (isConnected) {
						disconnect();
					} else {
						setIsModalOpen(true);
					}
				}}
				className="px-3 py-2 bg-dark-gray-900 flex items-center gap-x-1 text-white font-semibold rounded-full shadow-md text-base font-museomoderno transition duration-150 disabled:opacity-50 border border-dark-gray-700 hover:border-dark-gray-400"
				disabled={isWalletInfoLoading}>
				{buttonText}{" "}
				{isConnected ? (
					<WalletIcon className="text-dark-gray-200 fill-dark-gray-200" />
				) : null}
			</button>

			<ModalConnectWallet
				isOpen={isModalOpen}
				onClose={() => setIsModalOpen(false)}
			/>
		</>
	);
};

export default WalletConnectButton;
