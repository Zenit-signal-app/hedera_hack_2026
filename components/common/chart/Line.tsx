/* eslint-disable @typescript-eslint/no-explicit-any */

// components/Chart/CommonLineChart.tsx

import React, { useState } from "react";
import {
	AreaChart,
	Area,
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

interface CommonLineChartProps {
	data: ChartDataPoint[];
	lineColor: string;
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
				<p className="font-bold">{`${payload[0].value}`}</p>
			</div>
		);
	}
	return null;
};
const CommonLineChart: React.FC<CommonLineChartProps> = ({
	data,
	lineColor,
	dataKeyX,
	dataKeyY,
	timeFilters,
	headerTitle,
	height = 300,
}) => {
	const [activeFilter, setActiveFilter] = useState(
		timeFilters ? timeFilters[0].key : ""
	);
	const gradientId = `colorArea-${lineColor.replace("#", "")}`;
	return (
		<div
			className="p-4 rounded-lg bg-[#111113] border border-gray-800 font-quicksand"
			style={{ height: height + 60 }}>
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
								)}>
								{filter.label}
							</button>
						))}
					</div>
				)}
			</div>

			<ResponsiveContainer width="100%" height={height}>
				<AreaChart
					data={data}
					margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
					<defs>
						<linearGradient
							id={gradientId}
							x1="362.5"
							y1="0"
							x2="362.5"
							y2="164.346"
							gradientUnits="userSpaceOnUse">
							<stop stopColor="#EC4B6B" stopOpacity={0.4} offset={0} />
							<stop offset="1" stopColor="#862B3D" stopOpacity={0} />
						</linearGradient>
					</defs>
					<CartesianGrid vertical={false} stroke="none" strokeDasharray="3 3" />

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

					<Area
						type="linear"
						dataKey={dataKeyY}
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
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
};

export default CommonLineChart;
