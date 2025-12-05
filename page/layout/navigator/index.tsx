"use client";
import { usePathname } from "next/navigation";
import Input from "@/components/common/input";
import AIAsistantIcon from "@/components/icon/AIAsistantIcon";
import PortfolioIcon from "@/components/icon/Icon_ Portfolio";
import SearchIcon from "@/components/icon/Icon_ Search";
import VaultIcon from "@/components/icon/Icon_ Vault";
import Image from "next/image";
import { cn } from "@/lib/ultils";
import AnalysisIcon1 from "@/components/icon/Icon_ Analysis-1";
import Link from "next/link";
import { useIsMobile } from "@/src/components/hooks/useIsMobile";

const listNavigators = [
	{
		logo: <AnalysisIcon1 size={32} />,
		text: "Analysis",
		url: "/analysis",
	},

	{
		logo: <VaultIcon size={32} />,
		text: "Asset Vault",
		url: "/asset-vault",
	},
	{
		logo: <AIAsistantIcon size={32} />,
		text: "AI Assistant",
		url: "/ai-asistant",
	},
	{
		logo: <PortfolioIcon size={32} />,
		text: "PortFolio",
		url: "/portfolio",
	},
];
const Navigator = () => {
	const pathname = usePathname();
	const isMobile = useIsMobile();
	return (
		<div className="flex w-full lg:h-full h-max flex-col gap-y-4 items-start py-4 px-3 lg:bg-dark-gray-950 bg-black">
			{isMobile ? null : (
				<>
					<Link href="/">
						<Image
							className=""
							width={174}
							height={44}
							alt="Logo"
							src="/images/logo.png"
						/>
					</Link>{" "}
					<Input
						startIcon={<SearchIcon size={20} />}
						className="w-full h-10"
					/>
				</>
			)}

			<div className="space-y-3 w-full">
				{listNavigators.map((item) => {
					const isActive = pathname.includes(item.url);
					return (
						<Link
							key={item.url}
							className={cn(
								isActive
									? "bg-black text-white rounded-md"
									: "text-dark-gray-200",
								"flex items-center gap-x-3 w-full py-2"
							)}
							href={item.url}
						>
							{item.logo}{" "}
							<p className="font-semibold text-sm leading-6">
								{item.text}
							</p>
						</Link>
					);
				})}
			</div>
		</div>
	);
};

export default Navigator;
