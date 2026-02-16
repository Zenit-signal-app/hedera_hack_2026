import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
	output: "standalone",
	experimental: {
		serverComponentsExternalPackages: ["node-fetch"],
	},
	images: {
		domains: ["asset-logos.minswap.org", "minswap.org", "api.seerbot.io"],
		qualities: [25, 50, 75, 100],
	},
	webpack: (config, { isServer }) => {
		config.module.rules.push({
			test: /charting_library\/bundles\/.*\.(svg|png|jpg|jpeg|gif)$/,
			type: "asset/resource",
			generator: {
				filename: "static/charting_library/bundles/[name][ext]",
			},
		});

		// Alias node-fetch to native fetch for Node 20+
		if (isServer) {
			config.resolve.alias = {
				...config.resolve.alias,
				"node-fetch": false,
			};
		}

		return config;
	},
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
