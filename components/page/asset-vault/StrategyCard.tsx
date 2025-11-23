import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import DoubleChevronDownIcon from "@/components/icon/Icon_DoubleChevronDown";
import QuestionInfoIcon from "@/components/icon/Icon_QuestionInfo";
import { StrategyCardData } from "@/data/strategy";
import Link from "next/link";
import React, { useState } from "react";
interface StrategyCardProps {
	data: StrategyCardData;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ data }) => {
	const [isExpanded, setIsExpanded] = useState(false);

	return (
		<div
			style={{ background: data.bgGradient }}
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
					<img
						src={data.iconUrl}
						alt={`${data.title} icon`}
						className="w-11 h-11 rounded-full border border-gray-600"
					/>
					<h3 className="text-xl font-bold text-white leading-tight">
						{data.title}
					</h3>
				</div>
			</div>

			{/* Description */}
			<p className="text-sm text-dark-gray-100 line-clamp-1 truncate text-center overflow-hidden w-full">
				{data.description}
			</p>

			{/* METRICS: Annual Return và TVL */}
			<div className="flex flex-col w-full gap-2">
				<div className="flex items-center justify-between border-t border-gray-700 pt-3 w-full">
					{/* Annual Return */}
					<div className="flex flex-col items-center justify-center w-[145px]">
						<span className="text-lg font-bold text-green-500">
							{data.annualReturn}
						</span>						
						<span className="text-sm text-green-500">Annual return</span>

					</div>


					<div className="w-px h-full bg-dark-gray-400 mx-2"></div>
					<div className="flex flex-col items-center font-exo w-[145px]">
						<span className="text-lg font-bold text-white">{data.tvl}</span>
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
								{data.subStats.maxDrawdown}
							</span>
						</div>

						<div className="flex flex-col">
							<div className="flex items-center gap-1 mb-1">
								<span className="text-sm font-light">Sharpe</span>
								<QuestionInfoIcon size={14} className="text-dark-gray-200" />
							</div>
							<span className="text-base font-bold text-white">
								{data.subStats.sharpe}
							</span>
						</div>

						<div className="flex flex-col">
							<div className="flex items-center gap-1 mb-1">
								<span className="text-sm font-light">Sortino</span>
								<QuestionInfoIcon size={14} className="text-dark-gray-200" />
							</div>
							<span className="text-base font-bold text-white">
								{data.subStats.sortino}
							</span>
						</div>

						<div className="flex flex-col">
							<div className="flex items-center gap-1 mb-1">
								<span className="text-sm font-light">Age</span>
								<QuestionInfoIcon size={14} className="text-dark-gray-200" />
							</div>
							<span className="text-base font-bold text-white">
								{data.subStats.age}
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
