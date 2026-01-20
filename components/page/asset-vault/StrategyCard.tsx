import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import DoubleChevronDownIcon from "@/components/icon/Icon_DoubleChevronDown";
import QuestionInfoIcon from "@/components/icon/Icon_QuestionInfo";
import { Vault } from "@/types/vault";
import Image from "next/image";
import Link from "next/link";
import React, { useState } from "react";

interface StrategyCardProps {
	data: Vault;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ data }) => {
	const [isExpanded, setIsExpanded] = useState(false);

	// Calculate gradient based on vault state
	const getGradient = (state: string) => {
		switch (state) {
			case 'accepting_deposits':
				return "linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(21, 128, 61, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)";
			case 'trading':
				return "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(30, 58, 138, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)";
			case 'settled':
				return "linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(107, 33, 168, 0.05) 50%, rgba(0, 0, 0, 0.8) 100%)";
			case 'closed':
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
	const calculateAge = (startTime: string) => {
		const start = new Date(startTime);
		const now = new Date();
		const diffTime = Math.abs(now.getTime() - start.getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
		return `${diffDays} days`;
	};

	return (
		<div
			style={{ background: getGradient(data.state) }}
			className=" 
      text-white 
      hover:border-primary-500 
      rounded-2xl 
      border border-gray-700 
      p-3 
      gap-4
      min-w-[300px]
      transition-all duration-300 
      flex flex-col
      justify-center
      items-start
      isolate
      background-box
    ">
			<div className="flex items-start justify-between w-full">
				<div className="flex items-center flex-col w-full gap-y-2">
					<Image
						src={data?.icon_url || "/images/ada.png"}
						alt={`${data.vault_name} icon`}
						className="w-11 h-11 rounded-full border border-gray-600"
						width={44}
						height={44}
					/>
					<h3 className="text-xl font-bold text-white leading-tight">
						{data.vault_name}
					</h3>
				</div>
			</div>

			{/* Description */}
			<p className="text-sm text-dark-gray-100 line-clamp-1 truncate text-center overflow-hidden w-full">
				{data.summary || "No description available"}
			</p>

			{/* METRICS: Annual Return và TVL */}
			<div className="flex flex-col w-full gap-2">
				<div className="flex items-center justify-between border-t border-gray-700 pt-3 w-full">
					{/* Annual Return */}
					<div className="flex flex-col items-center justify-center w-[145px]">
						<span className="text-lg font-bold text-green-500">
							{data.annual_return.toFixed(1)}%
						</span>						
						<span className="text-sm text-green-500">Annual return</span>

					</div>


					<div className="w-px h-full bg-dark-gray-400 mx-2"></div>
					<div className="flex flex-col items-center font-exo w-[145px]">
						<span className="text-lg font-bold text-white">{formatCurrency(data.tvl_usd)}</span>
						<span className="text-sm text-white underline">TVL</span>
					</div>

				<button
					onClick={() => setIsExpanded(!isExpanded)}
					className={`p-1.5 rounded-sm border border-dark-gray-400 text-gray-300 hover:bg-[rgba(75,75,75,0.15)] transition px-1 py-3.5 cursor-pointer ${isExpanded ? "bg-[rgba(75,75,75,0.15)]" : "bg-transparent"}`}>
						<DoubleChevronDownIcon
							size={24}
							className={`transition-transform duration-300 ${
								isExpanded ? "rotate-180" : ""
							}`}
						/>
					</button>
				</div>

			{/* Sub Stats - Expandable */}
			{isExpanded && (
				<div className="sub-stats-glass rounded-lg p-3 grid grid-cols-2 gap-3 w-full">
						<div className="flex flex-col">
							<div className="flex items-center gap-1 mb-1">
								<span className="text-sm font-light">
									Max drawdown
								</span>
								<QuestionInfoIcon size={14} className="text-dark-gray-200" />
							</div>
							<span className="text-base font-bold text-white">
								{data.max_drawdown ? `${data.max_drawdown.toFixed(1)}%` : "N/A"}
							</span>
						</div>

						<div className="flex flex-col">
							<div className="flex items-center gap-1 mb-1">
								<span className="text-sm font-light">State</span>
								<QuestionInfoIcon size={14} className="text-dark-gray-200" />
							</div>
							<span className="text-base font-bold text-white capitalize">
								{data.state.replace(/_/g, " ")}
							</span>
						</div>

						<div className="flex flex-col col-span-2">
							<div className="flex items-center gap-1 mb-1">
								<span className="text-sm font-light">Age</span>
								<QuestionInfoIcon size={14} className="text-dark-gray-200" />
							</div>
							<span className="text-base font-bold text-white">
								{calculateAge(data.start_time)}
							</span>
						</div>
					</div>
				)}
			</div>
			<Link
				href={`/asset-vault/${data.id}`}
				className="
        w-full 
        py-2 text-sm font-museomoderno bg-primary-700 
        text-white 
        font-semibold 
        rounded-md
        text-center
        hover:bg-primary-600 
        transition duration-200">
				Invest
			</Link>
		</div>
	);
};

export default StrategyCard;
