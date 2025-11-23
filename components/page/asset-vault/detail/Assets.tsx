import { StrategyCardData } from "@/data/strategy";
import { dashboardData } from "@/data/dashboard-assets";
import CommonComboChart from "@/components/common/chart/Combo";
import Icon_QuestionInfo from "@/components/icon/Icon_QuestionInfo";

interface AssetsProps {
	data: StrategyCardData;
}

const Assets = ({ data }: AssetsProps) => {
	const filterOptions = [
		{ key: "1W", label: "1W" },
		{ key: "1M", label: "1M" },
		{ key: "3M", label: "3M" },
		{ key: "Max", label: "Max" },
	];

	return (
		<div className="bg-[#111113] bg-center bg-cover bg-no-repeat pt-6 px-4 pb-6 rounded-4xl border border-dark-gray-700">
			{/* Header Text */}
			<div className="mb-4">
				<p className="text-sm text-dark-gray-100">
					Displaying live trading metrics. This strategy has been live{" "}
					<span className="text-white font-semibold">250 days</span>.
				</p>
			</div>

			{/* Combo Chart - TVL Line + Netflow Bar */}
			<div className="mb-6">
				<CommonComboChart
					data={dashboardData.comboChart.points}
					lineColor="#EC4B6B"
					barColor="#10B981"
					dataKeyX="date"
					dataKeyLine="tvl"
					dataKeyBar="netflow"
					timeFilters={filterOptions}
					headerTitle={
						<div className="flex flex-col justify-center items-start pt-4">
							<div className="font-bold text-[20px] leading-[28px] tracking-[0.1px] text-white flex-none order-0 grow-0">
								Total value locked
							</div>
							<div className="text-[14px] leading-3xl tracking-[0.1px] text-[#797B86] flex-none order-1 grow-0">
								Learn more about{" "}
								<span className="underline cursor-pointer">
									TVL
								</span>{" "}
								and{" "}
								<span className="underline cursor-pointer">
									Netflow
								</span>{" "}
								metrics and how they're calculated.
							</div>
						</div>
					}
					height={350}
				/>
			</div>

			{/* Divider */}
			<div className="w-full h-px bg-dark-gray-700 my-6 -mx-xl"></div>

			{/* Fees Table */}
			<div>
				<h3 className="text-[20px] font-bold leading-[28px] tracking-[0.1px] text-white mb-6">
					Fees
				</h3>
				<div className="bg-dark-glass px-3 space-y-0 w-[387px] rounded-md relative">
					{dashboardData.feesTable.map((fee, index) => (
						<div
							key={index}
							className={`flex items-center py-4 ${
								index < dashboardData.feesTable.length - 1
									? "border-b border-dark-gray-800"
									: ""
							}`}
						>
							{/* Left side - Label */}
							<div className="flex-1 flex items-center gap-2">
								<span className="text-sm text-dark-gray-100">
									{fee.label}
								</span>
								<Icon_QuestionInfo className="w-4 h-4 text-dark-gray-400 cursor-pointer hover:text-dark-gray-200 transition-colors" />
							</div>

							{/* Spacer for divider */}
							<div className="w-8"></div>

							{/* Right side - Value */}
							<div className="shrink-0 w-[60px]">
								<span className="text-sm font-semibold text-white">
									{fee.value}
								</span>
							</div>
						</div>
					))}

					{/* Vertical divider - absolute to overlay horizontal borders */}
					<div
						className="absolute top-0 bottom-0 w-px bg-dark-gray-800"
						style={{ right: "90px" }}
					></div>
				</div>
			</div>
		</div>
	);
};

export default Assets;
