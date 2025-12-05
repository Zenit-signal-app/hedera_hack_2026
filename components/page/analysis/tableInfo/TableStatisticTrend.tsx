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
import { TradingPairTrend, TrendPair } from "@/types";

type TProps = {
	data: TrendPair[];
	type: "UP" | "DOWN";
};

const TableStatisticTrend = ({ data, type }: TProps) => {
	const [page, setPage] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const columns: ColumnDef<TrendPair, any>[] = useMemo(
		() => [
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
								src={row.original.logo_url}
								width={18}
								height={18}
								alt="Top Trader Icon"
							/>{" "}
							<span className="flex items-center">
								{row.original.pair}
							</span>
						</div>
					);
				},
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "market_cap",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200 capitalize">
							Market Cap
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm font-semibold">
						${formatNumber(row.original.market_cap)}
					</div>
				),
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "number",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							Price
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm font-semibold">
						{row.original.price}
					</div>
				),
				enableSorting: true,
				enableColumnFilter: true,
			},
			{
				accessorKey: "volume_24h",
				header: () => {
					return (
						<div className="flex items-center justify-between text-dark-gray-200">
							Volume 24h
						</div>
					);
				},
				cell: ({ row }) => (
					<div className="text-white text-sm">
						{type === "UP" ? (
							<div className="text-green-500 flex items-center gap-x-1">
								<GrowUpIcon />
								{formatNumber(row.original.change_24h, 0)}%
							</div>
						) : (
							<div className="text-red-600  flex items-center gap-x-1">
								<GrowDownIcon />
								{formatNumber(row.original.change_24h, 2)}%
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
				showPagination={false}
			/>
		</div>
	);
};

export default TableStatisticTrend;
