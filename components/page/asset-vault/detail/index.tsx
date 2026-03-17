"use client";
import TabsWrapper from "@/components/common/tabs";
import ChevronLeftMiniIcon from "@/components/icon/ChevronLeftMiniICon";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import Overview from "./Overview";
import Performance from "./Performance";
import Positions from "./Positions";
import MyDeposits from "./MyDeposits";
import { useState, useEffect } from "react";
import { vaultApi } from "@/services/vaultServices";
import { VaultInfo } from "@/types/vault";
import { useWalletStore } from "@/store/walletStore";
import { getServerChainId } from "@/services/chainServices";

const DetailPage = () => {
	const params = useParams();
	const assetId = params?.id as string;
	const [vaultInfo, setVaultInfo] = useState<VaultInfo | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState("overview");
	const { activeChain } = useWalletStore();

	useEffect(() => {
		const fetchVaultInfo = async () => {
			if (!assetId) return;

			setIsLoading(true);
			setError(null);
			try {
				const data = await vaultApi.getVaultInfo(assetId, await getServerChainId(activeChain ?? ""));
				setVaultInfo(data);
			} catch (err) {
				setError("Failed to fetch vault information");
				console.error("Error fetching vault info:", err);
			} finally {
				setIsLoading(false);
			}
		};

		fetchVaultInfo();
	}, [assetId, activeChain]);

	if (isLoading) {
		return (
			<div className="flex flex-col gap-y-5">
				<div className="text-white text-center py-10">
					Loading vault information...
				</div>
			</div>
		);
	}

	if (error || !vaultInfo) {
		return (
			<div className="flex flex-col gap-y-5">
				<div className="text-white text-center py-10">
					{error || "Vault not found"}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-y-5">
			<Link
				href={"/asset-vault"}
				className="text-white flex items-center gap-x-2 text-base font-bold font-exo"
			>
				<div className="p-1 bg-primary-900 w-max rounded-sm">
					<ChevronLeftMiniIcon size={24} />
				</div>{" "}
				Back
			</Link>

			<Tabs value={activeTab} onValueChange={setActiveTab}>
				<div className="bg-[url(/images/bg_box.png)] bg-center mb-5 bg-cover bg-no-repeat pt-6 px-4 rounded-4xl  border border-dark-gray-700">
					<div className="flex items-center w-full gap-x-4">
						<Image
							src={
								vaultInfo.icon_url ||
								"/images/ada.png"
							}
							width={56}
							height={56}
							alt="Vault Image"
							className="w-14 h-14 rounded-full"
						/>
						<div className="font-quicksand">
							<p className="text-xl  font-bold">
								{vaultInfo.vault_name}
							</p>
							<p className="text-base text-dark-gray-100">
								{vaultInfo.summary ||
									"No description available"}
							</p>
						</div>
					</div>
					<TabsWrapper
						tabs={[
							{ value: "overview", label: "Overview" },
							{ value: "performance", label: "Performance" },
							{ value: "positions", label: "Positions" },
						]}
						variant="underline"
						defaultValue="overview"
						onValueChange={setActiveTab}
						value={activeTab}
					/>
				</div>

				<TabsContent value="overview" className="mt-0">
					<div className="grid lg:grid-cols-3 gap-x-4">
						<div className="col-span-2">
							<Overview data={vaultInfo} />
						</div>
						<div className="col-span-1 hidden lg:block">
							<MyDeposits
								vaultId={vaultInfo.id}
								poolId={vaultInfo.pool_id}
								vaultAddress={vaultInfo.address}
								vaultState={vaultInfo.state}
							/>
						</div>
					</div>
				</TabsContent>
				<TabsContent value="performance" className="mt-0">
					<Performance data={vaultInfo} />
				</TabsContent>
				<TabsContent value="positions" className="mt-0">
					<Positions data={vaultInfo} />
				</TabsContent>
			</Tabs>
		</div>
	);
};

export default DetailPage;
