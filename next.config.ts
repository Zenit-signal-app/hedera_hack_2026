import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
const nextConfig: NextConfig = {
	experimental: {
		globalNotFound: false,
	},
	images: {
		domains: ["asset-logos.minswap.org", "minswap.org", "api.seerbot.io"],
	},
};
const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
