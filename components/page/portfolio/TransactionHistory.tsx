"use client";

import React, { useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { TableWrapper } from "@/components/common/table";
import TabsWrapper, { TabItem } from "@/components/common/tabs";
import Filter1Icon from "@/components/icon/Icon_Filter1";
import { useWalletStore } from "@/store/walletStore";
import { useFetchUserSwaps, SwapTransaction } from "@/hooks/useFetchUserSwaps";
import Image from "next/image";
import dayjs from "dayjs";
import Link from "next/link";
import DirectIcon from "@/components/icon/IconDirect";

interface VaultTransactionData {
	id: number;
	dateTime: string;
	type: "Deposit" | "Claim";
	vault: string;
	amount: string;
	status: string;
	statusColor: string;
}

// Token display component - for API response data
const SwapTokenDisplay = ({
	symbol,
	amount,
	logo_url,
}: {
	symbol: string;
	amount: string;
	logo_url: string;
}) => {
	console.log(symbol);

	return (
		<div className="flex items-center gap-2">
			<div className="relative w-7 h-7">
				<Image
					className="flex-1 w-7 object-cover rounded-full"
					alt={`${symbol} token`}
					src={symbol === "ADA" ? "/images/ada.png" : logo_url}
					width={28}
					height={28}
				/>
			</div>
			<div className="inline-flex flex-col items-start">
				<span className="font-bold text-white text-sm leading-5 whitespace-nowrap">
					{parseFloat(amount).toLocaleString(undefined, {
						maximumFractionDigits: 8,
					})}{" "}
					{symbol}
				</span>
			</div>
		</div>
	);
};

export const TransactionHistory = () => {
	const [activeTab, setActiveTab] = useState("swap");
	const [pageIndex, setPageIndex] = useState(0);
	const [pageSize, setPageSize] = useState(10);

	// Get wallet info from store
	const usedAddress = useWalletStore((state) => state.usedAddress);
	const { swaps, total, isLoading } = useFetchUserSwaps({
		walletAddress: usedAddress,
		page: pageIndex + 1,
		limit: pageSize,
		enabled: activeTab === "swap",
	});

	const tabs: TabItem[] = [
		{ value: "swap", label: "Swap" },
		{ value: "vault", label: "Vault" },
	];

	const vaultTransactionData: VaultTransactionData[] = [
		{
			id: 1,
			dateTime: "09:50 Oct 31, 2025",
			type: "Deposit",
			vault: "ETH-BTC long swing",
			amount: "$802.31",
			status: "Completed",
			statusColor: "text-green-500",
		},
		{
			id: 2,
			dateTime: "09:50 Oct 31, 2025",
			type: "Claim",
			vault: "ADA",
			amount: "$50.00",
			status: "Completed",
			statusColor: "text-green-500",
		},
		{
			id: 3,
			dateTime: "09:50 Oct 31, 2025",
			type: "Deposit",
			vault: "SNEK",
			amount: "$100.50",
			status: "Completed",
			statusColor: "text-green-500",
		},
		{
			id: 4,
			dateTime: "09:50 Oct 31, 2025",
			type: "Claim",
			vault: "WMTX",
			amount: "$830.00",
			status: "Completed",
			statusColor: "text-green-500",
		},
		{
			id: 5,
			dateTime: "09:50 Oct 31, 2025",
			type: "Deposit",
			vault: "ADA",
			amount: "$2,400.90",
			status: "Completed",
			statusColor: "text-green-500",
		},
	];

	const vaultColumns: ColumnDef<VaultTransactionData>[] = [
		{
			accessorKey: "dateTime",
			header: () => (
				<div className="flex items-center gap-1">
					<span>Date & time</span>
					<Filter1Icon className="w-5 h-5" />
				</div>
			),
			cell: ({ row }) => (
				<time className="font-semibold text-gray-400 text-sm leading-5 whitespace-nowrap">
					{row.original.dateTime}
				</time>
			),
		},
		{
			accessorKey: "type",
			header: () => <div>Type</div>,
			cell: ({ row }) => (
				<div className="font-semibold text-white text-sm leading-5 whitespace-nowrap">
					{row.original.type}
				</div>
			),
		},
		{
			accessorKey: "vault",
			header: () => <div>Vault</div>,
			cell: ({ row }) => (
				<div className="font-semibold text-white text-sm leading-5 whitespace-nowrap">
					{row.original.vault}
				</div>
			),
		},
		{
			accessorKey: "amount",
			header: () => <div>Amount</div>,
			cell: ({ row }) => (
				<div className="font-semibold text-white text-sm leading-5 whitespace-nowrap">
					{row.original.amount}
				</div>
			),
		},
		{
			accessorKey: "status",
			header: () => (
				<div className="flex items-center justify-end gap-1">
					<span>Status</span>
					<Filter1Icon className="w-5 h-5" />
				</div>
			),
			cell: ({ row }) => (
				<div className="text-right">
					<span
						className={`font-semibold ${row.original.statusColor} text-sm leading-5 whitespace-nowrap`}
					>
						{row.original.status}
					</span>
				</div>
			),
		},
	];

	const swapColumns: ColumnDef<SwapTransaction>[] = [
		{
			accessorKey: "dateTime",
			header: () => (
				<div className="flex items-center gap-1">
					<span>Date & time</span>
				</div>
			),
			cell: ({ row }) => (
				<time className="font-semibold text-gray-400 text-sm leading-5 whitespace-nowrap">
					{dayjs(row.original.timestamp * 1000).format(
						"hh:mm A MMM DD, YYYY"
					)}
				</time>
			),
		},
		{
			accessorKey: "fromToken",
			header: () => <div>Sell</div>,
			cell: ({ row }) => (
				<SwapTokenDisplay
					symbol={row.original.fromToken.tokenInfo.symbol}
					amount={row.original.fromToken.amount}
					logo_url={row.original.fromToken.tokenInfo.logo_url}
				/>
			),
		},
		{
			accessorKey: "toToken",
			header: () => <div>Buy</div>,
			cell: ({ row }) => (
				<SwapTokenDisplay
					symbol={row.original.toToken.tokenInfo.symbol}
					amount={row.original.toToken.amount}
					logo_url={row.original.toToken.tokenInfo.logo_url}
				/>
			),
		},
		{
			accessorKey: "txn",
			header: () => (
				<div className="flex items-center justify-end gap-1">
					<span>Txn</span>
				</div>
			),
			cell: ({ row }) => (
				<div className="float-right flex items-center justify-end gap-1">
					<Link
						href={`https://cardanoscan.io/transaction/${row.original.txn}`}
						className="font-semibold text-end w-full text-green-500 text-sm leading-5 whitespace-nowrap"
						target="_blank"
					>
						{formatTxHash(row.original.txn)} <DirectIcon size={16} />
					</Link>
				</div>
			),
		},
	];

	return (
		<section className="flex flex-col items-center gap-2 relative w-full bg-black rounded-3xl overflow-hidden border border-gray-700">
			<div className="flex flex-col min-w-[300px] items-start justify-center gap-4 px-3 py-4 md:p-4 relative w-full rounded-3xl">
				<h2 className="self-stretch font-bold text-white text-xl leading-7 relative">
					Transaction History
				</h2>

				<div className="border-b border-gray-700 w-full">
					<TabsWrapper
						tabs={tabs}
						variant="underline"
						defaultValue={"swap"}
						onValueChange={setActiveTab}
						value={activeTab}
					/>
				</div>

				{activeTab === "swap" ? (
					<TableWrapper
						columns={swapColumns}
						data={swaps}
						isLoading={isLoading}
						pagination={{
							pageIndex,
							pageSize,
							totalPages: Math.ceil(total / pageSize),
							totalRecords: total,
						}}
						setPageIndex={setPageIndex}
						setPageSize={setPageSize}
						variant="minimal"
						className="border-none"
						rowClassName="rounded-lg overflow-hidden"
						showHeaderBorder={false}
					/>
				) : (
					<TableWrapper
						columns={vaultColumns}
						data={vaultTransactionData}
						isLoading={false}
						pagination={{
							pageIndex,
							pageSize,
							totalPages: 1,
							totalRecords: vaultTransactionData.length,
						}}
						setPageIndex={setPageIndex}
						setPageSize={setPageSize}
						variant="minimal"
						className="border-none"
						rowClassName="rounded-lg overflow-hidden"
						showHeaderBorder={false}
					/>
				)}
			</div>
		</section>
	);
};

export default TransactionHistory;
function formatTxHash(txn: string): string {
	if (!txn || txn.length <= 10) return txn;
	return `${txn.slice(0, 6)}...${txn.slice(-4)}`;
}
