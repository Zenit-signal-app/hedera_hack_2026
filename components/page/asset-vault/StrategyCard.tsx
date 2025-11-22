import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import DoubleChevronDownIcon from "@/components/icon/Icon_DoubleChevronDown";
import { StrategyCardData } from "@/data/strategy";
import Link from "next/link";
import React from "react";
interface StrategyCardProps {
	data: StrategyCardData;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ data }) => {
	return (
		<div
			className=" 
     bg-black
      text-white 
      hover:border-primary-500 
      hover:text-black 
      rounded-2xl 
      border border-gray-700 
      hover:bg-opacity-40
      p-4 
      transition-all duration-300 
      flex flex-col
      background-box
    ">
			<div className="flex items-start justify-between mb-4">
				<div className="flex items-center flex-col w-full gap-y-2">
					<img
						src={data.iconUrl}
						alt={`${data.title} icon`}
						className="w-8 h-8 rounded-full border border-gray-600"
					/>
					<h3 className="text-xl font-bold text-white leading-tight">
						{data.title}
					</h3>
				</div>
			</div>

			{/* Description */}
			<p className="text-sm text-gray-100 mb-4 h-10 line-clamp-1 truncate text-center overflow-hidden">
				{data.description}
			</p>

			{/* METRICS: Annual Return và TVL */}
			<div className="flex items-center justify-between border-t border-gray-700 pt-3">
				{/* Annual Return */}
				<div className="flex flex-col items-center justify-center w-[145px]">
					<span className="text-sm text-green-500">Annual return</span>
					<span className="text-lg font-bold text-green-500">
						{data.annualReturn}
					</span>
				</div>
				<div className="w-px h-full bg-dark-gray-400 mx-2"></div>
				<div className="flex flex-col items-center font-exo w-[145px]">
					<span className="text-lg font-bold text-white">{data.tvl}</span>
					<span className="text-sm text-white underline">TVL</span>
				</div>

				<button className="p-1.5 rounded-sm  bg-transparent border  border-dark-gray-400 text-gray-300 hover:bg-gray-600 transition px-1 py-3.5">
					<DoubleChevronDownIcon size={24} />
				</button>
			</div>
			<Link
				href={`/asset-vault/${data.id}`}
				className="
        mt-4 
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
