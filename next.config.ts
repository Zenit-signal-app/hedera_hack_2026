import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
const nextConfig: NextConfig = {
	experimental: {
		globalNotFound: false,
	},
};
const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
