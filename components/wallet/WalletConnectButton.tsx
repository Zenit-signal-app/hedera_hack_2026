// components/Wallet/WalletConnectButton.tsx

import React, { useCallback, useMemo, useState } from "react";
import ModalConnectChainWallet from "./ModalConnectChainWallet";
import WalletIcon from "../icon/Icon_ Wallet";
import { useWalletStore } from "@/store/walletStore";
import Drawer from "../common/drawer";
import WalletPortfolio from "./WalletPortfolio";
import { useIsMobile } from "@/src/components/hooks/useIsMobile";
import type { ChainId } from "@/lib/constant";

const WalletConnectButton: React.FC = () => {
	const { activeChain, chainConnections } = useWalletStore();
	const [open, setOpen] = useState(false);
	const [chainModalOpen, setChainModalOpen] = useState(false);
	const isMobile = useIsMobile();

	const chainAddress = activeChain ? chainConnections[activeChain]?.address : undefined;
	const isConnected = !!chainAddress;

	const buttonText = useMemo(() => {
		if (isMobile) return null;
		if (isConnected) {
			return `${chainAddress!.slice(0, 6)}...${chainAddress!.slice(-4)}`;
		}
		return "Connect Wallet";
	}, [isConnected, chainAddress, isMobile]);

	const handleClick = useCallback(() => {
		if (isConnected) {
			setOpen(true);
		} else {
			setChainModalOpen(true);
		}
	}, [isConnected]);

	return (
		<>
			<button
				onClick={handleClick}
				className="px-3 py-2 bg-primary-900 flex items-center gap-x-1 text-white font-semibold rounded-full shadow-md text-base font-museomoderno transition duration-150 border border-dark-gray-700 hover:border-dark-gray-400"
			>
				{buttonText}{" "}
				{isConnected ? (
					<WalletIcon className="text-dark-gray-200 fill-dark-gray-200" />
				) : null}
			</button>
			<Drawer side="right" open={open} onOpenChange={(e) => setOpen(e)}>
				<WalletPortfolio handleClose={(o) => setOpen(o)} />
			</Drawer>
			{/* Opens connect modal for the active chain (or solana as default) */}
			<ModalConnectChainWallet
				chainId={(activeChain as ChainId) ?? "solana"}
				isOpen={chainModalOpen && !isConnected}
				onClose={() => setChainModalOpen(false)}
			/>
		</>
	);
};

export default WalletConnectButton;
