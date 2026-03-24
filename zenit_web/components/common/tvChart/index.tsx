/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
	ChartingLibraryWidgetOptions,
	ResolutionString,
	widget,
	IChartingLibraryWidget,
} from "@/public/static/charting_library";
import { CustomDatafeed, setPairsCache } from "@/lib/tradingview-datafeed";
import Icon_ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import IconCamera from "@/components/icon/IconCamera";
import IconDirect from "@/components/icon/IconDirect";
import { PopoverWrapper } from "@/components/common/popover";
import { useFetchChartPairs } from "@/hooks/useFetchChartPairs";
import { useWalletStore } from "@/store/walletStore";

dayjs.extend(utc);
dayjs.extend(timezone);

interface TVChartContainerProps {
	symbol?: string;
	interval?: string;
	indicators?: string[];
	className?: string;
	onIntervalChange?: (interval: string) => void;
}

// BE chỉ support: 5m, 30m, 1h, 4h, 1D
export const TIME_INTERVALS = ["5", "30", "60", "240", "1D"] as const;
const INTERVAL_LABELS: Record<string, string> = {
	"5": "5M",
	"30": "30M",
	"60": "1H",
	"240": "4H",
	"1D": "1D",
};

const AVAILABLE_INDICATORS = [
	{ value: "RSI7", label: "RSI7" },
	{ value: "RSI14", label: "RSI14" },
	{ value: "MACD", label: "MACD" },
	{ value: "PSAR", label: "PSAR" },
	{ value: "EMA20", label: "EMA20" },
	{ value: "ADX14", label: "ADX14" },
	{ value: "BB", label: "Bollinger Bands" },
] as const;

