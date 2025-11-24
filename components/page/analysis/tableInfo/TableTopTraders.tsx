/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import React, { useState, useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { TableWrapper } from "@/components/common/table";
import Filter1Icon from "@/components/icon/Icon_Filter1";
import DirectIcon from "@/components/icon/IconDirect";
import { formatNumber, formatTime, formatWallet } from "@/lib/format";
import UpdownIcon from "@/components/icon/UpDownIcon";
import Image from "next/image";

interface TopTrader {
	rank: number;
	walletAddress: string;
	bought: number;
	sold: {
		totalValue: number;
		valueToken: number;
		totalTransaction: number;
	};
	pnl: number;
	unrealizedPNL: number;
	balance: number;
	txns: string;
	exp: string;
}

// Dữ liệu giả lập
const mockTopTraders: TopTrader[] = [
	{
		rank: 1,
		walletAddress: "0x1A2b3c4D5e6F7a8B9c0D1E2f3A4b5C6d7E8f9A0b",
		bought: 1500000.75,
		sold: {
			totalValue: 980000.5,
			valueToken: 12500.0,
			totalTransaction: 850,
		},
		pnl: 520000.25,
		unrealizedPNL: 180000.7,
		balance: 750000.0,
		txns: "1,200", // Tổng số giao dịch
		exp: "5 years", // Thời gian hoạt động
	},
	{
		rank: 2,
		walletAddress: "0x2B3c4D5e6F7a8B9c0D1E2f3A4b5C6d7E8f9A0b1C",
		bought: 850000.0,
		sold: {
			totalValue: 900000.0,
			valueToken: 8000.0,
			totalTransaction: 520,
		},
		pnl: -50000.0, // Lỗ đã thực hiện
		unrealizedPNL: 20000.5,
		balance: 450000.0,
		txns: "950",
		exp: "3 years",
	},
	{
		rank: 3,
		walletAddress: "0x3C4D5e6F7a8B9c0D1E2f3A4b5C6d7E8f9A0b1C2D",
		bought: 50000.0,
		sold: {
			totalValue: 120000.0,
			valueToken: 500.0,
			totalTransaction: 150,
		},
		pnl: 70000.0,
		unrealizedPNL: 5000.0,
		balance: 30000.0,
		txns: "300",
		exp: "1 year",
	},
	{
		rank: 4,
		walletAddress: "0x4D5e6F7a8B9c0D1E2f3A4b5C6d7E8f9A0b1C2D3E",
		bought: 120000.0,
		sold: {
			totalValue: 0,
			valueToken: 0,
			totalTransaction: 0,
		},
		pnl: 0,
		unrealizedPNL: 15000.99,
		balance: 135000.99,
		txns: "50",
		exp: "6 months",
	},
	{
		rank: 5,
		walletAddress: "0x5E6F7a8B9c0D1E2f3A4b5C6d7E8f9A0b1C2D3E4F",
		bought: 9000000.0,
		sold: {
			totalValue: 8990000.0,
			valueToken: 50000.0,
			totalTransaction: 1500,
		},
		pnl: 10000.0,
		unrealizedPNL: 25000.0,
		balance: 35000.0,
		txns: "2,000",
		exp: "4 years",
	},
];

export function TableTopTrader() {
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
						{formatTime(row.original.rank)}
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
							{formatWallet(row.original.walletAddress, 3, 3)}
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
						{formatNumber(row.original.bought) || "-"}
					</div>
				),
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "sold",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							SOLD
							<UpdownIcon size={20} />
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm">
						<span>
							{formatNumber(row.original.sold.totalValue)}{" "}
						</span>
						<span className="flex items-center text-dark-gray-200">
							{formatNumber(row.original.sold.valueToken)}/
							{formatNumber(row.original.sold.totalTransaction)}
							tnxs
						</span>
					</div>
				),
				enableSorting: false,
				enableColumnFilter: true,
			},
			{
				accessorKey: "pnl",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							PNL
							<UpdownIcon size={20} />
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm">
						{formatNumber(row.original.pnl)}
					</div>
				),
				enableSorting: false,
				enableColumnFilter: true,
			},

			{
				accessorKey: "unrealizedPNL",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							Unrealized
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white/90 text-sm">
						{formatNumber(row.original.unrealizedPNL)}
					</div>
				),
			},
			{
				accessorKey: "balance",
				header: () => {
					return <div className="text-dark-gray-200">Balance</div>;
				},
				cell: ({ row }) => (
					<button className="text-dark-gray-200 text-sm truncate max-w-[100px]">
						{row.original.balance}
					</button>
				),
				enableSorting: false,
				enableColumnFilter: false,
			},
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
		<div className="bg-dark-gray-950">
			<TableWrapper<TopTrader>
				columns={columns}
				data={mockTopTraders.slice(0, pagination.pageSize)}
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
