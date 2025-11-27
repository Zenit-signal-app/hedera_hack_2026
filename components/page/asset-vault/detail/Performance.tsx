import { StrategyCardData } from "@/data/strategy";
import CommonLineChart, {
	ChartDataPoint,
	TimeFilterOption,
} from "@/components/common/chart/Line";
import { useState } from "react";
import {
	performanceSummaryData,
	PerformanceMetric,
} from "@/data/performance-metrics";
import Input from "@/components/common/input";
import SearchIcon from "@/components/icon/Icon_ Search";
import { useIsMobile } from "@/src/components/hooks/useIsMobile";

interface PerformanceProps {
	data: StrategyCardData;
}
const mockData: ChartDataPoint[] = [
	// August - High volatility, downward trend
	{ date: "Aug 1", value: 100 },
	{ date: "Aug 3", value: 105 },
	{ date: "Aug 5", value: 95 },
	{ date: "Aug 7", value: 102 },
	{ date: "Aug 9", value: 110 },
	{ date: "Aug 11", value: 115 },
	{ date: "Aug 13", value: 108 },
	{ date: "Aug 15", value: 120 },
	{ date: "Aug 17", value: 112 },
	{ date: "Aug 19", value: 105 },
	{ date: "Aug 21", value: 98 },
	{ date: "Aug 23", value: 102 },
	{ date: "Aug 25", value: 95 },
	{ date: "Aug 27", value: 88 },
	{ date: "Aug 29", value: 92 },

	// September - Sharp decline then stabilization
	{ date: "Sep 1", value: 85 },
	{ date: "Sep 3", value: 82 },
	{ date: "Sep 5", value: 78 },
	{ date: "Sep 7", value: 75 },
	{ date: "Sep 9", value: 73 },
	{ date: "Sep 11", value: 71 },
	{ date: "Sep 13", value: 72 },
	{ date: "Sep 15", value: 74 },
	{ date: "Sep 17", value: 76 },
	{ date: "Sep 19", value: 75 },
	{ date: "Sep 21", value: 74 },
	{ date: "Sep 23", value: 73 },
	{ date: "Sep 25", value: 75 },
	{ date: "Sep 27", value: 74 },
	{ date: "Sep 29", value: 76 },

	// October - Flat with minor fluctuations
	{ date: "Oct 1", value: 75 },
	{ date: "Oct 3", value: 76 },
	{ date: "Oct 5", value: 74 },
	{ date: "Oct 7", value: 75 },
	{ date: "Oct 9", value: 73 },
	{ date: "Oct 11", value: 74 },
	{ date: "Oct 13", value: 72 },
	{ date: "Oct 15", value: 73 },
	{ date: "Oct 17", value: 71 },
	{ date: "Oct 19", value: 72 },
	{ date: "Oct 21", value: 70 },
	{ date: "Oct 23", value: 71 },
	{ date: "Oct 25", value: 72 },
	{ date: "Oct 27", value: 71 },
	{ date: "Oct 29", value: 70 },
	{ date: "Oct 31", value: 69 },

	// November - Slight recovery then spike
	{ date: "Nov 2", value: 70 },
	{ date: "Nov 4", value: 72 },
	{ date: "Nov 6", value: 71 },
	{ date: "Nov 8", value: 73 },
	{ date: "Nov 10", value: 72 },
	{ date: "Nov 12", value: 74 },
	{ date: "Nov 14", value: 76 },
	{ date: "Nov 16", value: 78 },
	{ date: "Nov 18", value: 82 },
	{ date: "Nov 20", value: 95 },
	{ date: "Nov 21", value: 108 },
	{ date: "Nov 22", value: 105 },
	{ date: "Nov 23", value: 98 },
];

// Desktop Table Component
interface DesktopTableProps {
	filteredMetrics: PerformanceMetric[];
}

