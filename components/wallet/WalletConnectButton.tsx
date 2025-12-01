// components/Wallet/WalletConnectButton.tsx

import React, { useCallback, useMemo, useState } from "react";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import ModalConnectWallet from "./ModalConnectWallet";
import WalletIcon from "../icon/Icon_ Wallet";
import { useWalletStore } from "@/store/walletStore";
import Drawer from "../common/drawer";
import WalletPortfolio from "./WalletPortfolio";
import { useIsMobile } from "@/src/components/hooks/useIsMobile";

const WalletConnectButton: React.FC = () => {
	const { disconnect } = useWalletConnect();

	const { isConnected, usedAddress, isWalletInfoLoading, availableWallets } =
		useWalletStore();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [open, setOpen] = useState(false);
	const isMobile = useIsMobile()
	const buttonText = useMemo(() => {
		return isMobile ? null : isConnected
			? isWalletInfoLoading
				? "Đang tải thông tin..."
				: `${usedAddress?.slice(0, 6)}...${usedAddress?.slice(-4)}`
			: "Connect Wallet";
	}, [isConnected, usedAddress, isWalletInfoLoading]);
	const handleClick = useCallback(() => {
		if (isConnected) {
			setOpen(true);
		} else {
			setIsModalOpen(true);
		}
	}, [isConnected]);
	return (
		<>
			<button
				onClick={handleClick}
				className="px-3 py-2 bg-dark-gray-900  flex items-center gap-x-1 text-white font-semibold rounded-full shadow-md text-base font-museomoderno transition duration-150 disabled:opacity-50 border border-dark-gray-700 hover:border-dark-gray-400"
				disabled={isWalletInfoLoading}
			>
				{buttonText}{" "}
				{isConnected ? (
					<WalletIcon className="text-dark-gray-200 fill-dark-gray-200" />
				) : null}
			</button>
			<Drawer
				side="right"
				open={open}
				onOpenChange={(e) => setOpen(e)}
			>
				<WalletPortfolio handleClose={(o) => setOpen(o)}/>
			</Drawer>
			<ModalConnectWallet
				isOpen={isModalOpen}
				onClose={() => setIsModalOpen(false)}
			/>
		</>
	);
};

export default WalletConnectButton;
