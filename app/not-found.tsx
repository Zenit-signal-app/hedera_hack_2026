import { exo, museoModerno, quickSan } from "@/lib/fonts";
import Header from "@/page/layout/header";
import Navigator from "@/page/layout/navigator";
import { NextIntlClientProvider } from "next-intl";
import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
	return (
		<div className="flex flex-col items-center justify-center h-screen text-white/80">
			<div className="image-overlay absolute inset-0 rounded-lg"></div>
			<Image
				src="/images/404.png"
				width={457}
				height={159}
				alt="Not Found"
				className="filter-shadow"
			/>
			<p className="font-museomoderno text-4xl font-semibold mt-[72px]">
				Page was not found
			</p>
			<Link
				href="/asset-vault"
				className="btn-gradient px-6 py-3 rounded-full mt-3 text-lg font-bold font-museomoderno"
			>
				Back to home
			</Link>
		</div>
	);
}
