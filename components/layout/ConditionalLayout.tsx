"use client";

import Navigator from "@/page/layout/navigator";
import Header from "@/page/layout/header";
import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";

interface ConditionalLayoutProps {
	children: ReactNode;
}

export default function ConditionalLayout({
	children,
}: ConditionalLayoutProps) {
	const pathname = usePathname();
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	if (
		pathname === "/landing-page" ||
		pathname.startsWith("/landing-page") ||
		pathname === "/"
	) {
		return <>{children}</>;
	}

	return (
		<div className="flex bg-gray-950 font-museomoderno">
			{/* Desktop Navigator - Hidden on mobile
			<div className="hidden md:block md:w-[18%] border-r-2 border-black">
				<Navigator />
			</div> */}

			{/* Mobile Navigator - Overlay */}
			<Navigator isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

			{/* Main Content */}
			<div className="w-full md:w-[82%] h-screen relative background-container">
				<Header onMenuToggle={() => setIsMenuOpen(!isMenuOpen)} />
				<div className="overflow-y-auto overflow-x-hidden h-[calc(100%-60px)] md:h-[calc(100%-72px)] content">
					{children}
				</div>
			</div>
		</div>
	);
}
