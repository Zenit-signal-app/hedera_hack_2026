"use client";

import { useEffect, useRef, useState } from "react";
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
	{ value: "BB", label: "Bollinger Bands" },
] as const;

export const TVChartContainer = ({
	symbol = "USDM_ADA",
	interval = "60",
	indicators = [],
	className = "",
	onIntervalChange,
}: TVChartContainerProps) => {
	const chartContainerRef = useRef<HTMLDivElement>(null);
	const tvWidgetRef = useRef<IChartingLibraryWidget | null>(null);
	const [selectedInterval, setSelectedInterval] = useState(interval);
	const [selectedIndicators, setSelectedIndicators] = useState<string[]>(indicators);
	const [displaySymbol, setDisplaySymbol] = useState(symbol);
	const [isLoading, setIsLoading] = useState(true);
	const [popoverOpen, setPopoverOpen] = useState(false);

	// Fetch chart pairs data on component mount
	const { fetchPairs, pairs } = useFetchChartPairs();

	useEffect(() => {
		// Load initial pairs data from API
		fetchPairs({ limit: 100 });
	}, [fetchPairs]);

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
			tvWidgetRef.current.takeClientScreenshot().then((canvas: HTMLCanvasElement) => {
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
			}).catch((error: Error) => {
				console.error("Failed to take screenshot:", error);
			});
		} catch (error) {
			console.error("Failed to take screenshot:", error);
		}
	};

	return (
		<div
			className={`flex flex-col gap-2 lg:gap-0 overflow-hidden bg-dark-gray-950 rounded-t-lg h-full ${className}`}
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
					<div className="bg-dark-gray-900 border border-dark-gray-900 rounded-md h-6 flex items-center px-1">
						<Icon_ChevronDownMini className="w-6 h-6" />
					</div>
				</div>

				{/* Divider */}
				<div className="bg-dark-gray-700 w-px h-full self-stretch" />

				{/* Indicators */}
				<div className="flex gap-2 items-center">
					<PopoverWrapper
						open={popoverOpen}
						onOpenChange={setPopoverOpen}
						align="start"
						className="w-[200px] p-2 bg-dark-gray-950 border border-dark-gray-700 rounded-lg"
						trigger={
							<button className="bg-dark-gray-950 border border-dark-gray-700 flex gap-2 items-center justify-center px-3 py-1 rounded-lg cursor-pointer">
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
											handleIndicatorToggle(indicator.value)
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
					<button className="w-6 h-6" onClick={handleTakeSnapshot}>
						<IconCamera className="w-full h-full" />
					</button>
				</div>
			</div>

			{/* Chart Container */}
			<div className="flex-1 min-h-0">
				{isLoading && (
					<div className="absolute inset-0 flex items-center justify-center bg-dark-gray-950 z-10">
						<div className="text-white text-sm">
							Loading chart...
						</div>
					</div>
				)}
				<div ref={chartContainerRef} className="lg:h-[470px] inset-0" />
			</div>
		</div>
	);
};
