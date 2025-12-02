"use client";

import React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { TableWrapper } from "@/components/common/table";
import ArrowUpRightIcon from "@/components/icon/Icon_ArrowUpRight";

interface VaultData {
  id: number;
  vault: string;
  totalDeposit: string;
  currentValue: string;
  roi: string;
  claimable: string;
  action: "Claim" | "View";
  actionColor: string;
  iconColor: string;
}

const VaultEarnings = () => {
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(10);

  const vaultData: VaultData[] = [
    {
      id: 1,
      vault: "ETH-BTC long swing",
      totalDeposit: "$300.50",
      currentValue: "$802.31",
      roi: "+8.5%",
      claimable: "$84.12",
      action: "Claim",
      actionColor: "text-purple-500",
      iconColor: "#893BFF",
    },
    {
      id: 2,
      vault: "SNEK",
      totalDeposit: "$100.50",
      currentValue: "$90.41",
      roi: "+1.02%",
      claimable: "-",
      action: "View",
      actionColor: "text-sky-500",
      iconColor: "#4CCCFA",
    },
    {
      id: 3,
      vault: "WMTX",
      totalDeposit: "$830.00",
      currentValue: "$900.00",
      roi: "+2.31%",
      claimable: "-",
      action: "View",
      actionColor: "text-sky-500",
      iconColor: "#4CCCFA",
    },
    {
      id: 4,
      vault: "ADA",
      totalDeposit: "$2,400.90",
      currentValue: "$3,100.21",
      roi: "+12.55%",
      claimable: "$400.00",
      action: "Claim",
      actionColor: "text-purple-500",
      iconColor: "#893BFF",
    },
  ];

  const columns: ColumnDef<VaultData>[] = [
    {
      accessorKey: "vault",
      header: () => <div className="text-left">Vault</div>,
      cell: ({ row }) => (
        <div className="text-white text-sm font-semibold overflow-hidden text-ellipsis">
          {row.original.vault}
        </div>
      ),
    },
    {
      accessorKey: "totalDeposit",
      header: () => <div className="text-right">Total Deposit</div>,
      cell: ({ row }) => (
        <div className="text-white text-sm font-semibold text-right">
          {row.original.totalDeposit}
        </div>
      ),
    },
    {
      accessorKey: "currentValue",
      header: () => <div className="text-right">Current value</div>,
      cell: ({ row }) => (
        <div className="text-white text-sm font-semibold text-right">
          {row.original.currentValue}
        </div>
      ),
    },
    {
      accessorKey: "roi",
      header: () => <div className="text-right">ROI</div>,
      cell: ({ row }) => (
        <div className="text-white text-sm font-semibold text-right">
          {row.original.roi}
        </div>
      ),
    },
    {
      accessorKey: "claimable",
      header: () => <div className="text-right">Claimable</div>,
      cell: ({ row }) => (
        <div
          className={`text-sm font-semibold text-right ${
            row.original.claimable === "-" ? "text-gray-400" : "text-white"
          }`}
        >
          {row.original.claimable}
        </div>
      ),
    },
    {
      accessorKey: "action",
      header: () => <div className="text-center">Actions</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
          <div
            className={`whitespace-nowrap text-sm font-semibold ${row.original.actionColor}`}
          >
            {row.original.action}
          </div>
          <ArrowUpRightIcon className="w-5 h-5" color={row.original.iconColor} />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col items-center gap-2 bg-black rounded-3xl overflow-hidden border border-gray-700 w-full">
      <div className="flex flex-col min-w-[300px] items-start justify-center gap-4 px-3 py-4 md:p-4 w-full">
        <div className="text-white text-xl font-bold">Vault Earnings</div>
        <TableWrapper
          columns={columns}
          data={vaultData}
          isLoading={false}
          pagination={{
            pageIndex,
            pageSize,
            totalPages: 1,
            totalRecords: vaultData.length,
          }}
          setPageIndex={setPageIndex}
          setPageSize={setPageSize}
          variant="minimal"
          className="border-none"
          rowClassName="rounded-lg overflow-hidden"
          showHeaderBorder={false}
        />
      </div>
    </div>
  );
};

export default VaultEarnings;
