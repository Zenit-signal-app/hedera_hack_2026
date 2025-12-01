"use client";

import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import WalletConnectButton from "@/components/wallet/WalletConnectButton";
import { listNavigators } from "@/lib/constant";
import { useIsMobile } from "@/src/components/hooks/useIsMobile";
import { AIAssistantGradient } from "@/src/components/icon/AIAssistantIcon";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const Header = () => {
	const pathName = usePathname();
	const title = useMemo(() => {
		const t = listNavigators.find((item) => pathName.includes(item.url));
		return t?.text || "Analysis";
	}, [pathName]);
	const isMobile = useIsMobile();
	return (
		<div className="px-6 pt-3 pb-[18px] flex items-center justify-between bg-dark-gray-950 sticky z-9999 top-0">
			<div>
				<p className="text-white title-2 font-museomoderno text-4xl font-bold">
					{title}
				</p>
			</div>

			<div className="flex items-center gap-x-2">
				<div className="gradient-border-wrapper">
					<div className=" flex items-center px-2 py-1.5 border border-dark-gray-900 rounded-full">
						<p className="lg:text-white lg:block hidden">Ask AI</p>
						<AIAssistantGradient />
					</div>
				</div>
				<div className="flex items-center px-3 py-2 rounded-full  border border-dark-gray-700 bg-dark-gray-900">
					<Image
						src="/images/ada.png"
						width={24}
						height={24}
						alt="Logo"
						className="lg:w-6 lg:h-6 w-5 h-5"
					/>
					<ChevronDownMini
						size={isMobile ? 20 : 24}
						className="text-white fill-white"
						color={"white"}
					/>
				</div>
				<WalletConnectButton />
			</div>
		</div>
	);
};

export default Header;