const DesktopTable = ({ filteredMetrics }: DesktopTableProps) => {
	return (
		<div className="overflow-x-auto">
			<table className="w-full border-separate border-spacing-y-0.5">
				<thead>
					<tr className="bg-[#19191B] border-b border-dark-gray-700">
						<th className="text-left py-2 px-4 pl-4 font-quicksand font-semibold text-sm text-[#797B86] tracking-[0.1px]">
							Metric
						</th>
						<th className="text-right py-2 px-2 font-quicksand font-semibold text-sm text-[#797B86] tracking-[0.1px]">
							All
						</th>
						<th className="text-right py-2 px-2 font-quicksand font-semibold text-sm text-[#797B86] tracking-[0.1px]">
							Long
						</th>
						<th className="text-right py-2 px-2 pr-4 font-quicksand font-semibold text-sm text-[#797B86] tracking-[0.1px]">
							Short
						</th>
					</tr>
				</thead>
				<tbody>
					{filteredMetrics.map((metric, index) => (
						<tr
							key={index}
							className={
								index % 2 === 0
									? "bg-transparent"
									: "bg-dark-gray-900 rounded-lg"
							}
						>
							<td
								className={`py-2 px-4 font-quicksand text-sm text-white tracking-[0.1px] ${
									index % 2 === 1 ? "rounded-l-lg" : ""
								}`}
							>
								{metric.label}
							</td>
							<td className="text-right py-2 px-2 font-quicksand text-sm text-white tracking-[0.1px]">
								{metric.long !== null &&
								metric.long !== undefined
									? metric.long
									: "-"}
							</td>
							<td className="text-right py-2 px-2 font-quicksand text-sm text-white tracking-[0.1px]">
								{metric.short !== null &&
								metric.short !== undefined
									? metric.short
									: "-"}
							</td>
							<td
								className={`text-right py-2 px-2 pr-4 font-quicksand text-sm text-white tracking-[0.1px] ${
									index % 2 === 1 ? "rounded-r-lg" : ""
								}`}
							>
								{metric.trend !== null &&
								metric.trend !== undefined
									? metric.trend
									: "-"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};

// Mobile Card View Component
interface MobileCardViewProps {
	filteredMetrics: PerformanceMetric[];
}

const MobileCardView = ({ filteredMetrics }: MobileCardViewProps) => {
	return (
		<div className="rounded-lg overflow-hidden">
			{/* Header: All, Long, Short */}
			<div className="pl-4 py-3 border-b border-dark-gray-700">
				<div className="w-4/5 ml-auto grid grid-cols-3 gap-4 text-center">
					<p className="text-[#797B86] text-xs font-semibold font-quicksand">
						All
					</p>
					<p className="text-[#797B86] text-xs font-semibold font-quicksand">
						Long
					</p>
					<p className="text-[#797B86] text-xs font-semibold font-quicksand">
						Short
					</p>
				</div>
			</div>

			{/* Data Rows */}
			{filteredMetrics.map((metric, idx) => (
				<div
					key={idx}
					className={`rounded-md bg-[#19191B] ${
						idx % 2 === 0 ? "bg-transparent" : ""
					}`}
				>
					{/* Metric Name - Full Width, Text Left */}
					<div className="px-4 py-3">
						<h3 className="text-[#A373FF] font-medium text-sm text-left font-quicksand tracking-[0.1px]">
							{metric.label}
						</h3>
					</div>

					{/* Data Row - 70% width right aligned, Text Center, Black Background */}
					<div className="pl-4 py-3">
						<div className="w-4/5 ml-auto grid grid-cols-3 gap-4 text-center">
							<p className="text-white font-quicksand text-sm tracking-[0.1px]">
								{metric.long !== null &&
								metric.long !== undefined
									? metric.long
									: "-"}
							</p>
							<p className="text-white font-quicksand text-sm tracking-[0.1px]">
								{metric.short !== null &&
								metric.short !== undefined
									? metric.short
									: "-"}
							</p>
							<p className="text-white font-quicksand text-sm tracking-[0.1px]">
								{metric.trend !== null &&
								metric.trend !== undefined
									? metric.trend
									: "-"}
							</p>
						</div>
					</div>
				</div>
			))}
		</div>
	);
};

const Performance = ({ data }: PerformanceProps) => {
	const [activeTab, setActiveTab] = useState<"live" | "backtest">("live");
	const [filterMetrics, setFilterMetrics] = useState("");
	const isMobile = useIsMobile();

	const filterOptions: TimeFilterOption[] = [
		{ key: "1W", label: "1W" },
		{ key: "1M", label: "1M" },
		{ key: "3M", label: "3M" },
		{ key: "MAX", label: "Max" },
	];

	// Filter metrics based on search
	const filteredMetrics = performanceSummaryData.metrics.filter((metric) =>
		metric.label.toLowerCase().includes(filterMetrics.toLowerCase())
	);

	return (
		<div className="bg-[#111113] rounded-2xl p-4 border border-dark-gray-700">
			{/* Chart Section with Tabs */}
			<div className="mb-6">
				{/* Tabs Header */}
				<div className="flex flex-col tablet:flex-row justify-between  item-start tablet:items-center gap-4 mb-4">
					{/* Horizontal Tabs */}
					<div className="flex item-center p-1 gap-0.5 bg-dark-gray-900 rounded-lg w-fit">
						<button
							onClick={() => setActiveTab("live")}
							className={`flex justify-center cursor-pointer items-center px-3 py-1.5 gap-1 rounded-lg transition-all duration-200 ${
								activeTab === "live"
									? "bg-white"
									: "bg-dark-gray-900"
							}`}
						>
							<span
								className={`font-museo font-medium text-sm leading-6 tracking-[0.1px] ${
									activeTab === "live"
										? "text-[#893BFF]"
										: "text-[#797B86]"
								}`}
							>
								Live trading
							</span>
						</button>
						<button
							onClick={() => setActiveTab("backtest")}
							className={`flex cursor-pointer justify-center items-center px-3 py-1.5 gap-1 rounded-lg transition-all duration-200 ${
								activeTab === "backtest"
									? "bg-white"
									: "bg-dark-gray-900"
							}`}
						>
							<span
								className={`font-museo font-medium text-sm leading-6 tracking-[0.1px] ${
									activeTab === "backtest"
										? "text-[#893BFF]"
										: "text-[#797B86]"
								}`}
							>
								Backtesting
							</span>
						</button>
					</div>

					{/* Right Text */}
					<div className="font-quicksand font-medium text-sm leading-6 tracking-[0.1px] text-[#B2B3BD]">
						Viewing performance based on{" "}
						<span className="text-white">
							{activeTab === "live"
								? "live trading"
								: "backtesting"}
						</span>{" "}
						data
					</div>
				</div>

				{/* Chart */}
				<CommonLineChart
					data={mockData}
					lineColor="#EC4B6B"
					dataKeyX="date"
					dataKeyY="value"
					timeFilters={filterOptions}
					headerTitle={
						<div className="flex flex-col justify-center items-start pt-4 px-2">
							<div className="font-bold text-[20px] leading-[28px] tracking-[0.1px] text-white flex-none order-0 grow-0">
								Performance
							</div>
							<div className="text-[14px] leading-3xl tracking-[0.1px] text-[#797B86] flex-none order-1 grow-0">
								Compounded{" "}
								<span className="underline">profitability</span>{" "}
								based on live trading data
							</div>
						</div>
					}
					height={300}
				/>
			</div>

			{/* Divider */}
			<div className="my-6 h-px bg-dark-gray-700 tablet:-mx-xl"></div>

			{/* Performance Summary Section */}
			<div className="pb-6">
				{/* Header with Title + Filter */}
				<div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
					<div>
						<h3 className="text-base md:text-lg font-bold text-white mb-2">
							Performance summary
						</h3>
						<p className="text-sm md:text-sm text-dark-gray-200">
							{performanceSummaryData.strategy}
						</p>
					</div>

					<div className="flex flex-col items-start gap-1.5 w-full md:w-[270px] md:max-w-[270px] h-10">
						<div className="flex items-center px-3 py-2 gap-2 w-full h-10 bg-[#19191B] border border-dark-gray-700 rounded-lg">
							<SearchIcon className="w-5 h-5 text-[#B2B3BD] flex-none" />
							<input
								type="text"
								placeholder="Filter metrics"
								value={filterMetrics}
								onChange={(e) =>
									setFilterMetrics(e.target.value)
								}
								className="w-full h-6 bg-transparent outline-none font-museo font-normal text-sm leading-6 tracking-[0.1px] text-white placeholder:text-[#B2B3BD]"
							/>
						</div>
					</div>
				</div>

				{/* Performance Table - Desktop and Mobile Views */}
				{isMobile ? (
					<MobileCardView filteredMetrics={filteredMetrics} />
				) : (
					<DesktopTable filteredMetrics={filteredMetrics} />
				)}
			</div>
		</div>
	);
};

export default Performance;
