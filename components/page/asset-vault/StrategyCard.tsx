import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import DoubleChevronDownIcon from "@/components/icon/Icon_DoubleChevronDown";
import QuestionInfoIcon from "@/components/icon/Icon_QuestionInfo";
import { Vault } from "@/types/vault";
import Image from "next/image";
import Link from "next/link";
import React, { useMemo, useState } from "react";

interface StrategyCardProps {
	data: Vault;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ data }) => {
	const [isExpanded, setIsExpanded] = useState(false);

	// Calculate gradient based on vault state
	const getGradient = (state: string) => {
		switch (state) {
			case "accepting_deposits":
				return "linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(21, 128, 61, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)";
			case "trading":
				return "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(30, 58, 138, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)";
			case "settled":
				return "linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(107, 33, 168, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)";
			case "closed":
				return "linear-gradient(135deg, rgba(107, 114, 128, 0.15) 0%, rgba(55, 65, 81, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)";
			default:
				return "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(30, 58, 138, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)";
		}
	};

	// Format currency
	const formatCurrency = (value: number) => {
		if (value >= 1_000_000) {
			return `$${(value / 1_000_000).toFixed(1)}M`;
		} else if (value >= 1_000) {
			return `$${(value / 1_000).toFixed(1)}K`;
		}
		return `$${value.toFixed(2)}`;
	};

	// Calculate days since start
	const calculateAge = (startTime: string | number) => {
		const start = new Date(startTime);
		const now = new Date();
		const diffTime = Math.abs(now.getTime() - start.getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
		return `${diffDays} days`;
	};

	const statusColor = useMemo(() => {
		switch (data.state) {
			case "withdrawable":
				return {
					dot: "bg-blue-400",
					box: "bg-blue-400/20 text-blue-400",
				};
			case "trading":
				return {
					dot: "bg-yellow-500",
					box: "bg-yellow-500/20 text-yellow-500",
				};
			case "closed":
				return {
					dot: "bg-red-500",
					box: "bg-red-400/20 text-red-500",
				};
			default:
				return {
					dot: "bg-green-400",
					box: "bg-green-400/20 text-green-400",
				};
		}
	}, [data.state]);

	return (
		<div className="relative text-white border-dark-gray-400 rounded-2xl border p-3 gap-2 min-w-[300px] max-w-[500px] transition-all duration-300 flex flex-col items-center bg-black">
			{/* Icon and Status Badge */}
			<div className="flex items-center justify-center w-full relative">
				<Image
					src={data?.icon_url || "/images/ada.png"}
					alt={`${data.vault_name} icon`}
					className="w-16 h-16 rounded-full"
					width={64}
					height={64}
				/>
				<div
					className={`absolute top-0 right-6 flex items-center gap-2 ${statusColor.box} rounded-full px-3 py-1`}
				>
					<div
						className={`w-2 h-2 rounded-full ${statusColor.dot}`}
					></div>
					<span className="text-sm font-semibold capitalize">
						{data.state.replace(/_/g, " ")}
					</span>
				</div>
			</div>

			{/* Title and Description */}
			<div className="flex flex-col items-center text-center w-full gap-2">
				<h3 className="text-2xl font-bold text-white truncate w-full">
					{data.vault_name}
				</h3>
				<p className="text-base text-gray-400 truncate w-full">
					{data.summary || "No description available"}
				</p>
			</div>

			{/* Metrics Section */}
			<div className="flex items-center justify-center w-full gap-4">
				{/* Annual Return */}
				<div className="flex flex-col items-center flex-1">
					<span className="text-3xl font-bold text-green-500">
						{data.annual_return.toFixed(1)}%
					</span>
					<span className="text-sm text-green-500 mt-1">
						Annual return
					</span>
				</div>

				{/* Divider */}
				<div className="w-px h-16 bg-gray-600"></div>

				{/* TVL */}
				<div className="flex flex-col items-center flex-1">
					<span className="text-3xl font-bold text-white">
						{formatCurrency(data.tvl_usd)}
					</span>
					<span className="text-sm text-white underline mt-1">
						TVL
					</span>
				</div>

				{/* Expand Button */}
				<button
					onClick={() => setIsExpanded(!isExpanded)}
					className={`p-2 rounded border border-gray-600 text-gray-300 hover:bg-gray-800 transition ${
						isExpanded ? "bg-gray-800" : "bg-transparent"
					}`}
				>
					<DoubleChevronDownIcon
						size={24}
						className={`transition-transform duration-300 ${
							isExpanded ? "rotate-180" : ""
						}`}
					/>
				</button>
			</div>

			{/* Expandable Stats */}
			{isExpanded && (
				<div className="bg-gray-800/50 rounded-lg p-4 flex items-center justify-around gap-4 w-full">
					<div className="flex flex-col items-center">
						<div className="flex items-center gap-1 mb-1">
							<span className="text-sm text-gray-400">
								Max drawdown
							</span>
							<QuestionInfoIcon
								size={14}
								className="text-gray-400"
							/>
						</div>
						<span className="text-lg font-bold text-white">
							{data.max_drawdown
								? `${data.max_drawdown.toFixed(1)}%`
								: "N/A"}
						</span>
					</div>

					<div className="flex flex-col items-center">
						<div className="flex items-center gap-1 mb-1">
							<span className="text-sm text-gray-400">Age</span>
							<QuestionInfoIcon
								size={14}
								className="text-gray-400"
							/>
						</div>
						<span className="text-lg font-bold text-white">
							{calculateAge(Number(data.start_time) * 1000)}
						</span>
					</div>
				</div>
			)}

			{/* Invest Button */}
			<Link
				href={`/asset-vault/${data.id}`}
				className="w-full py-3 text-base font-museomoderno font-semibold bg-primary-700 text-white rounded-lg text-center hover:bg-primary-600 transition duration-200"
			>
				Invest
			</Link>
		</div>
	);
};

export default StrategyCard;
