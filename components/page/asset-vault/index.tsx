"use client";

import Input from "@/components/common/input";
import TabsWrapper from "@/components/common/tabs";
import SearchIcon from "@/components/icon/Icon_ Search";
import { mockStrategies } from "@/data/strategy";
import StrategyCard from "./StrategyCard";

const AssetVaultPage = () => {
	return (
		<div className="flex flex-col gap-y-6">
			<div className="flex items-center justify-between">
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
				/>
			</div>

			<div>
				<div className="min-h-screen">
					<div
						className="
        grid 
        gap-6 
        grid-cols-1 
        md:grid-cols-3 
        lg:grid-cols-3 
      ">
						{mockStrategies.map((strategy) => (
							<StrategyCard key={strategy.id} data={strategy} />
						))}
					</div>
				</div>
			</div>
		</div>
	);
};

export default AssetVaultPage;
