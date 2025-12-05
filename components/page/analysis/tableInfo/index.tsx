"use client";

import TabsWrapper from "@/components/common/tabs";
import TopTraderIcon from "@/components/icon/Icon_TopTraders";
import TransactionIcon from "@/components/icon/Icon_Transactions";
import { useMemo, useState } from "react";
import TransactionTable from "./TableTransaction";
import TableTopTrader from "./TableTopTraders";
import { useIsMobile } from "@/src/components/hooks/useIsMobile";
import dynamic from "next/dynamic";
const AdvancedRealTimeChart = dynamic(
	() =>
		import("react-ts-tradingview-widgets").then(
			(w) => w.AdvancedRealTimeChart
		),
	{
		ssr: false,
	}
);
const TableStatistic = () => {
	const isMobile = useIsMobile();
	const defaultTab = isMobile ? "charts" : "transactions"
	const [tab, setTab] = useState(defaultTab);
	const tabs = useMemo(() => {
		if (isMobile) {
			return [
				{
					value: "charts",
					label: <div className="text-sm">Chart</div>,
				},
				{
					value: "transactions",
					label: <div className="text-sm">Transactions</div>,
				},
				{
					value: "top_traders",
					label: <div className="text-sm">Top Traders</div>,
				},
			];
		}
		return [
			{
				value: "transactions",
				label: (
					<div className="text-sm">
						<TransactionIcon /> Transactions
					</div>
				),
			},
			{
				value: "top_traders",
				label: (
					<div className="text-sm">
						<TopTraderIcon /> Top Traders
					</div>
				),
			},
		];
	}, [isMobile]);
	const renderView = useMemo(() => {
		switch (tab) {
			case "charts": {
				return (
					<AdvancedRealTimeChart
						theme="dark"
						height={470}
						width={"100%"}
						symbol="BITGET:SNEKUSDT"
					></AdvancedRealTimeChart>
				);
			}
			case "transactions": {
				return <TransactionTable />;
			}
			case "top_traders": {
				return <TableTopTrader />;
			}
			default: {
				return (
					<AdvancedRealTimeChart
						theme="dark"
						height={470}
						width={"100%"}
						symbol="BITGET:SNEKUSDT"
						hide_side_toolbar
					></AdvancedRealTimeChart>
				);
			}
		}
	}, [tab]);
	return (
		<div className="bg-black rounded-4xl border border-dark-gray-700">
			<TabsWrapper
				tabs={tabs}
				defaultValue={tab}
				onValueChange={(value) => setTab(value)}
				variant="underline"
			/>
			{renderView}
		</div>
	);
};

export default TableStatistic;
