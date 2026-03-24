"use client";

import Input from "@/components/common/input";
import TabsWrapper from "@/components/common/tabs";
import SearchIcon from "@/components/icon/Icon_ Search";
import StrategyCard from "./StrategyCard";
import { useState, useMemo, useEffect } from "react";
import { vaultApi } from "@/services/vaultServices";
import { Vault, VaultStatus } from "@/types/vault";
import { useWalletStore } from "@/store/walletStore";
import { getServerChainId } from "@/services/chainServices";

const AssetVaultPage = () => {
	const [searchTerm, setSearchTerm] = useState("");
	const [tab, setTab] = useState<VaultStatus>("active");
	const [vaults, setVaults] = useState<Vault[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { activeChain } = useWalletStore();

	// Fetch vaults when tab changes
	useEffect(() => {
		const fetchVaults = async () => {
			setIsLoading(true);
			setError(null);
			try {
				const response = await vaultApi.getVaultsByStatus(tab, await getServerChainId(activeChain ?? ""));
				setVaults(response.vaults);
			} catch (err) {
				setError("Failed to fetch vaults");
				console.error("Error fetching vaults:", err);
			} finally {
				setIsLoading(false);
			}
		};

		fetchVaults();
	}, [tab, activeChain]);

	const filteredVaults = useMemo(() => {
		if (!searchTerm.trim()) {
			return vaults;
		}

		const lowerSearchTerm = searchTerm.toLowerCase().trim();
		return vaults.filter(
			(vault) =>
				vault.vault_name.toLowerCase().includes(lowerSearchTerm) ||
				vault.summary?.toLowerCase().includes(lowerSearchTerm)
		);
	}, [searchTerm, vaults]);

	return (
		<div className="flex flex-col gap-y-6 h-screen">
			<div className="flex items-center justify-between">
				<TabsWrapper
					tabs={[
						{ value: "active", label: "Active" },
						{ value: "inactive", label: "Inactive" },
						{ value: "all", label: "All" },
					]}
					variant="pill"
					defaultValue="active"
					value={tab}
					onValueChange={(value) => setTab(value as VaultStatus)}
				/>
				<Input
					className="max-w-80 text-sm"
					startIcon={<SearchIcon />}
					placeholder="Search Vault"
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
				/>
			</div>

			<div>
				{isLoading ? (
					<div className="text-center py-10 text-gray-400">Loading vaults...</div>
				) : error ? (
					<div className="text-center py-10 text-red-500">{error}</div>
				) : filteredVaults.length === 0 ? (
					<div className="text-center py-10 text-gray-400">No vaults found</div>
				) : (
					<div
						className="
        grid 
        gap-6 
        grid-cols-1 
				md:grid-cols-2
        lg:grid-cols-3
        items-start
      "
					>
						{filteredVaults.map((vault) => (
							<StrategyCard key={vault.id} data={vault} />
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default AssetVaultPage;
