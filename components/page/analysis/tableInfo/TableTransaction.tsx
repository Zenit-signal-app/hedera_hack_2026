/* eslint-disable react-hooks/preserve-manual-memoization */
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
import { useTokenStore } from "@/store/tokenStore";
import Link from "next/link";

export function TransactionTable() {
	const selectedToken = useTokenStore((state) => state.token);
	const quoteToken = useTokenStore((state) => state.quoteToken);
	
	// Tạo pair từ token và quoteToken đang chọn
	const pair = `${selectedToken.coin}_${quoteToken.coin}`;
	
	const { data, isLoading, pagination, setPageIndex, setPageSize } =
		useFetchTransactions(pair);

	const getTransactionType = (transaction: Transaction): "BUY" | "SELL" => {
		const isFromQuote =
			transaction.from_token === quoteToken.coin ||
			transaction.from_token === quoteToken.symbol;
		return isFromQuote ? "BUY" : "SELL";
	};

	const getTypeColor = (type: "BUY" | "SELL") => {
		return type === "BUY" ? "text-green-500" : "text-red-500";
	};

	const baseAssetSymbol = selectedToken.coin;
	const quoteAssetSymbol = quoteToken.coin;

	const columns: ColumnDef<Transaction, any>[] = useMemo(
		() => [
			{
				accessorKey: "timestamp",
				header: () => (
					<div className="flex items-center justify-between text-dark-gray-200">
						Time
					</div>
				),
				cell: ({ row }) => (
					<div className="font-medium text-white">
						{formatTime(row.original.timestamp * 1000)}
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
					</div>
				),
				cell: ({ row }) => {
					const type = getTransactionType(row.original);
					const colorClass = `${getTypeColor(type)} font-bold`;
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
				accessorKey: "from_amount",
				header: () => (
					<div className="flex items-center justify-between text-dark-gray-200">
						Total {baseAssetSymbol}
					</div>
				),
				cell: ({ row }) => {
					const type = getTransactionType(row.original);
					const colorClass = getTypeColor(type);
					return (
						<div className={`text-sm font-semibold ${colorClass}`}>
							{formatNumber(row.original.from_amount)}
						</div>
					);
				},
				enableSorting: false,
				enableColumnFilter: true,
			},
			{
				accessorKey: "to_amount",
				header: () => (
					<div className="flex items-center justify-between text-dark-gray-200">
						Total {quoteAssetSymbol}
					</div>
				),
				cell: ({ row }) => {
					const type = getTransactionType(row.original);
					const colorClass = getTypeColor(type);
					return (
						<div className={`text-sm font-semibold ${colorClass}`}>
							{formatNumber(row.original.to_amount)}
						</div>
					);
				},
				enableSorting: false,
				enableColumnFilter: true,
			},
			{
				accessorKey: "price",
				header: () => (
					<div className="flex items-center justify-between text-dark-gray-200">
						Price
					</div>
				),
				cell: ({ row }) => {
					const type = getTransactionType(row.original);
					const colorClass = getTypeColor(type);
					return (
						<div className={`text-sm font-semibold ${colorClass}`}>
							${formatNumber(row.original.price)}
						</div>
					);
				},
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				id: "txn",
				header: () => (
					<div className="flex items-center justify-between text-dark-gray-200">
						Txn
					</div>
				),
				cell: ({ row }) => (
					<Link
						href={`https://cardanoscan.io/transaction/${row.original.transaction_id}`}
						className="text-dark-gray-200 hover:underline text-sm"
						target="_blank"
					>
						<DirectIcon size={24} />
					</Link>
				),
				enableSorting: false,
				enableColumnFilter: false,
			},
		],
		[baseAssetSymbol, quoteAssetSymbol]
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
