/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import React, { useState, useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { TableWrapper } from "@/components/common/table";
import Filter1Icon from "@/components/icon/Icon_Filter1";
import DirectIcon from "@/components/icon/IconDirect";
import { formatTime } from "@/lib/format";

interface Transaction {
	id: number;
	type: "BUY" | "SELL";
	usdValue: number;
	createdAt: string;
	from: {
		assetName: string;
		assetValue: number;
	};
	to: {
		assetName: string;
		assetValue: number;
	};
	priceSwap: number;
	txh: string;
	txn: string;
}

// Dữ liệu giả lập
const mockTransactions: Transaction[] = [
	{
		id: 1,
		type: "BUY",
		usdValue: 500.0,
		createdAt: "2025-11-23T10:00:00Z",
		from: {
			assetName: "USDT",
			assetValue: 500.0,
		},
		to: {
			assetName: "ADA",
			assetValue: 1250.0,
		},
		priceSwap: 0.4, // Giá: 1 ADA = 0.4 USDT
		txh: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
		txn: "0x1234567890abcdef1234567890abcdef12345678",
	},
	{
		id: 2,
		type: "SELL",
		usdValue: 120.5,
		createdAt: "2025-11-23T10:30:00Z",
		from: {
			assetName: "ETH",
			assetValue: 0.03,
		},
		to: {
			assetName: "USDC",
			assetValue: 120.5,
		},
		priceSwap: 4016.67, // Giá: 1 ETH = 4016.67 USDC
		txh: "0x9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1098",
		txn: "0x2345678901234567890abcdef1234567890abcdef",
	},
	{
		id: 3,
		type: "BUY",
		usdValue: 85.75,
		createdAt: "2025-11-23T11:45:00Z",
		from: {
			assetName: "USDC",
			assetValue: 85.75,
		},
		to: {
			assetName: "SOL",
			assetValue: 0.7,
		},
		priceSwap: 122.5, // Giá: 1 SOL = 122.50 USDC
		txh: "0x3b4a5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
		txn: "0x345678901234567890abcdef1234567890abcdef12",
	},
	{
		id: 4,
		type: "SELL",
		usdValue: 35.0,
		createdAt: "2025-11-23T13:15:00Z",
		from: {
			assetName: "DOGE",
			assetValue: 450.0,
		},
		to: {
			assetName: "USDT",
			assetValue: 35.0,
		},
		priceSwap: 0.0778, // Giá: 1 DOGE = 0.0778 USDT
		txh: "0x4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d",
		txn: "0x45678901234567890abcdef1234567890abcdef123",
	},
	{
		id: 5,
		type: "BUY",
		usdValue: 1500.0,
		createdAt: "2025-11-23T15:00:00Z",
		from: {
			assetName: "USDT",
			assetValue: 1500.0,
		},
		to: {
			assetName: "BTC",
			assetValue: 0.025,
		},
		priceSwap: 60000.0, // Giá: 1 BTC = 60000 USDT
		txh: "0x5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e",
		txn: "0x5678901234567890abcdef1234567890abcdef1234",
	},
];

export function TransactionTable() {
	const [pagination, setPagination] = useState({
		pageIndex: 0,
		pageSize: 5,
		totalPages: 2,
		totalRecords: 10,
	});

	const [isLoading, setIsLoading] = useState(false);

	const setPageIndex = (page: number) => {
		setPagination((prev) => ({ ...prev, pageIndex: page }));
	};
	const setPageSize = (size: number) => {
		setPagination((prev) => ({ ...prev, pageSize: size }));
	};

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
						{formatTime(row.original.createdAt)}
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
					const type = row.original.type;
					const colorClass =
						type === "BUY"
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
				accessorKey: "usdValue",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							USD <Filter1Icon />
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm font-semibold">
						${row.original.usdValue.toFixed(2)}
					</div>
				),
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "from.assetName", // Truy cập nested object
				header: (header) => {
					console.log("header", header);

					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							SNEK
							<Filter1Icon size={20} />
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm">
						{row.original.from.assetValue.toFixed(2)}{" "}
						{row.original.from.assetName}
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
						{row.original.to.assetValue.toFixed(2)}{" "}
						{row.original.to.assetName}
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
						{row.original.priceSwap.toLocaleString()}
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
							navigator.clipboard.writeText(row.original.txh)
						} // Ví dụ: Copy hash
					>
						{row.original.txh.substring(0, 6)}...
						{row.original.txh.slice(-4)}
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
		<div className="bg-dark-gray-950">
			<TableWrapper<Transaction>
				columns={columns}
				data={mockTransactions.slice(0, pagination.pageSize)}
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
