import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	async redirects() {
		return [
			{
				// Source: Đường dẫn đến
				source: "/",

				// Destination: Đường dẫn sẽ được chuyển đến
				destination: "/asset-vault",

				// permanent: true => Trả về mã trạng thái 308 (Permanent Redirect)
				// Đây là cách tốt cho SEO và trình duyệt sẽ lưu cache
				permanent: true,
			},
			// Bạn có thể thêm nhiều redirects khác ở đây
		];
	},
};

export default nextConfig;
