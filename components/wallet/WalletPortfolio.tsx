import React from "react";
import Image from "next/image";
import { useWalletStore } from "@/store/walletStore";
import { useChainWalletConnect } from "@/hooks/useChainWalletConnect";
import { useChainBalance } from "@/hooks/useChainBalance";
import { CHAIN_DEFINITIONS } from "@/lib/constant";
import { LogOut, RefreshCw } from "lucide-react";
import Copy from "../common/Copy";
import type { ChainId } from "@/lib/constant";

export const WalletPortfolio: React.FC<{
	handleClose: (o: boolean) => void;
}> = ({ handleClose }) => {
	const { activeChain, chainConnections } = useWalletStore();
	const { disconnect } = useChainWalletConnect();
	const { balances, isLoading, refresh } = useChainBalance();
  console.log(balances)
	const connection = activeChain ? chainConnections[activeChain] : null;
	const chain = CHAIN_DEFINITIONS.find((c) => c.id === activeChain);

	if (!connection || !chain) {
		return (
			<div className="p-6 bg-gray-900 text-white rounded-xl text-center">
				<p>Vui lòng kết nối ví để xem thông tin.</p>
			</div>
		);
	}

	const shortAddress = `${connection.address.slice(0, 8)}...${connection.address.slice(-6)}`;

	return (
		<div className="w-full h-screen mx-auto bg-gray-800 rounded-2xl shadow-2xl font-sans py-10 px-4">
			{/* Header */}
			<div className="flex justify-between items-center pb-4">
				<div className="flex items-center space-x-3">
					<div
						className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-base"
						style={{ background: chain.color }}
					>
						{chain.name[0]}
					</div>
					<div className="flex flex-col">
						<span className="text-white font-bold text-lg">
							{connection.walletName}
						</span>
						<span
							className="text-xs font-semibold"
							style={{ color: chain.color }}
						>
							{chain.name}
						</span>
						<Copy
							value={connection.address}
							className="flex items-center text-gray-400 text-xs mt-0.5"
						>
							<span>{shortAddress}</span>
						</Copy>
					</div>
				</div>

				<button
					onClick={() => {
						disconnect(activeChain as ChainId);
						handleClose(false);
					}}
					className="p-2 rounded-full text-white/70 hover:bg-red-500 hover:text-white transition-colors"
					aria-label="Disconnect wallet"
				>
					<LogOut className="w-5 h-5" />
				</button>
			</div>

			{/* Token Balances */}
			<div className="mt-4">
				<div className="flex items-center justify-between mb-3">
					<p className="text-dark-gray-400 text-xs uppercase tracking-wider">
						Balances
					</p>
					<button
						onClick={refresh}
						disabled={isLoading}
						className="p-1.5 rounded-md text-dark-gray-400 hover:text-white hover:bg-dark-gray-700 transition-colors disabled:opacity-40"
						aria-label="Refresh balances"
					>
						<RefreshCw
							className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
						/>
					</button>
				</div>

				<div className="space-y-2">
					{balances.map((token) => (
						<div
							key={token.symbol}
							className="flex items-center justify-between p-3 bg-dark-gray-950 rounded-lg"
						>
							<div className="flex items-center gap-3">
								<Image
									src={token.logo}
									alt={token.symbol}
									width={28}
									height={28}
									className="rounded-full"
								/>
								<div className="flex flex-col">
									<span className="text-white text-sm font-semibold">
										{token.symbol}
									</span>
									<span className="text-dark-gray-400 text-xs">
										{token.name}
									</span>
								</div>
							</div>
							<span className="text-white text-sm font-medium tabular-nums">
								{formatBalance(token.balance)}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* All connected chains */}
			{Object.keys(chainConnections).length > 1 && (
				<div className="mt-6">
					<p className="text-dark-gray-400 text-xs uppercase tracking-wider mb-2">
						Connected networks
					</p>
					<div className="space-y-2">
						{Object.entries(chainConnections).map(([chainId, conn]) => {
							const c = CHAIN_DEFINITIONS.find((d) => d.id === chainId);
							return (
								<div
									key={chainId}
									className="flex items-center gap-3 p-3 bg-dark-gray-950 rounded-lg"
								>
									<span
										className="w-2.5 h-2.5 rounded-full shrink-0"
										style={{ background: c?.color ?? "#888" }}
									/>
									<div className="flex flex-col min-w-0">
										<span className="text-white text-xs font-semibold">
											{c?.name ?? chainId} · {conn.walletName}
										</span>
										<span className="text-dark-gray-400 text-xs truncate">
											{conn.address.slice(0, 10)}…{conn.address.slice(-6)}
										</span>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
};

/** Format balance to a human-friendly string */
function formatBalance(raw: string): string {
	const num = parseFloat(raw);
	if (isNaN(num)) return "0";
	if (num === 0) return "0";
	if (num < 0.0001) return "< 0.0001";
	if (num < 1) return num.toFixed(4);
	if (num < 1000) return num.toFixed(2);
	return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default WalletPortfolio;
