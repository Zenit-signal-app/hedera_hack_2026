/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState } from "react";
import {
	ComposedChart,
	Area,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";

export interface ChartDataPoint {
	date: string | number;
	[key: string]: any;
}

export interface TimeFilterOption {
	key: string;
	label: string;
}

interface CommonComboChartProps {
	data: ChartDataPoint[];
	lineColor: string;
	barColor: string;
	dataKeyX: string;
	dataKeyLine: string;
	dataKeyBar: string;
	timeFilters?: TimeFilterOption[];
	headerTitle?: React.ReactNode | string;
	height?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
	if (active && payload && payload.length) {
		return (
			<div className="bg-gray-700 bg-opacity-80 backdrop-blur-sm p-2 rounded-md border border-gray-600 text-white text-sm">
				<p className="text-gray-400 mb-1">Sep {label}</p>
				{payload.map((entry: any, index: number) => {
					let displayValue = entry.value;
					const name = entry.name;

					// Lấy giá trị GỐC thay vì giá trị mapped
					if (name === "Netflow") {
						displayValue = entry.payload.netflowOriginal;
					} else if (name === "TVL") {
						displayValue = entry.payload.tvl;
					}

					const formattedValue = `$${(
						displayValue * 1000
					).toLocaleString()}`;

					return (
						<p
							key={index}
							className="font-bold"
							style={{ color: entry.color }}
						>
							{name}: {formattedValue}
						</p>
					);
				})}
			</div>
		);
	}
	return null;
};

const CommonComboChart: React.FC<CommonComboChartProps> = ({
	data,
	lineColor,
	barColor,
	dataKeyX,
	dataKeyLine,
	dataKeyBar,
	timeFilters,
	headerTitle,
	height = 300,
}) => {
	const [activeFilter, setActiveFilter] = useState(
		timeFilters ? timeFilters[0].key : ""
	);

	const gradientId = `colorArea-${lineColor.replace("#", "")}`;

	/**
	 * TRICK: DUAL SCALE SIMULATION - Vẽ 2 biểu đồ với scale khác nhau trên cùng 1 YAxis
	 *
	 * Vấn đề:
	 * - TVL có giá trị 56-76K (range 20K)
	 * - Netflow có giá trị 0-4K (quá nhỏ so với TVL)
	 * - Nếu dùng chung scale, bar chart netflow sẽ gần như không thấy
	 *
	 * Giải pháp:
	 * 1. Chia YAxis thành 2 VÙNG:
	 *    - VÙNG DƯỚI (44K-54K): Dành cho Netflow, 10K range
	 *    - VÙNG TRÊN (56K-76K): Dành cho TVL, 20K range
	 *    - Khoảng cách 2K (54K-56K) để tạo visual separation
	 *
	 * 2. MAP DỮ LIỆU:
	 *    - Netflow [0-4K] được map vào [44K-54K]
	 *    - Công thức: netflowMapped = (netflow / 4) * 10 + 44
	 *
	 * 3. TICKS HIỂN THỊ:
	 *    - Với value < 56K: format thành "$0K, $1K, $2K, $3K, $4K"
	 *    - Với value >= 56K: format giữ nguyên "$56K, $58K, ..."
	 */

	// Calculate min/max for TVL (line)
	const tvlValues = data.map((d) => d[dataKeyLine] as number);
	const minTvl = Math.floor(Math.min(...tvlValues));
	const maxTvl = Math.ceil(Math.max(...tvlValues));

	// Calculate max for Netflow (bar)
	const netflowValues = data.map((d) => d[dataKeyBar] as number);
	const maxNetflow = Math.ceil(Math.max(...netflowValues));

	// Define scale ranges
	const NETFLOW_RANGE = 10; // 10K range for netflow zone
	const NETFLOW_MIN = 44; // Start of netflow zone
	const NETFLOW_MAX = NETFLOW_MIN + NETFLOW_RANGE; // 54K
	const TVL_MIN = 56; // Start of TVL zone (2K gap for separation)

	// Map netflow data to lower zone [44-54K]
	const mappedData = data.map((d) => {
		const netflowValue = d[dataKeyBar] as number;
		const mappedNetflow =
			netflowValue === 0
				? NETFLOW_MIN + 0.05 // Small value for 2px height indicator
				: (netflowValue / maxNetflow) * NETFLOW_RANGE + NETFLOW_MIN;

		return {
			...d,
			[dataKeyBar]: mappedNetflow,
			netflowOriginal: netflowValue, // Keep original for tooltip
			isZeroNetflow: netflowValue === 0, // Flag for custom rendering
		};
	});

	// Generate ticks for netflow zone
	// 44, 46.5, 49, 51.5, 54 tương ứng $0K, $1K, $2K, $3K, $4K
	const netflowTicks = [];
	for (let i = 0; i <= maxNetflow; i++) {
		const mappedValue = (i / maxNetflow) * NETFLOW_RANGE + NETFLOW_MIN;
		netflowTicks.push(mappedValue);
	}

	// Generate ticks for TVL zone (56, 58, 60, ...)
	const tvlTicks = [];
	for (let i = TVL_MIN; i <= maxTvl; i += 2) {
		tvlTicks.push(i);
	}

	// Combine all ticks
	const allTicks = [...netflowTicks, ...tvlTicks];

	// Custom tick formatter
	const tickFormatter = (value: number) => {
		if (value < TVL_MIN) {
			// Netflow zone: map back to actual values [0-4K]
			const actualValue =
				((value - NETFLOW_MIN) / NETFLOW_RANGE) * maxNetflow;
			return `$${Math.round(actualValue)}K`;
		}
		// TVL zone: show as is
		return `$${value}K`;
	};

	return (
		<div className="font-quicksand" style={{ minHeight: height + 60 }}>
			<div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-4">
				{headerTitle && (
					<div className="flex items-center space-x-2 text-sm font-semibold">
						{headerTitle}
					</div>
				)}

				{timeFilters && timeFilters.length > 0 && (
					<div className="flex rounded-lg p-1 space-x-0.5">
						{timeFilters.map((filter) => (
							<button
								key={filter.key}
								onClick={() => setActiveFilter(filter.key)}
								className={cn(
									"px-2 tablet:px-3 py-1 text-xs font-medium rounded-md text-white transition-all duration-150",
									activeFilter === filter.key
										? "bg-dark-gray-800 "
										: " hover:bg-gray-700"
								)}
							>
								{filter.label}
							</button>
						))}
					</div>
				)}
			</div>

			<ResponsiveContainer width="100%" height={height}>
				<ComposedChart
					data={mappedData}
					margin={{ top: 5, right: -5, left: 0, bottom: 5 }}
				>
					<defs>
						<linearGradient
							id={gradientId}
							x1="362.5"
							y1="0"
							x2="362.5"
							y2="164.346"
							gradientUnits="userSpaceOnUse"
						>
							<stop
								stopColor="#EC4B6B"
								stopOpacity={0.4}
								offset={0}
							/>
							<stop
								offset="1"
								stopColor="#862B3D"
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
						dataKey={dataKeyX}
						stroke="#555555"
						tick={{ fill: "#999999", fontSize: 10 }}
						tickLine={false}
						axisLine={false}
					/>

					<YAxis
						yAxisId="combined"
						orientation="right"
						stroke="#555555"
						tick={{ fill: "#999999", fontSize: 10 }}
						tickLine={false}
						axisLine={false}
						domain={[NETFLOW_MIN, maxTvl]}
						ticks={allTicks}
						tickFormatter={tickFormatter}
						width={40}
						tickMargin={5}
					/>

					{/* Divider line giữa 2 scale zones */}
					<ReferenceLine
						y={TVL_MIN}
						yAxisId="combined"
						strokeWidth={0.2}
					/>

					<Tooltip content={<CustomTooltip />} />

					{/* Bar chart cho Netflow với custom shape cho zero values */}
					<Bar
						yAxisId="combined"
						dataKey={dataKeyBar}
						fill={barColor}
						radius={0}
						barSize={30}
						name="Netflow"
						shape={(props: any) => {
							const { fill, x, y, width, height, payload } =
								props;

							// Nếu netflow = 0, dùng màu đỏ và height cố định 2px
							if (payload.isZeroNetflow) {
								return (
									<rect
										x={x}
										y={y + height - 2} // Đặt ở đáy
										width={width}
										height={2}
										fill="#EC4B6B" // Màu đỏ
									/>
								);
							}

							// Netflow > 0: hiển thị bình thường (hình chữ nhật)
							return (
								<rect
									x={x}
									y={y}
									width={width}
									height={height}
									fill={fill}
								/>
							);
						}}
					/>

					{/* Area chart cho TVL - scale 58-74 (tương ứng 58K-74K thực tế) */}
					<Area
						yAxisId="combined"
						type="linear"
						dataKey={dataKeyLine}
						stroke={lineColor}
						strokeWidth={2}
						fill={`url(#${gradientId})`}
						dot={false}
						activeDot={{
							r: 5,
							stroke: lineColor,
							strokeWidth: 1,
							fill: "white",
						}}
						name="TVL"
					/>
				</ComposedChart>
			</ResponsiveContainer>
		</div>
	);
};

export default CommonComboChart;
