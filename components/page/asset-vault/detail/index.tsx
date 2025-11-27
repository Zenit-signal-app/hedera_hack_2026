"use client";
import TabsWrapper from "@/components/common/tabs";
import ChevronLeftMiniIcon from "@/components/icon/ChevronLeftMiniICon";
import ChevronDownIcon from "@/components/icon/ChevronDownIcon";
import { mockStrategies } from "@/data/strategy";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import Overview from "./Overview";
import Performance from "./Performance";
import Positions from "./Positions";
import Assets from "./Assets";
import Technical from "./Technical";
import MyDeposits from "./MyDeposits";
import { useState } from "react";

// Mobile Dropdown Menu Component
const MobileTabDropdown = ({
	tabs,
	activeTab,
	onTabChange,
}: {
	tabs: { value: string; label: string }[];
	activeTab: string;
	onTabChange: (value: string) => void;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const activeTabLabel =
		tabs.find((tab) => tab.value === activeTab)?.label || "Overview";

	return (
		<div className="relative md:hidden w-full mt-2 mb-4">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="w-full flex items-center justify-center gap-1 px-4 py-2 bg-dark-glass bg-center bg-cover bg-no-repeat rounded-2xl border border-dark-gray-700 text-white font-semibold"
			>
				<span>{activeTabLabel}</span>
				<ChevronDownIcon
					size={20}
					className={cn(
						"transition-transform duration-200",
						isOpen && "rotate-180"
					)}
				/>
			</button>

			{isOpen && (
				<>
					{/* Backdrop */}
					<div
						className="fixed inset-0 z-40"
						onClick={() => setIsOpen(false)}
					/>
					{/* Dropdown Menu */}
					<div className="absolute top-full left-0 right-0 bg-dark-gray-900 border border-dark-gray-700 rounded-2xl shadow-lg z-50 overflow-hidden">
						{tabs.map((tab) => (
							<button
								key={tab.value}
								onClick={() => {
									onTabChange(tab.value);
									setIsOpen(false);
								}}
								className={cn(
									"w-full text-left px-4 py-3 font-semibold transition-colors",
									activeTab === tab.value
										? "bg-dark-gray-800 text-white"
										: "text-dark-gray-200 hover:bg-dark-gray-800 hover:text-white"
								)}
							>
								{tab.label}
							</button>
						))}
					</div>
				</>
			)}
		</div>
	);
};

const DetailPage = () => {
	const params = useParams();
	const assetId = params?.id;
	const tokenDetail = mockStrategies.find((item) => item.id === assetId);
	const [activeTab, setActiveTab] = useState("overview");

	if (!tokenDetail) {
		return (
			<div className="flex flex-col gap-y-5">
				<div className="text-white text-center py-10">
					Strategy not found
				</div>
			</div>
		);
	}

	const tabItems = [
		{ value: "overview", label: "Overview" },
		{ value: "performance", label: "Performance" },
		{ value: "positions", label: "Positions" },
		{ value: "assets", label: "Assets" },
		{ value: "technical", label: "Technical" },
	];

	return (
		<div className="flex flex-col gap-y-5">
			<Link
				href={"/asset-vault"}
				className="text-white flex items-center gap-x-2 text-base font-bold font-exo"
			>
				<div className="p-1 bg-dark-gray-900 w-max rounded-sm">
					<ChevronLeftMiniIcon size={24} />
				</div>{" "}
				Back
			</Link>

			<Tabs value={activeTab} onValueChange={setActiveTab}>
				{/* Desktop Header with Tabs */}
				<div className="hidden md:block bg-[url(/images/bg_box.png)] bg-center mb-5 bg-cover bg-no-repeat pt-6 px-4 rounded-4xl border border-dark-gray-700">
					<div className="flex items-center w-full gap-x-4">
						<Image
							src={tokenDetail.iconUrl}
							width={56}
							height={56}
							alt="Token Image"
							className="w-14 h-14 rounded-full"
						/>
						<div className="font-quicksand">
							<p className="text-xl font-bold">
								{tokenDetail.title}
							</p>
							<p className="text-base text-dark-gray-100">
								{tokenDetail.description}
							</p>
						</div>
					</div>
					<TabsWrapper
						tabs={tabItems}
						variant="underline"
						defaultValue="overview"
						onValueChange={setActiveTab}
					/>
				</div>

				{/* Mobile/Tablet Header with Dropdown */}
				<div className="md:hidden bg-[url(/images/bg_box.png)] bg-center mb-2 bg-cover bg-no-repeat p-4 rounded-2xl border border-dark-gray-700">
					<div className="flex items-center w-full gap-x-3">
						<Image
							src={tokenDetail.iconUrl}
							width={44}
							height={44}
							alt="Token Image"
							className="w-10 h-10 rounded-full flex-shrink-0"
						/>
						<div className="font-quicksand flex-1 min-w-0">
							<p className="text-base font-bold truncate">
								{tokenDetail.title}
							</p>
							<p className="text-sm text-dark-gray-100 truncate">
								{tokenDetail.description}
							</p>
						</div>
					</div>
				</div>
				<MobileTabDropdown
					tabs={tabItems}
					activeTab={activeTab}
					onTabChange={setActiveTab}
				/>

				<TabsContent value="overview" className="mt-0">
					<div className="flex flex-col lg:grid lg:grid-cols-3 gap-4">
						<div className="col-span-2">
							<Overview data={tokenDetail} />
						</div>
						<div className="col-span-1 hidden lg:block">
							<MyDeposits />
						</div>
					</div>
				</TabsContent>
				<TabsContent value="performance" className="mt-0">
					<Performance data={tokenDetail} />
				</TabsContent>
				<TabsContent value="positions" className="mt-0">
					<Positions data={tokenDetail} />
				</TabsContent>
				<TabsContent value="assets" className="mt-0">
					<Assets data={tokenDetail} />
				</TabsContent>
				<TabsContent value="technical" className="mt-0">
					<Technical data={tokenDetail} />
				</TabsContent>
			</Tabs>
		</div>
	);
};

export default DetailPage;
