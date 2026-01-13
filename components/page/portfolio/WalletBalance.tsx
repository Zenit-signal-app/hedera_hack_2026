"use client";

import React from "react";
import Image from "next/image";
import CopyIcon from "@/components/icon/Icon_Copy";
import { useWalletStore } from "@/store/walletStore";
import { useState } from "react";
import { formatTokenAmount } from "@/lib/ultils";
import { formatWallet } from "@/lib/format";
import Copy from "@/components/common/Copy";

const Divider = ({
	className,
	type,
}: {
	className?: string;
	type: "horizontal" | "vertical";
}) => (
	<div
		className={className}
		style={{
			height: type === "horizontal" ? "1px" : "auto",
			width: type === "horizontal" ? "100%" : "1px",
			background: "rgba(255, 255, 255, 0.08)",
		}}
	/>
);

const BgLiquidGlass = ({
	className,
	glassEffectClassName,
	radius,
}: {
	className?: string;
	glassEffectClassName?: string;
	radius?: string;
}) => (
	<div
		className={className}
		style={{
			position: "absolute",
			inset: 0,
			background: "rgba(30, 30, 35, 0.4)",
			backdropFilter: "blur(40px)",
			WebkitBackdropFilter: "blur(40px)",
			borderRadius: radius === "sixteen-px" ? "12px" : "16px",
			zIndex: 0,
			border: "1px solid rgba(255, 255, 255, 0.05)",
		}}
	>
		<div
			className={glassEffectClassName}
			style={{
				position: "absolute",
				inset: 0,
				background:
					"radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.08) 0%, transparent 50%)",
				borderRadius: "inherit",
			}}
		/>
	</div>
);

// Main WalletBalance Component
const WalletBalance = () => {
	const { isConnected, usedAddress, balance, isWalletInfoLoading } =
		useWalletStore();
	if (!isConnected) {
		return (
			<div className="p-6 bg-gray-900 text-white rounded-xl text-center">
				<p>Please connect your wallet to view your balance.</p>
			</div>
		);
	}
	return (
		<div
			className="flex flex-col w-full lg:w-[371px] items-start gap-3 p-3 relative rounded-[24px] overflow-hidden"
			style={{
				background: "rgba(17, 17, 19, 0.6)",
				backdropFilter: "blur(20px)",
				border: "1px solid rgba(255, 255, 255, 0.06)",
			}}
		>
			<div
				className="flex flex-col items-start justify-center gap-3 px-3 py-4 md:px-4 md:py-4 relative self-stretch w-full rounded-xl"
				style={{ position: "relative" }}
			>
				<BgLiquidGlass
					className="!absolute !left-0 !top-0 !right-0 !bottom-0"
					glassEffectClassName="!h-full !w-full"
					radius="sixteen-px"
				/>

				<div
					className="inline-flex w-full items-center gap-1.5  justify-between"
					style={{ zIndex: 1 }}
				>
					<div
						className=" w-fit font-bold text-white text-[14px] whitespace-nowrap"
						style={{ opacity: 0.9 }}
					>
						My wallet:
					</div>
					<Copy
						value={usedAddress || ""}
						className="flex items-center text-sm lg:text-base text-white font-semibold"
					>
						<span>{formatWallet(usedAddress || "", 6, 4)}</span>
					</Copy>
				</div>
			</div>
			<div
				className="flex-col items-start self-stretch w-full rounded-2xl flex relative overflow-hidden"
				style={{ background: "rgba(255, 255, 255, 0.05)" }}
			>
				{isWalletInfoLoading ? (
					<div className="text-center text-gray-400">
						Loading balance...
					</div>
				) : (
					balance.map((asset) => (
						<div
							key={asset.asset.token_id}
							className="flex w-full px-4 py-2 justify-between items-center"
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

export default WalletBalance;
