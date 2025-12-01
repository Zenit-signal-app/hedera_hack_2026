import React, { useMemo } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import Image from "next/image";
import { LogOut, Copy } from "lucide-react";
import { formatWallet } from "@/lib/format";
import { formatNumber } from "@/lib/format";

interface Asset {
	symbol: string;
	name: string;
	balance: number; // Số lượng token
	usdValue: number; // Giá trị USD (đã tính toán)
	iconUrl: string;
}

const mockWalletAssets: Asset[] = [
	{
		symbol: "ADA",
		name: "Cardano",
		balance: 26.908407,
		usdValue: 10.397,
		iconUrl: "/images/ada.png",
	},
	{
		symbol: "SNEK",
		name: "Snek",
		balance: 587,
		usdValue: 0.784,
		iconUrl: "/images/snek.png",
	},
];



export const WalletPortfolio: React.FC< {handleClose: (o: boolean) =>void }> = ({handleClose}) => {
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
						src="/images/eternl.png" // Thay bằng icon ví Eternl
						alt="Eternl"
						width={32}
						height={32}
						className="rounded-full"
					/>
					<div className="flex flex-col">
						<span className="text-white font-bold text-lg">
							{currentWalletId}
						</span>
						<div className="flex items-center text-gray-400 text-sm">
							<span>{displayAddress}</span>
							<button
								className="ml-1 text-gray-500 hover:text-white"
								onClick={() =>
									navigator.clipboard.writeText(
										usedAddress || ""
									)
								}
							>
								<Copy className="w-3 h-3" />
							</button>
						</div>
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
									{asset.asset.ticker === "ADA" ? formatNumber(Number(asset.amount)/1000000, 4) :formatNumber(asset.amount, 4)}
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