const AVAILABLE_TIMEZONES = [
	{ value: "UTC", label: "UTC" },
	{ value: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh (UTC+7)" },
	{ value: "Asia/Bangkok", label: "Bangkok (UTC+7)" },
	{ value: "Asia/Singapore", label: "Singapore (UTC+8)" },
	{ value: "Asia/Hong_Kong", label: "Hong Kong (UTC+8)" },
	{ value: "Asia/Tokyo", label: "Tokyo (UTC+9)" },
	{ value: "America/New_York", label: "New York (UTC-5)" },
	{ value: "America/Chicago", label: "Chicago (UTC-6)" },
	{ value: "America/Los_Angeles", label: "Los Angeles (UTC-8)" },
	{ value: "Europe/London", label: "London (UTC+0)" },
	{ value: "Europe/Paris", label: "Paris (UTC+1)" },
] as const;

export const TVChartContainer = ({
	symbol = "USDM_ADA",
	interval = "1D",
	indicators = [],
	className = "",
	onIntervalChange,
}: TVChartContainerProps) => {
	const chartContainerRef = useRef<HTMLDivElement>(null);
	const tvWidgetRef = useRef<IChartingLibraryWidget | null>(null);
	const [selectedInterval, setSelectedInterval] = useState(interval);
	const [selectedIndicators, setSelectedIndicators] =
		useState<string[]>(indicators);
	const [displaySymbol, setDisplaySymbol] = useState(symbol);
	const [isLoading, setIsLoading] = useState(true);
	const [popoverOpen, setPopoverOpen] = useState(false);
	const [timezonePopoverOpen, setTimezonePopoverOpen] = useState(false);
	const [selectedTimezone, setSelectedTimezone] = useState("UTC");
	const [currentTime, setCurrentTime] = useState("");

	// Fetch chart pairs data on component mount
	const { fetchPairs, pairs } = useFetchChartPairs();
	const { activeChain } = useWalletStore();

	useEffect(() => {
		// Load initial pairs data from API
		fetchPairs({ limit: 100, ...(activeChain ? { chain: activeChain } : {}) });
	}, [fetchPairs, activeChain]);

	useEffect(() => {
		// Update display symbol when symbol prop changes
		setDisplaySymbol(symbol);
	}, [symbol]);

	useEffect(() => {
		// Update pairs cache whenever pairs data changes
		if (pairs.length > 0) {
			setPairsCache(pairs);
		}
	}, [pairs]);

	useEffect(() => {
		if (!chartContainerRef.current) return;
		const widgetOptions: ChartingLibraryWidgetOptions = {
			symbol,
			datafeed: new CustomDatafeed(),
			interval: selectedInterval as ResolutionString,
			container: chartContainerRef.current,
			timezone: selectedTimezone as any,
			disabled_features: [
				"use_localstorage_for_settings",
				"header_widget",
				"timeframes_toolbar",
				"left_toolbar",
				"header_compare",
				"header_symbol_search",
			],
			enabled_features: ["study_templates"],
			library_path: "/static/charting_library/",
			locale: "en",
			charts_storage_url: "https://saveload.tradingview.com",
			charts_storage_api_version: "1.1",
			client_id: "tradingview.com",
			user_id: "public_user_id",
			fullscreen: false,
			autosize: true,
			theme: "dark",
		};

		const tvWidget = new widget(widgetOptions);
		tvWidgetRef.current = tvWidget;

		tvWidget.onChartReady(() => {
			setIsLoading(false);
			setDisplaySymbol(symbol);

			if (selectedIndicators.length > 0) {
				const activeChart = tvWidget.activeChart();
				selectedIndicators.forEach((indicator) => {
					try {
						const parts = indicator.toUpperCase().split(/(\d+)/);
						const indicatorName = parts[0];
						const param = parts[1] ? parseInt(parts[1]) : undefined;

						switch (indicatorName) {
							case "RSI":
								activeChart.createStudy(
									"Relative Strength Index",
									false,
									false,
									{
										length: param || 14,
									}
								);
								break;
							case "MACD":
								activeChart.createStudy("MACD", false, false);
								break;
							case "PSAR":
								activeChart.createStudy(
									"Parabolic SAR",
									false,
									false
								);
								break;
							case "EMA":
								activeChart.createStudy(
									"Moving Average Exponential",
									false,
									false,
									{
										length: param || 20,
									}
								);
								break;
							case "ADX":
								activeChart.createStudy(
									"Average Directional Index",
									false,
									false,
									{
										length: param || 14,
									}
								);
								break;
							case "BB":
								activeChart.createStudy(
									"Bollinger Bands",
									false,
									false
								);
								break;
						}
					} catch (error) {
						console.error(
							`Failed to create indicator ${indicator}:`,
							error
						);
					}
				});
			}
		});

		return () => {
			if (tvWidgetRef.current) {
				tvWidgetRef.current.remove();
				tvWidgetRef.current = null;
			}
		};
	}, [symbol, selectedInterval, selectedIndicators]);

	// Handle timezone change without reloading chart
	useEffect(() => {
		if (!tvWidgetRef.current) return;

		try {
			tvWidgetRef.current.applyOverrides({
				timezone: selectedTimezone as any,
			});
		} catch (error) {
			console.error("Failed to apply timezone override:", error);
		}
	}, [selectedTimezone]);

	useEffect(() => {
		const updateTime = () => {
			const formatted = dayjs()
				.tz(selectedTimezone)
				.format("YYYY-MM-DD HH:mm:ss");
			setCurrentTime(formatted);
		};

		updateTime();

		const intervalId = setInterval(updateTime, 1000);
		return () => clearInterval(intervalId);
	}, [selectedTimezone]);

	const handleIntervalChange = (newInterval: string) => {
		setSelectedInterval(newInterval);
		onIntervalChange?.(newInterval);
	};

	const handleIndicatorToggle = (indicator: string) => {
		setSelectedIndicators((prev) => {
			const isSelected = prev.includes(indicator);
			if (isSelected) {
				return prev.filter((i) => i !== indicator);
			} else {
				return [...prev, indicator];
			}
		});
	};

	const handleTakeSnapshot = () => {
		if (!tvWidgetRef.current) return;

		try {
			// Use widget's takeClientScreenshot method
			tvWidgetRef.current
				.takeClientScreenshot()
				.then((canvas: HTMLCanvasElement) => {
					// Convert canvas to blob
					canvas.toBlob((blob: Blob | null) => {
						if (!blob) return;

						// Create download link
						const url = URL.createObjectURL(blob);
						const link = document.createElement("a");
						link.href = url;
						link.download = `chart-${symbol}-${new Date().getTime()}.png`;
						document.body.appendChild(link);
						link.click();
						document.body.removeChild(link);
						URL.revokeObjectURL(url);
					});
				})
				.catch((error: Error) => {
					console.error("Failed to take screenshot:", error);
				});
		} catch (error) {
			console.error("Failed to take screenshot:", error);
		}
	};

	return (
		<div
			className={`flex flex-col gap-2 lg:gap-0 overflow-hidden bg-primary-950 rounded-t-lg h-full ${className}`}
		>
			<div className="flex gap-4 items-center pt-2 pb-2 px-3 shrink-0">
				<div className="flex gap-1 items-center">
					{TIME_INTERVALS.map((timeInterval) => (
						<button
							key={timeInterval}
							onClick={() => handleIntervalChange(timeInterval)}
							className={`flex items-center justify-center px-3 py-1 rounded-lg text-sm font-bold text-white transition-colors ${
								selectedInterval === timeInterval
									? "bg-dark-gray-800"
									: "hover:bg-dark-gray-800/50"
							}`}
						>
							{INTERVAL_LABELS[timeInterval] || timeInterval}
						</button>
					))}
					<div className="bg-primary-900 border border-dark-gray-900 rounded-md h-6 flex items-center px-1">
						<Icon_ChevronDownMini className="w-6 h-6" />
					</div>
				</div>

				{/* Divider */}
				<div className="bg-dark-gray-700 w-px h-full self-stretch" />
				{/* Timezone Selector */}

				{/* Divider */}
				<div className="bg-dark-gray-700 w-px h-full self-stretch" />
				{/* Indicators */}
				<div className="flex gap-2 items-center">
					<PopoverWrapper
						open={popoverOpen}
						onOpenChange={setPopoverOpen}
						align="start"
						className="w-[200px] p-2 bg-primary-950 border border-dark-gray-700 rounded-lg"
						trigger={
							<button className="bg-primary-950 border border-dark-gray-700 flex gap-2 items-center justify-center px-3 py-1 rounded-lg cursor-pointer">
								<span className="text-sm font-bold text-white">
									{selectedIndicators.length > 0
										? selectedIndicators[0]
										: "Indicators"}
								</span>
								<Icon_ChevronDownMini className="w-6 h-6" />
							</button>
						}
					>
						<div className="flex flex-col gap-1">
							{AVAILABLE_INDICATORS.map((indicator) => {
								const isSelected = selectedIndicators.includes(
									indicator.value
								);
								return (
									<button
										key={indicator.value}
										onClick={() =>
											handleIndicatorToggle(
												indicator.value
											)
										}
										className={`flex items-center justify-between px-2 py-2 rounded-lg text-sm font-bold transition-colors ${
											isSelected
												? "text-white bg-dark-gray-800"
												: "text-dark-gray-200 hover:bg-dark-gray-800/50"
										}`}
									>
										<span>{indicator.label}</span>
										{isSelected && (
											<div className="w-5 h-5 rounded-full bg-primary-700 flex items-center justify-center">
												<svg
													width="12"
													height="12"
													viewBox="0 0 12 12"
													fill="none"
												>
													<path
														d="M10 3L4.5 8.5L2 6"
														stroke="white"
														strokeWidth="2"
														strokeLinecap="round"
														strokeLinejoin="round"
													/>
												</svg>
											</div>
										)}
									</button>
								);
							})}
						</div>
					</PopoverWrapper>
				</div>

				<div className="flex gap-3 items-center justify-end ml-auto">
					<div className="flex gap-2 items-center">
						<PopoverWrapper
							open={timezonePopoverOpen}
							onOpenChange={setTimezonePopoverOpen}
							align="start"
							className="w-[220px] p-2 bg-primary-950 border border-dark-gray-700 rounded-lg"
							trigger={
								<button className="bg-primary-950 flex gap-2 items-center justify-center px-3 py-1 rounded-lg cursor-pointer">
									<span className="text-sm font-bold text-white">
										{currentTime
											? `${currentTime} (${selectedTimezone})`
											: selectedTimezone}
									</span>
								</button>
							}
						>
							<div className="flex flex-col gap-1">
								{AVAILABLE_TIMEZONES.map((timezone) => (
									<button
										key={timezone.value}
										onClick={() => {
											setSelectedTimezone(timezone.value);
											setTimezonePopoverOpen(false);
										}}
										className={`flex items-center justify-between px-2 py-2 rounded-lg text-sm font-bold transition-colors text-left ${
											selectedTimezone === timezone.value
												? "text-white bg-dark-gray-800"
												: "text-dark-gray-200 hover:bg-dark-gray-800/50"
										}`}
									>
										<span>{timezone.label}</span>
										{selectedTimezone ===
											timezone.value && (
											<div className="w-5 h-5 rounded-full bg-primary-700 flex items-center justify-center">
												<svg
													width="12"
													height="12"
													viewBox="0 0 12 12"
													fill="none"
												>
													<path
														d="M10 3L4.5 8.5L2 6"
														stroke="white"
														strokeWidth="2"
														strokeLinecap="round"
														strokeLinejoin="round"
													/>
												</svg>
											</div>
										)}
									</button>
								))}
							</div>
						</PopoverWrapper>
					</div>
					<button className="w-6 h-6" onClick={handleTakeSnapshot}>
						<IconCamera className="w-full h-full" />
					</button>
				</div>
			</div>

			<div className="flex-1 min-h-0">
				<div ref={chartContainerRef} className="lg:h-[470px] inset-0" />
			</div>
		</div>
	);
};
