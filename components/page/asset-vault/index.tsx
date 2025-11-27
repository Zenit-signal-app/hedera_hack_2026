"use client";

import Input from "@/components/common/input";
import TabsWrapper from "@/components/common/tabs";
import SearchIcon from "@/components/icon/Icon_ Search";
import { mockStrategies } from "@/data/strategy";
import StrategyCard from "./StrategyCard";
import { useState, useMemo } from "react";

const AssetVaultPage = () => {
	const [searchTerm, setSearchTerm] = useState("");

	const filteredStrategies = useMemo(() => {
		if (!searchTerm.trim()) {
			return mockStrategies;
		}

		const lowerSearchTerm = searchTerm.toLowerCase().trim();
		return mockStrategies.filter(
			(strategy) =>
				strategy.title.toLowerCase().includes(lowerSearchTerm) ||
				strategy.description.toLowerCase().includes(lowerSearchTerm)
		);
	}, [searchTerm]);

	return (
		<div className="flex flex-col gap-y-6">
			<div className="flex items-center justify-between gap-3">
				<TabsWrapper
					tabs={[
						{ value: "current", label: "Current" },
						{ value: "archived", label: "Archived" },
					]}
					variant="pill"
					defaultValue="current"
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
				<div
					className="
        grid 
        gap-6 
        grid-cols-1 
        lg:grid-cols-3
        items-start
      "
				>
					{filteredStrategies.map((strategy) => (
						<StrategyCard key={strategy.id} data={strategy} />
					))}
				</div>
			</div>
		</div>
	);
};

export default AssetVaultPage;
