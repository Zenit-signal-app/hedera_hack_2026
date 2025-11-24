/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { StarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import Image from "next/image";
import GrowUpIcon from "@/components/icon/Icon_GrowUp";
import { formatNumber } from "@/lib/format";
import GrowDownIcon from "@/components/icon/Icon_GrowDown";
import { TableWrapper } from "@/components/common/table";
type TData = {
	assetInfo: {
		assetName: string;
		assetPrefix: string;
		avatar: string;
	};
	isFavorites: boolean;
	marketCap: number;
	lastPrice: number;
	volumeChangePercent: number;
};

type TProps = {
	data?: TData[];
	type: "UP" | "DOWN";
};
export const mockMarketData: TData[] = [
	{
		assetInfo: {
			assetName: "Bitcoin",
			assetPrefix: "BTC",
			avatar: "/icons/btc.png",
		},
		isFavorites: true,
		marketCap: 1300000000000, // 1.3 nghìn tỷ USD
		lastPrice: 65000.55,
		volumeChangePercent: 2.56, // Tăng 2.56%
	},
	{
		assetInfo: {
			assetName: "Ethereum",
			assetPrefix: "ETH",
			avatar: "/icons/eth.png",
		},
		isFavorites: false,
		marketCap: 500000000000, // 500 tỷ USD
		lastPrice: 3800.72,
		volumeChangePercent: -1.15, // Giảm 1.15%
	},
	{
		assetInfo: {
			assetName: "Cardano",
			assetPrefix: "ADA",
			avatar: "/icons/ada.png",
		},
		isFavorites: true,
		marketCap: 15000000000, // 15 tỷ USD
		lastPrice: 0.4501,
		volumeChangePercent: 5.92, // Tăng 5.92%
	},
	{
		assetInfo: {
			assetName: "Solana",
			assetPrefix: "SOL",
			avatar: "/icons/sol.png",
		},
		isFavorites: false,
		marketCap: 60000000000, // 60 tỷ USD
		lastPrice: 125.8,
		volumeChangePercent: 0.05, // Tăng 0.05%
	},
	{
		assetInfo: {
			assetName: "Tether USD",
			assetPrefix: "USDT",
			avatar: "/icons/usdt.png",
		},
		isFavorites: false,
		marketCap: 110000000000, // 110 tỷ USD
		lastPrice: 1.0001,
		volumeChangePercent: -0.01, // Giảm 0.01%
	},
];
const TableStatisticTrend = ({ data = mockMarketData, type }: TProps) => {
	const [page, setPage] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const columns: ColumnDef<TData, any>[] = useMemo(
		() => [
			{
				accessorKey: "isFavorites",
				header: "",
				cell: ({ row }) => (
					<div className="font-medium text-dark-gray-200">
						{row.original.isFavorites ? (
							<StarIcon
								color="var(--color-orange-400)"
								fill="var(--color-orange-400)"
								size={18}
							/>
						) : null}
					</div>
				),
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "token",
				header: () => (
					<div className="flex items-center justify-between text-dark-gray-200">
						Token
					</div>
				),
				cell: ({ row }) => {
					return (
						<div className="flex items-center text-sm text-white gap-x-1">
							<Image
								src={row.original.assetInfo.avatar}
								width={18}
								height={18}
								alt="Top Trader Icon"
							/>{" "}
							<span className="flex items-center">
								{row.original.assetInfo.assetName}/
								{row.original.assetInfo.assetPrefix}
							</span>
						</div>
					);
				},
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "marketCap",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							Market Cap
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm font-semibold">
						${formatNumber(row.original.marketCap)}
					</div>
				),
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "lastPrice",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							Price
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm font-semibold">
						{row.original.lastPrice}
					</div>
				),
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "volume24h",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							Volume 24h
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm">
						{row.original.volumeChangePercent > 0 ? (
							<div className="text-green-500 flex items-center gap-x-1">
								<GrowUpIcon />{" "}
								{formatNumber(row.original.volumeChangePercent)}
								%
							</div>
						) : (
							<div className="text-red-600  flex items-center gap-x-1">
								<GrowDownIcon />
								{formatNumber(row.original.volumeChangePercent)}
							</div>
						)}
					</div>
				),
				enableSorting: false,
				enableColumnFilter: true,
			},
		],
		[]
	);
	return (
		<div className="flex flex-col items-start gap-y-3">
			<p className="text-white text-xl font-bold">
				{type === "UP" ? "Up Trend" : "Down Trend"}
			</p>
			<TableWrapper
				columns={columns}
				data={data}
				variant="minimal"
				isLoading={isLoading}
				pagination={{
					pageIndex: page,
					pageSize: 10,
					totalPages: data.length % 10,
					totalRecords: data.length,
				}}
				setPageIndex={(page) => setPage(page)}
				setPageSize={(page) => {}}
				className="bg-[url(/images/image.png)] bg-cover bg-center bg-no-repeat rounded-md"
			/>
		</div>
	);
};

export default TableStatisticTrend;
