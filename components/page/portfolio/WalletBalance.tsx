import React from "react";
import Image from "next/image";
import CopyIcon from "@/components/icon/Icon_Copy";

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
					className="inline-flex items-center gap-1.5 relative flex-[0_0_auto]"
					style={{ zIndex: 1 }}
				>
					<div
						className="relative w-fit font-bold text-white text-[14px] whitespace-nowrap"
						style={{ opacity: 0.9 }}
					>
						My wallet:
					</div>
					<div className="relative w-fit font-bold text-white text-[14px] whitespace-nowrap">
						0x414f...4921
					</div>
					<CopyIcon className="!relative !w-[18px] !h-[18px] text-gray-400 cursor-pointer hover:text-white transition-colors ml-0.5" />
				</div>
				<Divider className="!self-stretch !w-full" type="horizontal" />

				<div
					className="flex items-center justify-between relative self-stretch w-full"
					style={{ zIndex: 1 }}
				>
					<div
						className="font-semibold text-[14px] relative w-fit whitespace-nowrap"
						style={{ color: "rgba(255, 255, 255, 0.5)" }}
					>
						Total balance
					</div>
					<div className="font-bold text-white text-[22px] leading-[32px] relative w-fit whitespace-nowrap">
						≈$1,250.00
					</div>
				</div>
			</div>
			<div
				className="flex-col items-start self-stretch w-full rounded-2xl flex relative overflow-hidden"
				style={{ background: "rgba(255, 255, 255, 0.05)" }}
			>
				<div
					className="flex items-center gap-3 py-3 px-4 relative self-stretch w-full"
					style={{
						borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
					}}
				>
					<Image
						src="/images/ada.png"
						alt="Cardano"
						width={32}
						height={32}
						className="relative w-[32px] h-[32px] rounded-full object-cover"
					/>
					<div className="items-center justify-between flex-1 flex relative">
						<div
							className="font-medium text-white text-[14px] relative w-fit whitespace-nowrap"
							style={{ opacity: 0.95 }}
						>
							Cardano
						</div>
						<div className="relative w-fit font-bold text-white text-[14px] whitespace-nowrap">
							≈$750.22
						</div>
					</div>
				</div>
				<div
					className="flex items-center gap-3 py-3 px-4 relative self-stretch w-full"
					style={{
						borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
					}}
				>
					<Image
						src="/images/bnb.png"
						alt="BNB Chain"
						width={32}
						height={32}
						className="relative w-[32px] h-[32px] rounded-full object-cover"
					/>
					<div className="items-center justify-between flex-1 flex relative">
						<div
							className="font-medium text-white text-[14px] relative w-fit whitespace-nowrap"
							style={{ opacity: 0.95 }}
						>
							BNB Chain
						</div>
						<div className="relative w-fit font-bold text-white text-[14px] whitespace-nowrap">
							≈$24.03
						</div>
					</div>
				</div>
				<div className="flex items-center gap-3 py-3 px-4 relative self-stretch w-full">
					<Image
						src="/images/eth.png"
						alt="Ethereum"
						width={32}
						height={32}
						className="relative w-[32px] h-[32px] rounded-full object-cover"
					/>
					<div className="items-center justify-between flex-1 flex relative">
						<div
							className="font-medium text-white text-[14px] relative w-fit whitespace-nowrap"
							style={{ opacity: 0.95 }}
						>
							Ethereum
						</div>
						<div className="relative w-fit font-bold text-white text-[14px] whitespace-nowrap">
							≈$475.75
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default WalletBalance;
