"use client";

import TabsWrapper from "@/components/common/tabs";
import TopTraderIcon from "@/components/icon/Icon_TopTraders";
import TransactionIcon from "@/components/icon/Icon_Transactions";
import { useState } from "react";
import TransactionTable from "./TableTransaction";
import TableTopTrader from "./TableTopTraders";

const TableStatistic = () => {
	const [tab, setTab] = useState("transactions");
	return (
		<div className="bg-black rounded-4xl border border-dark-gray-700">
			<TabsWrapper
				tabs={[
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
				]}
				defaultValue={tab}
				onValueChange={(value) => setTab(value)}
				variant="underline"
			/>
			{tab === "transactions" ? <TransactionTable /> : <TableTopTrader />}
		</div>
	);
};

export default TableStatistic;
