"use client";

import TabsWrapper from "@/components/common/tabs";
import TopTraderIcon from "@/components/icon/Icon_TopTraders";
import TransactionIcon from "@/components/icon/Icon_Transactions";
import { useEffect, useMemo, useState } from "react";
import TransactionTable from "./TableTransaction";
import TableTopTrader from "./TableTopTraders";
import { useIsMobile } from "@/src/components/hooks/useIsMobile";
import dynamic from "next/dynamic";
import { useTokenStore } from "@/store/tokenStore";
const TVChartContainer = dynamic(
	() =>
		import("@/components/common/tvChart").then(
			(mod) => mod.TVChartContainer
		),
	{
		ssr: false,
	}
);
const TableStatistic = () => {
	const isMobile = useIsMobile();
	const [tab, setTab] = useState(() =>
		isMobile ? "charts" : "transactions"
	);

	const { token, quoteToken } = useTokenStore((state) => state);

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
					<TVChartContainer
						symbol={`${token.symbol}_${quoteToken.symbol}`}
						className="w-full h-80 rounded-lg mb-4"
						interval="5"
					/>
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
					<TVChartContainer
						symbol={`${token.symbol}_${quoteToken.symbol}`}
						className="w-full h-80 rounded-lg mb-4"
						interval="5"
					/>
				);
			}
		}
	}, [tab]);
	return (
		<div className="bg-black border border-dark-gray-700">
			<TabsWrapper
				tabs={tabs}
				defaultValue={isMobile ? "charts" : "transactions"}
				onValueChange={(value) => setTab(value)}
				variant="underline"
				value={tab}
			/>
			{renderView}
		</div>
	);
};

export default TableStatistic;
