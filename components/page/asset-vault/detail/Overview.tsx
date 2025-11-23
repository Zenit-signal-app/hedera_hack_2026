import CommonLineChart, {
	ChartDataPoint,
	TimeFilterOption,
} from "@/components/common/chart/Line";
import GrowDownIcon from "@/components/icon/Icon_GrowDown";
import { StrategyCardData } from "@/data/strategy";
import MyDeposits from "./MyDeposits";
import CopyIcon from "@/components/icon/Icon_Copy";
import ArrowUpRightIcon from "@/components/icon/Icon_ArrowUpRight";
import QuestionInfoIcon from "@/components/icon/Icon_QuestionInfo";
import Image from "next/image";
import { strategyDescriptionContent } from "@/data/strategy-description";

// Main Overview Component
const Overview = ({ data }: { data: StrategyCardData }) => {
	const mockData: ChartDataPoint[] = [
		{ date: "Aug 1", value: 100 },
		{ date: "Aug 8", value: 95 },
		{ date: "Aug 15", value: 98 },
		{ date: "Aug 22", value: 90 },
		{ date: "Sep 8", value: 85 },
		{ date: "Sep 15", value: 80 },
		{ date: "Sep 22", value: 82 },
		{ date: "Oct 8", value: 78 },
		{ date: "Oct 15", value: 75 },
		{ date: "Oct 22", value: 72 },
		{ date: "Nov 1", value: 70 },
		{ date: "Nov 8", value: 75 },
		{ date: "Nov 15", value: 68 },
		{ date: "Nov 22", value: 85 },
	];

	const filterOptions: TimeFilterOption[] = [
		{ key: "1W", label: "1W" },
		{ key: "1M", label: "1M" },
		{ key: "3M", label: "3M" },
		{ key: "MAX", label: "Max" },
	];

	return (
		<div className="flex flex-col gap-5">
			{/* Block 1: Chart + Metrics - Background đen */}
			<div className="bg-[#111113] rounded-2xl p-4 border border-dark-gray-700">
				<CommonLineChart
					data={mockData}
					lineColor="#EC4B6B"
					dataKeyX="date"
					dataKeyY="value"
					timeFilters={filterOptions}
					headerTitle={
						<div className="flex items-center gap-3 text-dark-gray-200">
							<div className="text-red-500 py-0.5 px-3 bg-red-500/10 rounded-md">
								<GrowDownIcon size={16} /> 9.6%
							</div>
							<div>past 90 days</div>
						</div>
					}
					height={300}
				/>

				<MetricsGrid data={data} />

				<div className="vault-divider"></div>

				<TimeframesSection data={data} />

				<div className="vault-divider"></div>

				<VaultInformationSection data={data} />

				<div className="vault-divider"></div>

				<DescriptionSection />
			</div>

			{/* My Deposits - Right side */}
			<div className="lg:hidden">
				<MyDeposits />
			</div>
		</div>
	);
};

