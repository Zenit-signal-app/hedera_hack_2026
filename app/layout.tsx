import type { Metadata } from "next";
import "./globals.css";

import { exo, museoModerno, quickSand } from "../lib/fonts";
import { NextIntlClientProvider } from "next-intl";
import ConditionalLayout from "@/components/layout/ConditionalLayout";

export const metadata: Metadata = {
	title: "SeerBOT | Market Insights & On-chain Analysis",
	description: "The ultimate trading platform, an assistant providing real-time signals and data visualization for users.",
	openGraph: {
    title: 'SeerBOT | Market Insights & On-chain Analysis',
    description: 'The ultimate trading platform, an assistant providing real-time signals and data visualization for users.',
    url: 'https://seerbot.io/', 
    siteName: 'SeerBOT',
    images: [
      {
        url: '/images/seerbot.jpeg',
        width: 1200,
        height: 630,
        alt: 'SeerBOT Market Analysis Platform',
      },
    ],
    locale: 'vi_VN',
    type: 'website',
  },
  
  twitter: {
    card: 'summary_large_image', // Loại card: Hiển thị ảnh lớn
    title: 'SeerBOT | Market Insights & On-chain Analysis',
    description: 'The ultimate trading platform, an assistant providing real-time signals and data visualization for users.',
    images: ['/images/seerbot.jpeg'], 
  },
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body
				className={`${exo.variable} ${museoModerno.variable} ${quickSand.variable} antialiased bg-black text-white`}
			>
				<ConditionalLayout>
					<NextIntlClientProvider>{children}</NextIntlClientProvider>
				</ConditionalLayout>
			</body>
		</html>
	);
}

