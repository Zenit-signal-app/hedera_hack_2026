/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	IBasicDataFeed,
	LibrarySymbolInfo,
	ResolutionString,
	Bar,
	HistoryMetadata,
	PeriodParams,
} from "@/public/static/charting_library";
import api from "@/axios/axiosInstance";

const resolutionMap: Record<string, string> = {
	"1": "1m",
	"3": "3m",
	"5": "5m",
	"15": "15m",
	"30": "30m",
	"60": "1h",
	"120": "2h",
	"240": "4h",
	D: "1d",
	"1D": "1d",
	W: "1w",
	"1W": "1w",
};

// Global cache for pairs data
let pairsCache: any[] = [];

export const setPairsCache = (pairs: any[]) => {
	pairsCache = pairs;
};

export class CustomDatafeed implements IBasicDataFeed {
	private lastBarsCache = new Map<string, Bar>();

	async onReady(callback: (configuration: any) => void): Promise<void> {
		setTimeout(() => {
			callback({
				supported_resolutions: [
					"1",
					"3",
					"5",
					"15",
					"30",
					"60",
					"120",
					"240",
					"D",
					"W",
				] as ResolutionString[],
				supports_marks: false,
				supports_timescale_marks: false,
				supports_time: true,
			});
		}, 0);
	}

	async searchSymbols(
		userInput: string,
		exchange: string,
		symbolType: string,
		onResult: (items: any[]) => void
	): Promise<void> {
		try {
			// Helper function to format pairs
			const formatPairs = (pairs: any[]) => {
				return pairs.map((pair: any) => {
					const symbol = pair.pair || pair.ticker || "";
					const fullName =
						pair.pair || pair.description || symbol || "";

					return {
						symbol: symbol,
						full_name: fullName,
						description: fullName,
						exchange: pair.exchange || "DEX",
						ticker: symbol,
						type: pair.type || "crypto",
						// Additional data to pass through
						data: pair,
					};
				});
			};

			// If no search input, return all pairs from cache
			if (!userInput || userInput.trim() === "") {
				onResult(formatPairs(pairsCache));
				return;
			}

			// Try cache first for better performance
			const searchTerm = userInput.toLowerCase();
			const cachedResults = pairsCache.filter(
				(pair: any) =>
					(pair.symbol || pair.name || "")
						.toLowerCase()
						.includes(searchTerm) ||
					(pair.description || "")
						.toLowerCase()
						.includes(searchTerm) ||
					(pair.full_name || "").toLowerCase().includes(searchTerm)
			);

			if (cachedResults.length > 0) {
				console.log("🔍 searchSymbols: Found in cache", {
					input: userInput,
					resultCount: cachedResults.length,
				});
				onResult(formatPairs(cachedResults));
				return;
			}
			const response = await api.get("/analysis/charting/pairs", {
				params: {
					query: userInput.trim(),
					limit: 100,
				},
			});

			const data = response.data?.data || response.data || [];

			onResult(formatPairs(data));
		} catch (error: any) {
			console.error("❌ searchSymbols error:", {
				input: userInput,
				message: error?.message,
				status: error?.response?.status,
			});
			onResult([]);
		}
	}

	async resolveSymbol(
		symbolName: string,
		onResolve: (symbolInfo: LibrarySymbolInfo) => void,
		onError: (reason: string) => void
	): Promise<void> {
		try {
			const foundPair = pairsCache.find(
				(pair: any) => (pair.symbol || pair.name || "") === symbolName
			);

			const fullName =
				foundPair?.pair || foundPair?.description || symbolName;
			const description = foundPair?.description || fullName || "";
			const symbolInfo: LibrarySymbolInfo = {
				ticker: symbolName,
				name: symbolName,
				description: description || symbolName,
				type: "crypto",
				session: "24x7",
				timezone: "Etc/UTC",
				exchange: "",
				listed_exchange: "",
				minmov: 1,
				pricescale: 100000000,
				has_intraday: true,
				has_weekly_and_monthly: true,
				supported_resolutions: [
					"5",
					"30",
					"60",
					"240",
					"1D",
				] as ResolutionString[],
				volume_precision: 2,
				data_status: "streaming",
				format: "price",
			};

			setTimeout(() => {
				onResolve(symbolInfo);
			}, 0);
		} catch (error) {
			onError("Symbol resolve error: " + error);
		}
	}

	async getBars(
		symbolInfo: LibrarySymbolInfo,
		resolution: ResolutionString,
		periodParams: PeriodParams,
		onResult: (bars: Bar[], meta: HistoryMetadata) => void,
		onError: (reason: string) => void
	): Promise<void> {
		try {
			const { from, to, countBack } = periodParams;
			let pair = symbolInfo.name;
			if (pair.includes("/")) {
				pair = pair.replace(/\//g, "_");
			}

			const apiResolution =
				resolutionMap[resolution as string] || resolution;
			let fromTime = from;
			let toTime = to;

			if (!fromTime || !toTime) {
				const now = Math.floor(Date.now() / 1000);
				const oneMonthAgo = now - 30 * 24 * 60 * 60;
				fromTime = oneMonthAgo;
				toTime = now;
			}

			const params: any = {
				resolution: apiResolution,
				from_: fromTime,
				to: toTime,
			};

			if (countBack) {
				params.count_back = countBack;
			}

			const response = await api.get(
				`/analysis/charting/history/${pair}`,
				{
					params,
				}
			);

			const data = response.data;

			if (data.s === "no_data") {
				onResult([], { noData: true });
				return;
			}

			if (data.s !== "ok") {
				throw new Error("Invalid response status");
			}

			const bars: Bar[] = data.t.map((time: number, index: number) => ({
				time: time * 1000, // Convert to milliseconds
				open: data.o[index],
				high: data.h[index],
				low: data.l[index],
				close: data.c[index],
				volume: data.v[index] || 0,
			}));

			// Sort bars by time (ascending order - oldest first)
			bars.sort((a, b) => a.time - b.time);

			if (bars.length > 0) {
				// Cache the last bar for real-time updates if needed
				const lastBar = bars[bars.length - 1];
				this.lastBarsCache.set(
					`${symbolInfo.name}_${resolution}`,
					lastBar
				);
			}

			onResult(bars, { noData: bars.length === 0 });
		} catch (error: any) {
			onError(error?.message || "Failed to fetch bars");
		}
	}

	subscribeBars(
		symbolInfo: LibrarySymbolInfo,
		resolution: ResolutionString,
		onTick: (bar: Bar) => void,
		listenerGuid: string,
		onResetCacheNeededCallback: () => void
	): void {}

	unsubscribeBars(listenerGuid: string): void {}
}
