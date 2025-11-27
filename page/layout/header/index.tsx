"use client";

import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import WalletConnectButton from "@/components/wallet/WalletConnectButton";
import { listNavigators } from "@/lib/constant";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import HamburgerIcon from "../../../src/components/icon/HamburgerIcon";

interface HeaderProps {
	onMenuToggle?: () => void;
}

const Header = ({ onMenuToggle }: HeaderProps) => {
	const pathName = usePathname();
	const title = useMemo(() => {
		const t = listNavigators.find((item) => pathName.includes(item.url));
		return t?.text || "Analysis";
	}, [pathName]);
	
	return (
		<div className="px-3 md:px-6 pt-3 pb-[18px] flex items-center justify-between bg-dark-gray-950 sticky z-9999 top-0">
			{/* Mobile Menu Button - Only visible on mobile */}
			<button
				className="md:hidden p-2 text-white hover:bg-dark-gray-800 rounded-md transition-colors"
				onClick={onMenuToggle}
			>
				<HamburgerIcon />
			</button>

			{/* Title */}
			<div className="flex-1 md:flex-none">
				<p className="text-white title-2 font-museomoderno text-2xl md:text-4xl font-bold">
					{title}
				</p>
			</div>

			{/* Actions */}
			<div className="flex items-center gap-x-2">
				<div className="hidden sm:flex items-center px-3 py-2 rounded-full border border-dark-gray-700 bg-dark-gray-900">
					<Image src="/images/ada.png" width={24} height={24} alt="Logo" />
					<ChevronDownMini
						size={24}
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
