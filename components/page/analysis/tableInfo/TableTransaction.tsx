/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import React, { useState, useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { TableWrapper } from "@/components/common/table";
import Filter1Icon from "@/components/icon/Icon_Filter1";
import DirectIcon from "@/components/icon/IconDirect";
import { formatNumber, formatTime } from "@/lib/format";
import { useFetchTransactions } from "@/hooks/useFetchTransactions";
import { Transaction } from "@/types/transaction";

export function TransactionTable() {
	const { data, isLoading, pagination, setPageIndex, setPageSize } =
		useFetchTransactions();
	const columns: ColumnDef<Transaction, any>[] = useMemo(
		() => [
			{
				accessorKey: "createdAt",
				header: () => (
					<div className="flex items-center justify-between text-dark-gray-200">
						ID
						<Filter1Icon size={20} />
					</div>
				),
				cell: ({ row }) => (
					<div className="font-medium text-white">
						{formatTime(row.original.timestamp)}
					</div>
				),
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "type",
				header: () => (
					<div className="flex items-center justify-between text-dark-gray-200">
						Type
						<Filter1Icon size={20} />
					</div>
				),
				cell: ({ row }) => {
					const type = row.original.status;
					const colorClass =
						type === "completed"
							? "text-green-500 font-bold"
							: "text-red-500 font-bold";
					return (
						<div className="flex items-center text-sm">
							<span className={colorClass}>{type}</span>
						</div>
					);
				},
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "price",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							USD <Filter1Icon />
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm font-semibold">
						${formatNumber(row.original.price)}
					</div>
				),
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "from.assetName",
				header: (header) => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							SNEK
							<Filter1Icon size={20} />
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm">
						{formatNumber(row.original.from_amount)}
					</div>
				),
				enableSorting: false,
				enableColumnFilter: true,
			},
			{
				accessorKey: "to.assetName",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							ADA
							<Filter1Icon size={20} />
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm">
						{formatNumber(row.original.to_amount)}
					</div>
				),
				enableSorting: false,
				enableColumnFilter: true,
			},

			{
				accessorKey: "priceSwap",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							Price
							<Filter1Icon size={20} />
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white/90 text-sm">
						${formatNumber(row.original.price)}
					</div>
				),
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "txh",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							Maker
							<Filter1Icon size={20} />
						</div>
					);
				},
				cell: ({ row }) => (
					<button
						className="text-gray-200 text-xs truncate max-w-[100px]"
						onClick={() =>
							navigator.clipboard.writeText(
								row.original.transaction_id
							)
						} // Ví dụ: Copy hash
					>
						{row.original.transaction_id}
					</button>
				),
				enableSorting: false,
				enableColumnFilter: false,
			},
			{
				id: "actions",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							TXN
						</div>
					);
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
		<div className="bg-dark-gray-950 rounded-b-lg">
			<TableWrapper<Transaction>
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

export default TransactionTable;
