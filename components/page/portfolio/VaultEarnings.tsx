"use client";

import React, { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { TableWrapper } from "@/components/common/table";
import ArrowUpRightIcon from "@/components/icon/Icon_ArrowUpRight";
import { VaultEarning } from "@/types/vault";
import { vaultApi } from "@/services/vaultServices";
import { useWalletStore } from "@/store/walletStore";

interface VaultData extends VaultEarning {
  profit: number;
  profitPercent: number;
  action: "Claim" | "View";
  actionColor: string;
  iconColor: string;
}

const VaultEarnings = () => {
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(10);
  const [vaultData, setVaultData] = useState<VaultData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalRecords, setTotalRecords] = useState(0);
  
  const { usedAddress } = useWalletStore();

  // Fetch vault earnings
  useEffect(() => {
    const fetchEarnings = async () => {
      if (!usedAddress) {
        setError("Wallet address not connected");
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        const response = await vaultApi.getUserVaultEarnings({
          wallet_address: usedAddress,
          limit: pageSize,
          offset: pageIndex * pageSize
        });

        // Transform API response to VaultData format
        const transformedData: VaultData[] = response.earnings.map((earning) => {
          const profit = earning.current_value - earning.total_deposit;
          const profitPercent = (earning.roi * 100);
          const hasClaimable = profit > 0;

          return {
            ...earning,
            profit,
            profitPercent,
            action: hasClaimable ? "Claim" : "View",
            actionColor: hasClaimable ? "text-purple-500" : "text-sky-500",
            iconColor: hasClaimable ? "#893BFF" : "#4CCCFA"
          };
        });

        setVaultData(transformedData);
        setTotalRecords(response.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch vault earnings');
        console.error('Error fetching vault earnings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEarnings();
  }, [usedAddress, pageIndex, pageSize]);

  const columns: ColumnDef<VaultData>[] = [
    {
      accessorKey: "vault_name",
      header: () => <div className="text-left">Vault</div>,
      cell: ({ row }) => (
        <div className="text-white text-sm font-semibold overflow-hidden text-ellipsis">
          {row.original.vault_name}
        </div>
      ),
    },
    {
      accessorKey: "total_deposit",
      header: () => <div className="text-right">Total Deposit</div>,
      cell: ({ row }) => (
        <div className="text-white text-sm font-semibold text-right">
          ${row.original.total_deposit.toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: "current_value",
      header: () => <div className="text-right">Current value</div>,
      cell: ({ row }) => (
        <div className="text-white text-sm font-semibold text-right">
          ${row.original.current_value.toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: "roi_percent",
      header: () => <div className="text-right">ROI</div>,
      cell: ({ row }) => (
        <div className="text-white text-sm font-semibold text-right">
          {row.original.profitPercent > 0 ? '+' : ''}{row.original.profitPercent.toFixed(2)}%
        </div>
      ),
    },
    {
      accessorKey: "profit",
      header: () => <div className="text-right">Profit</div>,
      cell: ({ row }) => (
        <div
          className={`text-sm font-semibold text-right ${
            row.original.profit === 0 ? "text-gray-400" : row.original.profit > 0 ? "text-green-500" : "text-red-500"
          }`}
        >
          {row.original.profit > 0 ? '+' : ''}{row.original.profit > 0 || row.original.profit < 0 ? `$${row.original.profit.toFixed(2)}` : "-"}
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
        
        {/* Loading State */}
        {isLoading && (
          <div className="w-full text-center py-10 text-gray-400">
            Loading vault earnings...
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="w-full text-center py-10 text-red-500">
            {error}
          </div>
        )}

        {/* Table */}
        {!isLoading && !error && (
          <TableWrapper
            columns={columns}
            data={vaultData}
            isLoading={false}
            pagination={{
              pageIndex,
              pageSize,
              totalPages: Math.ceil(totalRecords / pageSize),
              totalRecords: totalRecords,
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
    </div>
  );
};

export default VaultEarnings;
