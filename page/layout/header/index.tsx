"use client";

import BurgerMenuIcon from "@/components/icon/Icon_BugerMenu";
import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import WalletConnectButton from "@/components/wallet/WalletConnectButton";
import { listNavigators } from "@/lib/constant";
import { useIsMobile } from "@/src/components/hooks/useIsMobile";
import { AIAssistantGradient } from "@/src/components/icon/AIAssistantIcon";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Navigator from "../navigator";
import Link from "next/link";
import CommonModal from "@/components/common/modal";

const Header = () => {
	const pathName = usePathname();
	const router = useRouter();
	const title = useMemo(() => {
		const t = listNavigators.find((item) => pathName.includes(item.url));
		return t?.text || "Analysis";
	}, [pathName]);
	const isMobile = useIsMobile();
	const [open, setOpen] = useState(false);
	return (
		<div className="px-6 pt-3 pb-[18px] flex items-center justify-between bg-dark-gray-950 sticky z-9999 top-0">
			{isMobile ? (
				<div className="flex items-center gap-x-2.5">
					<CommonModal
						hiddenClose
						isOpen={open}
						onOpenChange={(o) => setOpen(o)}
						trigger={<BurgerMenuIcon />}
						className="mt-10 w-full top-[22%]"
					>
						<Navigator />
					</CommonModal>
					<div className="w-px h-full bg-dark-gray-700"></div>
					<Link href="/">
						<Image
							className=""
							width={87.2}
							height={22}
							alt="Logo"
							src="/images/logo.png"
						/>
					</Link>
				</div>
			) : (
				<div className="lg:block hidden">
					<p className="text-white title-2 font-museomoderno text-4xl font-bold">
						{title}
					</p>
				</div>
			)}

			<div className="flex items-center gap-x-2">
				<div className="gradient-border-wrapper">
					<Link
						href="/ai-assistant"
						className=" flex items-center px-3 py-2 border gap-x-2 border-dark-gray-900 rounded-full"
					>
						<p className="lg:text-white lg:block hidden">Ask AI</p>
						<AIAssistantGradient />
					</Link>
				</div>
				<div className="flex items-center lg:px-3 lg:py-2 px-2 py-1.5 rounded-full  border border-dark-gray-700 bg-dark-gray-900">
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
