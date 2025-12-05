"use client";

import { TrendPair } from "@/types";
import SwapContainer from "./swap";
import TableStatistic from "./tableInfo";
import TableStatisticTrend from "./tableInfo/TableStatisticTrend";
import { TradingPairInfoComponent } from "./token/TokenInfo";
import { useIsMobile } from "@/src/components/hooks/useIsMobile";
import { Sheet } from "@/components/ui/sheet";
import Drawer from "@/components/common/drawer";
import { useState } from "react";

type TProps = {
	uptrendData: TrendPair[];
	downtrendData: TrendPair[];
};

const AnalysisWrapper = ({ uptrendData, downtrendData }: TProps) => {
	const isMobile = useIsMobile();
	const [open, setOpen] = useState(false);
	return isMobile ? (
		<div className="h-screen">
			<div className="font-quicksand grid grid-cols-1 lg:px-6 px-4 pt-4 gap-y-4 pb-40">
				<div className="col-span-1 space-y-3">
					<TradingPairInfoComponent />

					<TableStatistic />
				</div>
				<TableStatisticTrend type="UP" data={uptrendData} />
				<TableStatisticTrend type="DOWN" data={downtrendData} />
				<div className="col-span-1 relative">
					<button
						onClick={() => setOpen(true)}
						className={`w-[calc(100%-32px)] py-3 fixed z-9999 text-lg bottom-0 left-4 font-bold text-white font-museomoderno rounded-lg transition-colors ${"bg-primary-700 hover:shadow-md hover:shadow-primary-800"}`}
					>
						Swap
					</button>
					<Drawer
						open={open}
						onOpenChange={(o) => setOpen(o)}
						side="bottom"
					>
						<SwapContainer />
					</Drawer>
				</div>
			</div>
		</div>
	) : (
		<div className="h-screen">
			<div className="font-quicksand lg:grid lg:grid-cols-3 px-6 py-4 gap-x-4">
				<div className="col-span-2 space-y-3">
					<TradingPairInfoComponent />

					<TableStatistic />
				</div>
				<div className="col-span-1">
					<SwapContainer />
				</div>
			</div>
			<div className="grid grid-cols-2 gap-x-4 px-6 lg:pb-24">
				<TableStatisticTrend type="UP" data={uptrendData} />
				<TableStatisticTrend type="DOWN" data={downtrendData} />
			</div>
		</div>
	);
};

export default AnalysisWrapper;
