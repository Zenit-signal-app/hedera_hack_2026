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
		text: "AI Asistant",
		url: "/ai-asistant",
	},
	{
		logo: <PortfolioIcon size={32} />,
		text: "PortFolio",
		url: "/portfolio",
	},
];

interface NavigatorProps {
	isOpen?: boolean;
	onClose?: () => void;
}

const Navigator = ({ isOpen = false, onClose }: NavigatorProps) => {
	const pathname = usePathname();
	
	return (
		<>
			{/* Desktop Navigator - Hidden on mobile */}
			<div className="hidden md:flex h-screen flex-col gap-y-4 items-start py-4 px-3 bg-dark-gray-950">
				<Link href="/">
					<Image
						className=""
						width={174}
						height={44}
						alt="Logo"
						src="/images/logo.png"
					/>
				</Link>

				<Input
					startIcon={<SearchIcon size={20} />}
					className="w-full h-10"
				/>

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

			{/* Mobile Navigator - Dropdown Menu */}
			{isOpen && (
				<div 
					className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-[9998]"
					onClick={onClose}
				>
					<div 
						className="absolute top-[60px] left-0 right-0 bg-dark-gray-950 border-t border-dark-gray-700 shadow-lg"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex flex-col gap-y-3 p-4">
							{listNavigators.map((item) => {
								const isActive = pathname.includes(item.url);
								return (
									<Link
										key={item.url}
										className={cn(
											isActive
												? "bg-black text-white rounded-md"
												: "text-dark-gray-200",
											"flex items-center gap-x-3 w-full py-3 px-2 hover:bg-dark-gray-800 transition-colors"
										)}
										href={item.url}
										onClick={onClose}
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
				</div>
			)}
		</>
	);
};

export default Navigator;
