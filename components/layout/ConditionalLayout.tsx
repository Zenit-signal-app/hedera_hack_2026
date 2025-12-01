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
  
	if (
		pathname === "/"
	) {
		return <>{children}</>;
	}

	return (
		<div className="flex bg-gray-950 font-museomoderno">
			<div className="lg:w-[18%] hidden border-r-2 border-black lg:flex flex-col">
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
