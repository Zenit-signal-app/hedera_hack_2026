import React, { useMemo } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { formatWallet } from "@/lib/format";
import { formatTokenAmount } from "@/lib/ultils";
import { SUPPORTED_WALLETS } from "@/lib/constant";
import Copy from "../common/Copy";

export const WalletPortfolio: React.FC<{
	handleClose: (o: boolean) => void;
}> = ({ handleClose }) => {
	const {
		isConnected,
		currentWalletId,
		usedAddress,
		balance,
		isWalletInfoLoading,
	} = useWalletStore();
	const { disconnect } = useWalletConnect();
	const displayAddress = usedAddress
		? formatWallet(usedAddress, 6, 4)
		: "Chưa kết nối";

	const currentWallet = useMemo(() => {
		return SUPPORTED_WALLETS.find((w) => w.id === currentWalletId);
	}, [currentWalletId]);
	if (!isConnected) {
		return (
			<div className="p-6 bg-gray-900 text-white rounded-xl text-center">
				<p>Vui lòng kết nối ví để xem danh mục tài sản.</p>
			</div>
		);
	}

	return (
		<div className="w-full h-screen mx-auto  bg-gray-800 rounded-2xl shadow-2xl font-sans py-10 px-4">
			<div className="flex justify-between items-center pb-4">
				<div className="flex items-center space-x-3">
					<Image
						src={currentWallet?.icon || "/images/eternl.png"}
						alt={currentWallet?.name || "Wallet"}
						width={32}
						height={32}
						className="rounded-full"
					/>
					<div className="flex flex-col">
						<span className="text-white font-bold text-lg capitalize">
							{currentWalletId}
						</span>

						<Copy value={usedAddress || ""} className="flex items-center text-gray-400 text-sm">
							<span>{displayAddress}</span>
						</Copy>
					</div>
				</div>

				<button
					onClick={() => {
						disconnect();
						handleClose(false);
					}}
					className="p-2 rounded-full text-white/70 hover:bg-red-500 hover:text-white transition-colors"
					aria-label="Disconnect wallet"
				>
					<LogOut className="w-5 h-5" />
				</button>
			</div>

			<div className="mt-6  flex justify-between items-center pb-2">
				<div className="flex space-x-6 text-sm font-semibold">
					<span className="text-white border-b-2 border-purple-500 pb-2">
						Tokens
					</span>
				</div>
			</div>

			<div className="mt-4 space-y-4">
				{isWalletInfoLoading ? (
					<div className="text-center text-gray-400">
						Đang tải tài sản...
					</div>
				) : (
					balance.map((asset) => (
						<div
							key={asset.asset.token_id}
							className="flex justify-between items-center"
						>
							<div className="flex items-center space-x-3">
								<Image
									src={asset.asset.logo}
									alt={asset.asset.ticker}
									width={30}
									height={30}
									className="rounded-full"
								/>
								<div className="flex flex-col">
									<span className="text-white font-medium">
										{asset.asset.ticker}
									</span>
									<span className="text-gray-500 text-xs">
										{asset.asset.project_name}
									</span>
								</div>
							</div>

							<div className="flex flex-col items-end">
								<span className="text-white font-bold">
									{formatTokenAmount(
										asset.amount,
										asset.asset.decimals
									)}
								</span>
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
};

export default WalletPortfolio;
