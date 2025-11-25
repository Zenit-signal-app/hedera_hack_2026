import { headers } from "next/headers";
import Navigator from "@/page/layout/navigator";
import Header from "@/page/layout/header";
import { ReactNode } from "react";

interface ConditionalLayoutProps {
	children: ReactNode;
}

export default async function ConditionalLayout({
	children,
}: ConditionalLayoutProps) {
	const headersList = await headers();
	const pathname = headersList.get("x-pathname") || "";

	if (pathname === "/landing-page" || pathname.startsWith("/landing-page")) {
		return <>{children}</>;
	}

	return (
		<div className="flex bg-gray-950 font-museomoderno">
			<div className="w-[18%] border-r-2 border-black flex flex-col">
				<Navigator />
			</div>
			<div className="w-[82%] h-screen relative background-container">
				<Header />
				<div className="overflow-y-auto overflow-x-hidden h-[calc(100%-72px)] content">
					{children}
				</div>
			</div>
		</div>
	);
}
