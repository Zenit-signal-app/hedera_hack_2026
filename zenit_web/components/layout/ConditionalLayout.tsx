import { headers } from "next/headers";
import Navigator from "@/page/layout/navigator";
import Header from "@/page/layout/header";
import { ReactNode } from "react";
import { Toaster } from "../ui/toast";

interface ConditionalLayoutProps {
	children: ReactNode;
}

export default async function ConditionalLayout({
	children,
}: ConditionalLayoutProps) {
	const headersList = await headers();
	const pathname = headersList.get("x-pathname") || "";

	const landingPages = ["/", "/terms", "/privacy"];
	if (landingPages.includes(pathname)) {
		return <>{children}</>;
	}

	const isAIAssistant = pathname === "/ai-assistant";

	return (
		<div className="lg:grid grid-cols-5  font-museomoderno h-screen">
			<div className="lg:col-span-1 hidden bg-gray-950 lg:z-9999 border-r-2 border-dark-gray-900 lg:flex flex-col lg:h-full">
				<Navigator />
			</div>
			<div className="lg:col-span-4 w-full flex flex-col h-screen">
				<div className="lg:sticky top-0 z-50 w-full bg-gray-950 border-b border-dark-gray-900">
					<Header />
				</div>
				<div className={`flex-1 ${!isAIAssistant ? "overflow-y-auto" : "overflow-hidden"} background-container`}>
					<div className="relative overflow-x-hidden content">
						{children}
					</div>
				</div>
			</div>
			<Toaster />
		</div>
	);
}
