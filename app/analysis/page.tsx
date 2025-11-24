import SwapContainer from "@/components/page/analysis/swap";
import TableStatistic from "@/components/page/analysis/tableInfo";
import TableStatisticTrend from "@/components/page/analysis/tableInfo/TableStatisticTrend";
import { TradingPairInfoComponent } from "@/components/page/analysis/TokenInfo";

export default function Analysis() {
	return (
		<div className="h-screen">
			<div className="font-quicksand grid grid-cols-3 px-6 py-4 gap-x-4">
				<div className="col-span-2 space-y-3">
					<TradingPairInfoComponent />
					<TableStatistic />
				</div>
				<div className="col-span-1">
					<SwapContainer />
				</div>
			</div>
			<div className="grid grid-cols-2 gap-x-4 px-6 pb-10">
				<TableStatisticTrend type="UP" />
				<TableStatisticTrend type="DOWN" />
			</div>
		</div>
	);
}
