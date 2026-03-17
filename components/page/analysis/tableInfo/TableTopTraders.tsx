/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import React, { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { TableWrapper } from "@/components/common/table";
import DirectIcon from "@/components/icon/IconDirect";
import { formatNumber, formatTime, formatWallet } from "@/lib/format";
import UpdownIcon from "@/components/icon/UpDownIcon";
import Image from "next/image";
import { useFetchTopTraders } from "@/hooks/useFetchTopTrader";
import { TopTrader } from "@/types/transaction";
import { useTokenStore } from "@/store/tokenStore";

export function TableTopTrader() {
	const selectedToken = useTokenStore((state) => state.token);
	const quoteToken = useTokenStore((state) => state.quoteToken);
	
	// Tạo pair từ token và quoteToken đang chọn
	const pair = `${selectedToken.symbol}_${quoteToken.symbol}`;
	
	const { data, isLoading, pagination, setPageIndex, setPageSize } =
		useFetchTopTraders(pair);

	const columns: ColumnDef<TopTrader, any>[] = useMemo(
		() => [
			{
				accessorKey: "rank",
				header: () => (
					<div className="flex items-center justify-between text-dark-gray-200">
						Rank
					</div>
				),
				cell: ({ row }) => (
					<div className="font-medium text-dark-gray-200">
						{row.original.rank}
					</div>
				),
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "walletAddress",
				header: () => (
					<div className="flex items-center justify-between text-dark-gray-200">
						Maker
					</div>
				),
				cell: ({ row }) => {
					return (
						<div className="flex items-center text-sm text-orange-400 gap-x-1">
							<Image
								src="/images/toptrader_icon.png"
								width={18}
								height={18}
								alt="Top Trader Icon"
							/>{" "}
							{formatWallet(row.original.user_id, 3, 3)}
						</div>
					);
				},
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "bought",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							Bought <UpdownIcon />
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm font-semibold">
						{formatNumber(row.original.total_trades) || "-"}
					</div>
				),
				enableSorting: true,
				enableColumnFilter: true,
			},
			// {
			// 	accessorKey: "sold",
			// 	header: () => {
			// 		return (
			// 			<div className="flex items-center justify-between text-dark-gray-200">
			// 				SOLD
			// 				<UpdownIcon size={20} />
			// 			</div>
			// 		);
			// 	},
			// 	cell: ({ row }) => (
			// 		<div className="text-white text-sm">
			// 			<span>
			// 				{formatNumber(row.original.sold.totalValue)}{" "}
			// 			</span>
			// 			<span className="flex items-center text-dark-gray-200">
			// 				{formatNumber(row.original.sold.valueToken)}/
			// 				{formatNumber(row.original.sold.totalTransaction)}
			// 				tnxs
			// 			</span>
			// 		</div>
			// 	),
			// 	enableSorting: false,
			// 	enableColumnFilter: true,
			// },
			// {
			// 	accessorKey: "pnl",
			// 	header: () => {
			// 		return (
			// 			<div className="flex items-center justify-between text-dark-gray-200">
			// 				PNL
			// 				<UpdownIcon size={20} />
			// 			</div>
			// 		);
			// 	},
			// 	cell: ({ row }) => (
			// 		<div className="text-white text-sm">
			// 			{formatNumber(row.original.pnl)}
			// 		</div>
			// 	),
			// 	enableSorting: false,
			// 	enableColumnFilter: true,
			// },

			// {
			// 	accessorKey: "unrealizedPNL",
			// 	header: () => {
			// 		return (
			// 			<div className="flex items-center justify-between text-dark-gray-200">
			// 				Unrealized
			// 			</div>
			// 		);
			// 	},
			// 	cell: ({ row }) => (
			// 		<div className="text-white/90 text-sm">
			// 			{formatNumber(row.original.unrealizedPNL)}
			// 		</div>
			// 	),
			// },
			// {
			// 	accessorKey: "balance",
			// 	header: () => {
			// 		return <div className="text-dark-gray-200">Balance</div>;
			// 	},
			// 	cell: ({ row }) => (
			// 		<button className="text-dark-gray-200 text-sm truncate max-w-[100px]">
			// 			{row.original.balance}
			// 		</button>
			// 	),
			// 	enableSorting: false,
			// 	enableColumnFilter: false,
			// },
			{
				id: "actions",
				header: () => {
					return <div className="text-dark-gray-200">TXH</div>;
				},
				cell: () => (
					<button className="text-dark-gray-200 hover:underline text-sm">
						<DirectIcon size={24} />
					</button>
				),
				enableSorting: false,
				enableColumnFilter: false,
			},
		],
		[]
	);
	return (
		<div className="bg-primary-950 rounded-b-lg">
			<TableWrapper<TopTrader>
				columns={columns}
				data={data}
				isLoading={isLoading}
				pagination={pagination}
				setPageIndex={setPageIndex}
				setPageSize={setPageSize}
				variant={"default"}
			/>
		</div>
	);
}

export default TableTopTrader;
