"use client";

import ChevronDownMini from "@/components/icon/Icon_ChevronDownMini";
import WalletConnectButton from "@/components/wallet/WalletConnectButton";
import { listNavigators } from "@/lib/constant";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const Header = () => {
	const pathName = usePathname();
	const title = useMemo(() => {
		const t = listNavigators.find((item) => pathName.includes(item.url));
		return t?.text || "Analysis";
	}, [pathName]);
	return (
		<div className="px-6 pt-3 pb-[18px] flex items-center justify-between bg-dark-gray-950 sticky z-9999 top-0">
			<div>
				<p className="text-white title-2 font-museomoderno text-4xl font-bold">
					{title}
				</p>
			</div>
			<div className="flex items-center gap-x-2">
				<div className="flex items-center px-3 py-2 rounded-full border border-dark-gray-700 bg-dark-gray-900">
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