// Metrics Grid Component
const MetricsGrid = ({ data }: { data: StrategyCardData }) => {
	return (
		<div className="flex flex-col gap-4 mt-4">
			{/* Row 1: Annual return, TVL */}
			<div className="vault-grid-2">
				<div className="vault-metric-card bg-dark-glass">
					<div className="vault-metric-label">
						<span className="vault-metric-label-text">
							Annual return
						</span>
						<QuestionInfoIcon
							size={16}
							className="text-dark-gray-200"
						/>
					</div>
					<div className="vault-metric-value text-green-500">
						{data.annualReturn}
					</div>
				</div>

				<div className="vault-metric-card bg-dark-glass">
					<div className="vault-metric-label">
						<span className="vault-metric-label-text">TVL</span>
						<QuestionInfoIcon
							size={16}
							className="text-dark-gray-200"
						/>
					</div>
					<div className="vault-metric-value">{data.tvl}</div>
				</div>
			</div>

			{/* Row 2: Max drawdown, Sharpe, Sortino */}
			<div className="vault-grid-3">
				<div className="vault-metric-card bg-dark-glass">
					<div className="vault-metric-label">
						<span className="vault-metric-label-text">
							Max drawdown
						</span>
						<QuestionInfoIcon
							size={16}
							className="text-dark-gray-200"
						/>
					</div>
					<div className="vault-metric-value">
						{data.subStats.maxDrawdown}
					</div>
				</div>

				<div className="vault-metric-card bg-dark-glass">
					<div className="vault-metric-label">
						<span className="vault-metric-label-text">Sharpe</span>
						<QuestionInfoIcon
							size={16}
							className="text-dark-gray-200"
						/>
					</div>
					<div className="vault-metric-value">
						{data.subStats.sharpe}
					</div>
				</div>

				<div className="vault-metric-card bg-dark-glass">
					<div className="vault-metric-label">
						<span className="vault-metric-label-text">Sortino</span>
						<QuestionInfoIcon
							size={16}
							className="text-dark-gray-200"
						/>
					</div>
					<div className="vault-metric-value">
						{data.subStats.sortino}
					</div>
				</div>
			</div>
		</div>
	);
};

// Timeframes Section Component
const TimeframesSection = ({ data }: { data: StrategyCardData }) => {
	return (
		<div className="vault-section">
			<h3 className="vault-section-title">Timeframes</h3>
			<div className="vault-grid-3">
				<div className="vault-metric-card bg-dark-glass">
					<div className="vault-metric-label">
						<span className="vault-metric-label-text">Age</span>
						<QuestionInfoIcon
							size={16}
							className="text-dark-gray-200"
						/>
					</div>
					<div className="vault-metric-value">
						{data.subStats.age}
					</div>
				</div>

				<div className="vault-metric-card bg-dark-glass">
					<div className="vault-metric-label">
						<span className="vault-metric-label-text">
							Decision cycle
						</span>
						<QuestionInfoIcon
							size={16}
							className="text-dark-gray-200"
						/>
					</div>
					<div className="vault-metric-value">1 day</div>
				</div>

				<div className="vault-metric-card bg-dark-glass">
					<div className="vault-metric-label">
						<span className="vault-metric-label-text">
							Trade frequency
						</span>
						<QuestionInfoIcon
							size={16}
							className="text-dark-gray-200"
						/>
					</div>
					<div className="vault-metric-value">3.0/mo</div>
				</div>
			</div>
		</div>
	);
};

