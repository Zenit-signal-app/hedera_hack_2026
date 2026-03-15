"use client";

import React, { useEffect, useRef, useState } from "react";
import { CHAIN_DEFINITIONS, ChainId } from "@/lib/constant";
import { useWalletStore } from "@/store/walletStore";
import { useTokenStore } from "@/store/tokenStore";
import ModalConnectChainWallet from "./ModalConnectChainWallet";
import Image from "next/image";

interface Props {
	children: React.ReactNode;
}

const ChainSelectorPopup: React.FC<Props> = ({ children }) => {
	const [popoverOpen, setPopoverOpen] = useState(false);
	const [connectChain, setConnectChain] = useState<ChainId | null>(null);
	const { chainConnections, setActiveChain, activeChain } = useWalletStore();
	const { setDefaultsForChain } = useTokenStore();
	const containerRef = useRef<HTMLDivElement>(null);

	// Close popup when clicking outside
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setPopoverOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, []);

	const handleChainClick = (chainId: ChainId) => {
		setPopoverOpen(false);
		setActiveChain(chainId);
		setDefaultsForChain(chainId);
		if (!chainConnections[chainId]) {
			// Not connected → open connect modal
			setConnectChain(chainId);
		}
	};

	return (
		<>
			<div ref={containerRef} className="relative h-7">
				<button
					onClick={() => setPopoverOpen((prev) => !prev)}
					className="focus:outline-none"
					aria-label="Select blockchain network"
				>
					{children}
				</button>

				{popoverOpen && (
					<div className="absolute left-0 top-full mt-2 bg-dark-gray-900 border border-dark-gray-700 rounded-xl p-2 z-[9999] w-52 shadow-2xl">
						<p className="text-dark-gray-400 text-xs px-3 py-1.5 font-medium uppercase tracking-wider">
							Select Network
						</p>
						{CHAIN_DEFINITIONS.map((chain) => {
							const connected = !!chainConnections[chain.id];
							const isActive = activeChain === chain.id;
							return (
								<button
									key={chain.id}
									onClick={() => handleChainClick(chain.id)}
									className={`flex items-center gap-x-3 w-full px-3 py-2.5 rounded-lg transition-colors ${
										isActive
											? "bg-dark-gray-800"
											: "hover:bg-dark-gray-800"
									}`}
								>
									<Image
										className="shrink-0"
										src={chain.logo}
										alt={chain.name}
										width={20}
										height={20}
									/>
									<span className="text-white text-sm font-medium">
										{chain.name}
									</span>
									<span className="ml-auto flex items-center gap-1.5">
										{connected && (
											<span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
										)}
									</span>
								</button>
							);
						})}
					</div>
				)}
			</div>

			{connectChain && (
				<ModalConnectChainWallet
					chainId={connectChain}
					isOpen={true}
					onClose={() => setConnectChain(null)}
				/>
			)}
		</>
	);
};

export default ChainSelectorPopup;
