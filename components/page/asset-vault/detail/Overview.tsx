import {
	AreaChart,
	Area,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import GrowDownIcon from "@/components/icon/Icon_GrowDown";
import { VaultInfo } from "@/types/vault";
import MyDeposits from "./MyDeposits";
import CopyIcon from "@/components/icon/Icon_Copy";
import ArrowUpRightIcon from "@/components/icon/Icon_ArrowUpRight";
import QuestionInfoIcon from "@/components/icon/Icon_QuestionInfo";
import { getServerChainId } from "@/services/chainServices";
import { strategyDescriptionContent } from "@/data/strategy-description";
import { useEffect, useState } from "react";
import { vaultApi } from "@/services/vaultServices";
import { VaultResolution } from "@/types/vault";
import { useWalletStore } from "@/store/walletStore";
import type { ChartDataPoint } from "@/components/common/chart/Line";
import { formatWallet } from "@/lib/format";
import Copy from "@/components/common/Copy";
import Image from "next/image";
import { toast } from "sonner";

// Main Overview Component
const Overview = ({ data }: { data: VaultInfo }) => {
	const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
	const [isChartLoading, setIsChartLoading] = useState(true);
	const [selectedResolution, setSelectedResolution] =
		useState<VaultResolution>("1d");
	const { activeChain } = useWalletStore();
	const [priceChange, setPriceChange] = useState<{
		value: number;
		percentage: number;
	} | null>(null);

	useEffect(() => {
		const fetchChartData = async () => {
			setIsChartLoading(true);
			try {
				const response = await vaultApi.getVaultValues(data.id, {
					resolution: selectedResolution,
					currency: "usd",
					count_back: 20,
				}, await getServerChainId(activeChain ?? ""));

				if (response.s === "ok" && response.t && response.c) {
					// Convert TradingView format to chart format
					const converted: ChartDataPoint[] = response.t.map(
						(timestamp, index) => {
							const date = new Date(timestamp * 1000);
							const dateStr = formatDate(
								date,
								selectedResolution,
							);

							return {
								date: dateStr,
								value: response.c[index],
							};
						},
					);

					setChartData(converted);

					// Calculate price change
					if (response.c.length > 0) {
						const firstPrice = response.c[0];
						const lastPrice = response.c[response.c.length - 1];
						const change = lastPrice - firstPrice;
						const percentage = (change / firstPrice) * 100;
						setPriceChange({ value: change, percentage });
					}
				} else {
					setChartData([]);
					setPriceChange(null);
				}
			} catch (error) {
				console.error("Error fetching vault values:", error);
				setChartData([]);
				setPriceChange(null);
			} finally {
				setIsChartLoading(false);
			}
		};

		if (data.id) {
			fetchChartData();
		}
	}, [data.id, selectedResolution, activeChain]);

	// Helper function to format date based on resolution
	const formatDate = (date: Date, resolution: VaultResolution): string => {
		if (resolution === "1d") {
			return date.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			});
		} else if (resolution === "1w") {
			return date.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			});
		} else if (resolution === "1m") {
			return date.toLocaleDateString("en-US", {
				month: "short",
				year: "2-digit",
			});
		}
		return date.toLocaleDateString();
	};

	return (
		<div className="flex flex-col gap-5">
			{/* Block 1: Chart + Metrics - Background đen */}
			<div className="bg-[#111113] rounded-2xl p-4 border border-dark-gray-700">
				{isChartLoading ? (
					<div className="h-80 flex items-center justify-center text-gray-400">
						Loading chart data...
					</div>
				) : chartData.length === 0 ? (
					<div className="h-80 flex items-center justify-center text-gray-400">
						No chart data available
					</div>
				) : (
					<div>
						{/* Chart Header with Filters */}
						<div className="flex justify-between items-center mb-4">
							{priceChange && (
								<div className="flex items-center gap-3 text-dark-gray-200">
									<div
										className={`${
											priceChange.value >= 0
												? "text-green-500 bg-green-500/10"
												: "text-red-500 bg-red-500/10"
										} py-0.5 px-3 rounded-md`}
									>
										{priceChange.value >= 0 ? (
											<GrowDownIcon
												size={16}
												className="inline mr-1"
											/>
										) : (
											<GrowDownIcon
												size={16}
												className="inline mr-1 rotate-180"
											/>
										)}
										{Math.abs(
											priceChange.percentage,
										).toFixed(1)}
										%
									</div>
									<div>
										{selectedResolution === "1d"
											? "past day"
											: selectedResolution === "1w"
												? "past week"
												: "past month"}
									</div>
								</div>
							)}
							<div className="flex rounded-lg p-1 space-x-0.5">
								{[
									{ key: "1d", label: "1D" },
									{ key: "1w", label: "1W" },
									{ key: "1m", label: "1M" },
								].map((filter) => (
									<button
										key={filter.key}
										onClick={() =>
											setSelectedResolution(
												filter.key as VaultResolution,
											)
										}
										className={`px-3 py-1 text-xs font-medium rounded-md text-white transition-all duration-150 ${
											selectedResolution === filter.key
												? "bg-dark-gray-800"
												: "hover:bg-gray-700"
										}`}
									>
										{filter.label}
									</button>
								))}
							</div>
						</div>

						{/* Chart */}
						<div style={{ height: 300 + 60 }}>
							<ResponsiveContainer width="100%" height={300}>
								<AreaChart
									data={chartData}
									margin={{
										top: 5,
										right: 20,
										left: 0,
										bottom: 5,
									}}
								>
									<defs>
										<linearGradient
											id="chartGradient"
											x1="0"
											y1="0"
											x2="0"
											y2="1"
										>
											<stop
												stopColor={
													priceChange &&
													priceChange.value >= 0
														? "#10b981"
														: "#EC4B6B"
												}
												stopOpacity={0.4}
												offset={0}
											/>
											<stop
												offset="1"
												stopColor={
													priceChange &&
													priceChange.value >= 0
														? "#10b981"
														: "#EC4B6B"
												}
												stopOpacity={0}
											/>
										</linearGradient>
									</defs>
									<CartesianGrid
										vertical={false}
										stroke="none"
										strokeDasharray="3 3"
									/>
									<XAxis
										dataKey="date"
										stroke="#555555"
										tick={{ fill: "#999999", fontSize: 10 }}
										tickLine={false}
										axisLine={false}
									/>
									<YAxis
										stroke="#555555"
										tick={{ fill: "#999999", fontSize: 10 }}
										tickLine={false}
										axisLine={false}
										domain={["auto", "auto"]}
										hide={true}
									/>
									<Tooltip
										contentStyle={{
											backgroundColor:
												"rgba(107, 114, 128, 0.8)",
											border: "1px solid rgb(75, 85, 99)",
											borderRadius: "6px",
											color: "white",
										}}
										labelStyle={{
											color: "rgb(156, 163, 175)",
										}}
									/>
									<Area
										type="linear"
										dataKey="value"
										stroke={
											priceChange &&
											priceChange.value >= 0
												? "#10b981"
												: "#EC4B6B"
										}
										strokeWidth={2}
										fill="url(#chartGradient)"
										dot={false}
										activeDot={{
											r: 5,
											strokeWidth: 1,
											fill: "white",
										}}
									/>
								</AreaChart>
							</ResponsiveContainer>
						</div>
					</div>
				)}

				<MetricsGrid data={data} />

				<div className="vault-divider"></div>

				<TimeframesSection data={data} />

				<div className="vault-divider"></div>

				<VaultInformationSection data={data} />

				<div className="vault-divider"></div>

				<DescriptionSection description={data.description} />
			</div>

			<div className="lg:hidden">
				<MyDeposits
					vaultId={data.id}
					poolId={data.pool_id}
					vaultAddress={data.address}
					onDepositSuccess={() => {
						toast.success("Deposit successful!");
					}}
					onRedeemSuccess={() => {
						toast.success("Redeem successful!");
					}}
					vaultState={data.state}
				/>
			</div>
		</div>
	);
};

