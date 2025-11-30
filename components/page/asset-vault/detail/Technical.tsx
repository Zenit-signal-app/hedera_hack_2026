import { StrategyCardData } from "@/data/strategy";
import { useState } from "react";

interface TechnicalProps {
	data: StrategyCardData;
}

const statusMetrics = [
	{ metric: "Status last updated", value: "5 minutes ago" },
	{ metric: "Last restarted", value: "19 days ago" },
	{ metric: "First started", value: "2025-02-19 22:03 UTC" },
	{ metric: "Trading cycles since restart", value: 114 },
	{ metric: "Total trading cycles", value: 1824 },
	{ metric: "Take profit/stop loss checks", value: 8810 },
	{ metric: "Position reevaluations", value: 0 },
	{ metric: "Version", value: "v1185" },
	{
		metric: "Hot wallet address",
		value: "0x54dA73fF2FD84DF99fdD6f01b0b4CCb0e28Cc2Fd9",
	},
	{ metric: "Hot wallet gas balance", value: "0.03717 ETH" },
];

const Technical = ({ data }: TechnicalProps) => {
	const [activeTab, setActiveTab] = useState("Status");

	const tabs = ["Status", "Logs", "Analysis", "Decision making"];

	return (
		<div className="bg-[#111113] bg-center bg-cover bg-no-repeat p-4 rounded-4xl border border-dark-gray-700">
			<div className="pb-6">
				<h3 className="text-[20px] font-bold text-white">
					Technical details
				</h3>
			</div>
			{/* Tabs Header */}
			<div className="flex justify-between items-center gap-4 mb-6">
				<div className="flex items-center p-1 gap-0.5 bg-dark-gray-900 rounded-lg w-fit">
					{tabs.map((tab) => (
						<button
							key={tab}
							onClick={() => setActiveTab(tab)}
							className={`flex justify-center cursor-pointer items-center px-3 py-1.5 gap-1 rounded-lg transition-all duration-200 ${
								activeTab === tab
									? "bg-white"
									: "bg-dark-gray-900"
							}`}
						>
							<span
								className={`font-museo font-medium text-sm leading-6 tracking-[0.1px] ${
									activeTab === tab
										? "text-[#893BFF]"
										: "text-[#797B86]"
								}`}
							>
								{tab}
							</span>
						</button>
					))}
				</div>
			</div>

			{/* Status Table - Only show when Status tab is active */}
			<>
				<div className="mb-6 w-full">
					{/* Header */}
					<div className="flex flex-row items-center justify-between w-full pb-3 px-4">
						<div className="flex flex-row items-center px-0">
							<span className="text-sm font-medium text-[#797B86]">
								Status metric
							</span>
						</div>
						<div className="flex text-[14px] flex-row items-center justify-end px-0">
							<span className="text-sm font-medium text-[#797B86]">
								Value
							</span>
						</div>
					</div>

					{/* Data Rows */}
					<div className="flex flex-col gap-0 w-full">
						{statusMetrics.map((item, index) => (
							<div
								key={index}
								className={`flex flex-row items-center justify-between w-full h-11 rounded-lg ${
									index % 2 === 0 ? "bg-dark-gray-900" : ""
								}`}
							>
								{/* Left Cell */}
								<div className="flex flex-row items-center py-1 pr-2 pl-4 gap-2 flex-1">
									<span className="font-semibold text-sm leading-6 tracking-[0.1px] text-white">
										{item.metric}
									</span>
								</div>
								{/* Right Cell */}
								<div className="flex flex-row items-center justify-end py-1 px-2 gap-2 flex-1">
									<span className="font-semibold text-sm leading-6 tracking-[0.1px] text-white">
										{item.value}
									</span>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Divider */}
				<div className="w-full h-px bg-dark-gray-700 my-6"></div>

				{/* Source code block */}
				<div className="mb-6">
					<h4 className="text-[16px] font-semibold text-white mb-3">
						Source code
					</h4>
					<p className="text-sm text-dark-gray-100">
						The source code of the All-time high on Base strategy
					</p>
				</div>

				{/* Divider */}
				<div className="w-full h-px bg-dark-gray-700 my-6"></div>

				{/* Backtest result block */}
				<div>
					<h4 className="text-[16px] font-semibold text-white mb-3">
						Backtest result
					</h4>
					{/* Backtest result content will go here */}
					<p className="text-sm text-dark-gray-100">
						You can find the backtest results for this strategy
						below.
					</p>
				</div>
			</>
		</div>
	);
};

export default Technical;
