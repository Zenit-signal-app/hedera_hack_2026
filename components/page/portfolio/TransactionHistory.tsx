"use client";

import React, { useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { TableWrapper } from "@/components/common/table";
import TabsWrapper, { TabItem } from "@/components/common/tabs";
import Filter1Icon from "@/components/icon/Icon_Filter1";

// Network badge SVG components
const CardanoBadge = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <circle cx="6" cy="6" r="6" fill="#0033AD"/>
    <path d="M6 3L7.5 5.5h2L6 9l-1.5-3H3L6 3z" fill="white"/>
  </svg>
);

const EthereumBadge = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <circle cx="6" cy="6" r="6" fill="#627EEA"/>
    <path d="M6 2L3 6.5l3 1.5 3-1.5L6 2zM6 8.5L3 7l3 4 3-4-3 1.5z" fill="white" opacity="0.8"/>
  </svg>
);

interface TokenInfo {
  name: string;
  amount: string;
  value: string;
  icon: string;
  badge: React.ReactNode;
  isWhiteBg?: boolean;
}

interface TransactionData {
  id: number;
  dateTime: string;
  buyToken: TokenInfo;
  sellToken: TokenInfo;
  status: string;
  statusColor: string;
}

interface VaultTransactionData {
  id: number;
  dateTime: string;
  type: "Deposit" | "Claim";
  vault: string;
  amount: string;
  status: string;
  statusColor: string;
}

// Token display component
const TokenDisplay = ({ token }: { token: TokenInfo }) => (
  <div className="flex items-center gap-2">
    <div className="relative w-7 h-7">
      {token.isWhiteBg ? (
        <div className="absolute h-full top-0 left-0 w-7 flex bg-white rounded-full overflow-hidden">
          <img
            className="flex-1 w-7 object-cover"
            alt={`${token.name} token`}
            src={token.icon}
          />
        </div>
      ) : (
        <div
          className="absolute h-full top-0 left-0 w-7 rounded-full bg-cover bg-center"
          style={{
            backgroundImage: `url(${token.icon})`,
          }}
        />
      )}
      <div className="absolute right-0 bottom-0 w-3 h-3">
        {token.badge}
      </div>
    </div>
    <div className="inline-flex flex-col items-start">
      <span className="font-bold text-white text-sm leading-5 whitespace-nowrap">
        {token.amount} {token.name}
      </span>
      <span className="font-semibold text-gray-400 text-xs leading-4 whitespace-nowrap">
        ≈{token.value}
      </span>
    </div>
  </div>
);

export const TransactionHistory = () => {
  const [activeTab, setActiveTab] = useState("swap");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

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

  const transactionData: TransactionData[] = [
    {
      id: 1,
      dateTime: "10:00 Oct 31, 2025",
      buyToken: {
        name: "SNEK",
        amount: "87,090",
        value: "$200",
        icon: "/images/SNEK.png",
        badge: <CardanoBadge />,
      },
      sellToken: {
        name: "ADA",
        amount: "325.28268741",
        value: "$200",
        icon: "/images/ada.png",
        badge: <CardanoBadge />,
      },
      status: "Completed",
      statusColor: "text-green-500",
    },
    {
      id: 2,
      dateTime: "09:50 Oct 31, 2025",
      buyToken: {
        name: "IAG",
        amount: "776.85454535",
        value: "$82",
        icon: "/images/IAG.png",
        badge: <CardanoBadge />,
      },
      sellToken: {
        name: "ADA",
        amount: "133.36739763",
        value: "$82",
        icon: "/images/ada.png",
        badge: <CardanoBadge />,
      },
      status: "Completed",
      statusColor: "text-green-500",
    },
    {
      id: 3,
      dateTime: "09:44 Oct 31, 2025",
      buyToken: {
        name: "WMTX",
        amount: "416.00085269",
        value: "$55",
        icon: "/images/WMTX.png",
        badge: <CardanoBadge />,
      },
      sellToken: {
        name: "USDT",
        amount: "55.3",
        value: "$55.3",
        icon: "/images/usdt.png",
        badge: <EthereumBadge />,
      },
      status: "Completed",
      statusColor: "text-green-500",
    },
    {
      id: 4,
      dateTime: "12:12 Oct 30, 2025",
      buyToken: {
        name: "FLDT",
        amount: "632.75047604",
        value: "$120",
        icon: "/images/image.png",
        badge: <CardanoBadge />,
        isWhiteBg: true,
      },
      sellToken: {
        name: "USDT",
        amount: "120",
        value: "$120",
        icon: "/images/usdt.png",
        badge: <EthereumBadge />,
      },
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

  const swapColumns: ColumnDef<TransactionData>[] = [
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
      accessorKey: "buyToken",
      header: () => <div>Buy</div>,
      cell: ({ row }) => <TokenDisplay token={row.original.buyToken} />,
    },
    {
      accessorKey: "sellToken",
      header: () => <div>Sell</div>,
      cell: ({ row }) => <TokenDisplay token={row.original.sellToken} />,
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
            defaultValue={activeTab}
            onValueChange={setActiveTab}
          />
        </div>
        
        {activeTab === "swap" ? (
          <TableWrapper
            columns={swapColumns}
            data={transactionData}
            isLoading={false}
            pagination={{
              pageIndex,
              pageSize,
              totalPages: 20,
              totalRecords: 200,
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