// Metrics Grid Component
const MetricsGrid = ({ data }: { data: VaultInfo }) => {
	const formatCurrency = (value: number) => {
		if (value >= 1_000_000) {
			return `$${(value / 1_000_000).toFixed(1)}M`;
		} else if (value >= 1_000) {
			return `$${(value / 1_000).toFixed(1)}K`;
		}
		return `$${value.toFixed(2)}`;
	};
	return (
		<div className="flex flex-col gap-4 mt-4">
			{/* Row 1: Annual return, TVL */}
			<div className="vault-grid-3">
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
						{data.annual_return.toFixed(1)}%
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
					<div className="vault-metric-value">
						{formatCurrency(data.tvl_usd)}
					</div>
				</div>

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
						{data.max_drawdown.toFixed(1)}%
					</div>
				</div>
			</div>

			{/* Row 2: Max drawdown, Sharpe, Sortino */}
		</div>
	);
};

// Timeframes Section Component
const TimeframesSection = ({ data }: { data: VaultInfo }) => {
	const calculateAge = (startTime: number) => {
		const start = new Date(startTime);
		const now = new Date();
		const diffTime = Math.abs(now.getTime() - start.getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
		return `${diffDays} days`;
	};

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
						{calculateAge(Number(data.start_time) * 1000)}
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
					<div className="vault-metric-value">
						{data.decision_cycle}
					</div>
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
					<div className="vault-metric-value">
						{data.trade_per_month.toFixed(1)}/mo
					</div>
				</div>
			</div>
		</div>
	);
};

// Vault Information Section Component
const VaultInformationSection = ({ data }: { data: VaultInfo }) => {
	const handleCopyAddress = () => {
		if (data.address) {
			navigator.clipboard.writeText(data.address);
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
							<Image
								src={data.vault_type_logo}
								width={24}
								height={24}
								alt="Logo vault"
								className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-bold"
							/>

							<span className="vault-info-value">
								{data.vault_type}
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
						<Image
							src={data.blockchain_logo}
							width={24}
							height={24}
							alt="Logo vault"
							className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-bold"
						/>
						<span className="vault-info-value">
							{data.blockchain}
						</span>
					</div>
				</div>

				{/* Address */}
				<div className="vault-info-card">
					<div className="vault-info-label">Address</div>
					<Copy value={data.address} className="text-white">
						{formatWallet(data.address)}
					</Copy>
				</div>
			</div>
		</div>
	);
};

// Description Section Component
const DescriptionSection = ({ description }: { description: string }) => {
	return (
		<div className="vault-section">
			<h3 className="vault-section-title">Description</h3>

			<div
				className="flex flex-col gap-3"
				dangerouslySetInnerHTML={{ __html: description || "" }}
			></div>
		</div>
	);
};

export default Overview;
