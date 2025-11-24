import Image from "next/image";
import Link from "next/link";

export const metadata = {
	title: "Truy Cập Bị Chặn",
};

export default function IpBlockedPage() {
	return (
		<div className="flex flex-col items-center justify-center h-screen">
			<Image
				src="/images/locked_ip.png"
				width={280}
				height={280}
				alt="IP Locked"
			/>
			<h1 className="mt-10 text-4xl font-semibold text-white">
				Access restricted in your region
			</h1>

			<p className="mt-4 text-white">
				Our platform is currently unavailable in your country
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
