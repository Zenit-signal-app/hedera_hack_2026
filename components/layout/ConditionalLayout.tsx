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

	if (pathname === "/") {
		return <>{children}</>;
	}

	return (
		<div className="lg:grid grid-cols-5 bg-gray-950 font-museomoderno">
			<div className="lg:col-span-1 hidden border-r-2 border-dark-gray-900 lg:flex flex-col lg:h-full">
				<Navigator />
			</div>
			<div className="lg:col-span-4 w-full flex flex-col overflow-hidden">
				<Header />
				<div className="relative background-container flex-1 h-content overflow-y-auto ">
					<div className="overflow-x-hidden h-content content">
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}
 