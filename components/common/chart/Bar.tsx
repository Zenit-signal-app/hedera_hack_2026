/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState } from "react";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

export interface ChartDataPoint {
	date: string | number;
	value: number;
	[key: string]: any;
}

export interface TimeFilterOption {
	key: string;
	label: string;
}

interface CommonBarChartProps {
	data: ChartDataPoint[];
	barColor: string;
	dataKeyX: string;
	dataKeyY: string;
	timeFilters?: TimeFilterOption[];
	headerTitle?: React.ReactNode | string;
	height?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
	if (active && payload && payload.length) {
		return (
			<div className="bg-gray-700 bg-opacity-80 backdrop-blur-sm p-2 rounded-md border border-gray-600 text-white text-sm">
				<p className="text-gray-400">{label}</p>
				<p className="font-bold">{`$${payload[0].value.toLocaleString()}`}</p>
			</div>
		);
	}
	return null;
};

const CommonBarChart: React.FC<CommonBarChartProps> = ({
	data,
	barColor,
	dataKeyX,
	dataKeyY,
	timeFilters,
	headerTitle,
	height = 300,
}) => {
	const [activeFilter, setActiveFilter] = useState(
		timeFilters ? timeFilters[0].key : ""
	);

	return (
		<div className="font-quicksand" style={{ height: height + 60 }}>
			<div className="flex justify-between items-center mb-4">
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
									"px-3 py-1 text-xs font-medium rounded-md text-white transition-all duration-150",
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
				<BarChart
					data={data}
					margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
				>
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
						dataKey={dataKeyY}
						stroke="#555555"
						tick={{ fill: "#999999", fontSize: 10 }}
						tickLine={false}
						axisLine={false}
						domain={["auto", "auto"]}
						hide={true}
					/>

					<Tooltip content={<CustomTooltip />} />

					<Bar
						dataKey={dataKeyY}
						fill={barColor}
						// radius={[4, 4, 0, 0]}
						maxBarSize={20}
					/>
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
};

export default CommonBarChart;
