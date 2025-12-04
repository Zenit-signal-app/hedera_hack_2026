import AnalysisWrapper from "@/components/page/analysis";
import SwapContainer from "@/components/page/analysis/swap";
import TableStatistic from "@/components/page/analysis/tableInfo";
import TableStatisticTrend from "@/components/page/analysis/tableInfo/TableStatisticTrend";
import { TradingPairInfoComponent } from "@/components/page/analysis/token/TokenInfo";
import { getTrendAnalysisServer } from "@/services/analysisServices";
import { TrendPair } from "@/types";
export default async function Analysis() {
	let uptrendData = [] as TrendPair[];
	let downtrendData = [] as TrendPair[];

	try {
		const trendData = await getTrendAnalysisServer("1d");
		uptrendData = trendData.uptrend;
		downtrendData = trendData.downtrend;
	} catch (error) {
		console.error("Error fetching trends on server:", error);
	}
	return (
		<AnalysisWrapper
			uptrendData={uptrendData}
			downtrendData={downtrendData}
		/>
	);
}
