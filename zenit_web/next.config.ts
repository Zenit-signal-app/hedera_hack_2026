import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
	output: "standalone",
	images: {
		domains: [
			"asset-logos.minswap.org",
			"minswap.org",
			"api.seerbot.io",
			"cryptologos.cc",
			"localhost",
			"zenit-api.seerbot.io",
		],
		qualities: [25, 50, 75, 100],
	},
	webpack: (config) => {
		config.module.rules.push({
			test: /charting_library\/bundles\/.*\.(svg|png|jpg|jpeg|gif)$/,
			type: "asset/resource",
			generator: {
				filename: "static/charting_library/bundles/[name][ext]",
			},
		});

		return config;
	},
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
