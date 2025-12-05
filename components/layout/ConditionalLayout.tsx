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
		<div className="lg:flex bg-gray-950 font-museomoderno">
			<div className="lg:w-[18%] hidden border-r-2 border-black lg:flex flex-col">
				<Navigator />
			</div>
			<div className="lg:w-[82%] w-full flex flex-col overflow-hidden">
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
 