// Vault Information Section Component
const VaultInformationSection = ({ data }: { data: StrategyCardData }) => {
	const handleCopyAddress = () => {
		if (data.vaultInfo?.address) {
			navigator.clipboard.writeText(data.vaultInfo.address);
		}
	};

	return (
		<div className="flex flex-col">
			<h3 className="vault-section-title">Vault Information</h3>
			<div className="vault-grid-3">
				{/* Vault Type */}
				<div className="vault-info-card">
					<div className="flex items-center gap-1">
						<span className="vault-info-label">Vault Type</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="flex items-center gap-2">
							<div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-white">
								{data.vaultInfo?.vaultTypeIcon || "E"}
							</div>
							<span className="vault-info-value">
								{data.vaultInfo?.vaultType || "Enzyme"}
							</span>
						</div>
						<ArrowUpRightIcon
							size={16}
							className="text-dark-gray-200"
						/>
					</div>
				</div>

				{/* Blockchain */}
				<div className="vault-info-card">
					<div className="vault-info-label">Blockchain</div>
					<div className="flex items-center gap-2">
						{data.vaultInfo?.blockchainIcon ? (
							<Image
								src={data.vaultInfo.blockchainIcon}
								alt={data.vaultInfo.blockchain}
								width={24}
								height={24}
								className="rounded-full"
							/>
						) : (
							<div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
								★
							</div>
						)}
						<span className="vault-info-value">
							{data.vaultInfo?.blockchain || "Cardano"}
						</span>
					</div>
				</div>

				{/* Address */}
				<div className="vault-info-card">
					<div className="vault-info-label">Address</div>
					<div className="flex items-center gap-2">
						<div className="vault-info-value truncate flex-1">
							{data.vaultInfo?.address ||
								"0x53b23bDOCe01bAd74A314B8C5e7E891e27c13D5a"}
						</div>
						<button
							onClick={handleCopyAddress}
							className="cursor-pointer shrink-0"
						>
							<CopyIcon
								size={16}
								className="text-dark-gray-200"
							/>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

// Description Section Component
const DescriptionSection = () => {
	return (
		<div className="vault-section">
			<h3 className="vault-section-title">Description</h3>

			{/* Strategy description */}
			<div className="flex flex-col gap-3">
				<h4 className="vault-subsection-title">Strategy description</h4>
				<div className="vault-description-text">
					<p className="vault-description-paragraph">
						{
							strategyDescriptionContent.mainDescription.split(
								"\n\n"
							)[0]
						}
					</p>
					<ul className="vault-description-list vault-description-paragraph">
						{strategyDescriptionContent.mainDescription
							.split("\n\n")
							.slice(1, -1)
							.map((item, index) => (
								<li key={index}>{item}</li>
							))}
					</ul>
					<p>
						{
							strategyDescriptionContent.mainDescription
								.split("\n\n")
								.slice(-1)[0]
						}
					</p>
				</div>
			</div>

			{/* Assets and trading venues */}
			<div className="flex flex-col gap-3">
				<h4 className="vault-subsection-title">
					{strategyDescriptionContent.assetsAndTradingVenues.title}
				</h4>
				<div className="vault-description-text">
					<p className="vault-description-paragraph">
						{
							strategyDescriptionContent.assetsAndTradingVenues.content.split(
								"\n\n"
							)[0]
						}
					</p>
					<ul className="vault-description-list">
						{strategyDescriptionContent.assetsAndTradingVenues.content
							.split("\n\n")
							.slice(1)
							.map((item, index) => (
								<li key={index}>{item}</li>
							))}
					</ul>
				</div>
			</div>

			{/* Backtesting */}
			<div className="flex flex-col gap-3">
				<h4 className="vault-subsection-title">
					{strategyDescriptionContent.backtesting.title}
				</h4>
				<div className="vault-description-text">
					<p className="vault-description-paragraph">
						{
							strategyDescriptionContent.backtesting.content.split(
								"\n\n"
							)[0]
						}
					</p>
					<ul className="vault-description-list">
						{strategyDescriptionContent.backtesting.content
							.split("\n\n")
							.slice(1)
							.map((item, index) => (
								<li key={index}>{item}</li>
							))}
					</ul>
				</div>
			</div>

			{/* Profit */}
			<div className="flex flex-col gap-3">
				<h4 className="vault-subsection-title">
					{strategyDescriptionContent.profit.title}
				</h4>
				<div className="vault-description-text">
					{strategyDescriptionContent.profit.content
						.split("\n\n")
						.map((paragraph, index) => (
							<p
								key={index}
								className={
									index <
									strategyDescriptionContent.profit.content.split(
										"\n\n"
									).length -
										1
										? "vault-description-paragraph"
										: ""
								}
							>
								{paragraph}
							</p>
						))}
				</div>
			</div>

			{/* Risk */}
			<div className="flex flex-col gap-3">
				<h4 className="vault-subsection-title">
					{strategyDescriptionContent.risk.title}
				</h4>
				<div className="vault-description-text">
					<p className="vault-description-paragraph">
						{
							strategyDescriptionContent.risk.content.split(
								"\n\n"
							)[0]
						}
					</p>
					<p className="vault-description-paragraph">
						{
							strategyDescriptionContent.risk.content.split(
								"\n\n"
							)[1]
						}
					</p>
					<ul className="vault-description-list">
						{strategyDescriptionContent.risk.content
							.split("\n\n")
							.slice(2)
							.map((item, index) => (
								<li key={index}>{item}</li>
							))}
					</ul>
				</div>
			</div>

			{/* Benchmark */}
			<div className="flex flex-col gap-3">
				<h4 className="vault-subsection-title">
					{strategyDescriptionContent.benchmark.title}
				</h4>
				<div className="vault-description-text">
					<p className="vault-description-paragraph">
						{strategyDescriptionContent.benchmark.content}
					</p>

					{/* Table */}
					<div className="overflow-x-auto vault-description-paragraph">
						<table className="vault-table">
							<thead>
								<tr className="vault-table-header">
									{strategyDescriptionContent.benchmark.table.headers.map(
										(header, index) => (
											<th
												key={index}
												className="vault-table-header-cell"
											>
												{header}
											</th>
										)
									)}
								</tr>
							</thead>
							<tbody>
								{strategyDescriptionContent.benchmark.table.rows.map(
									(row, rowIndex) => (
										<tr
											key={rowIndex}
											className="vault-table-row"
										>
											{row.map((cell, cellIndex) => (
												<td
													key={cellIndex}
													className="vault-table-cell"
												>
													{cell}
												</td>
											))}
										</tr>
									)
								)}
							</tbody>
						</table>
					</div>

					<p className="mb-2">Sources:</p>
					<ul className="list-disc list-inside space-y-1">
						{strategyDescriptionContent.benchmark.sources.map(
							(source, index) => (
								<li key={index}>{source}</li>
							)
						)}
					</ul>
				</div>
			</div>

			{/* Trading frequency */}
			<div className="flex flex-col gap-3">
				<h4 className="vault-subsection-title">
					{strategyDescriptionContent.tradingFrequency.title}
				</h4>
				<div className="vault-description-text">
					{strategyDescriptionContent.tradingFrequency.content
						.split("\n\n")
						.map((paragraph, index) => (
							<p
								key={index}
								className={
									index <
									strategyDescriptionContent.tradingFrequency.content.split(
										"\n\n"
									).length -
										1
										? "vault-description-paragraph"
										: ""
								}
							>
								{paragraph}
							</p>
						))}
				</div>
			</div>

			{/* Robustness */}
			<div className="flex flex-col gap-3">
				<h4 className="vault-subsection-title">
					{strategyDescriptionContent.robustness.title}
				</h4>
				<div className="vault-description-text">
					<p>{strategyDescriptionContent.robustness.content}</p>
				</div>
			</div>

			{/* Updates */}
			<div className="flex flex-col gap-3">
				<h4 className="vault-subsection-title">
					{strategyDescriptionContent.updates.title}
				</h4>
				<div className="vault-description-text">
					{strategyDescriptionContent.updates.content
						.split("\n\n")
						.map((paragraph, index) => (
							<p
								key={index}
								className={
									index <
									strategyDescriptionContent.updates.content.split(
										"\n\n"
									).length -
										1
										? "vault-description-paragraph"
										: ""
								}
							>
								{paragraph}
							</p>
						))}
				</div>
			</div>

			{/* Further information */}
			<div className="flex flex-col gap-3">
				<h4 className="vault-subsection-title">
					{strategyDescriptionContent.furtherInformation.title}
				</h4>
				<div className="vault-description-text">
					{strategyDescriptionContent.furtherInformation.content
						.split("\n\n")
						.map((paragraph, index) => (
							<p
								key={index}
								className={
									index <
									strategyDescriptionContent.furtherInformation.content.split(
										"\n\n"
									).length -
										1
										? "vault-description-paragraph"
										: ""
								}
							>
								{paragraph}
							</p>
						))}
				</div>
			</div>
		</div>
	);
};

export default Overview;
