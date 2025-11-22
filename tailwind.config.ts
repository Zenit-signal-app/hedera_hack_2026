import type { Config } from "tailwindcss";

export default {
	content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
	theme: {
		extend: {
			fontFamily: {
				exo: "var(--font-exo)",
				museomoderno: "var(--font-museomoderno)",
				quickSan: "var(--font-quicksand)",
			},
			fontSize: {
				// Heading
				"heading-1": ["48px", { lineHeight: "52px", letterSpacing: "0.1px" }],
				"heading-2": ["40px", { lineHeight: "44px", letterSpacing: "0.1px" }],
				"heading-3": ["36px", { lineHeight: "40px", letterSpacing: "0.1px" }],
				"heading-4": ["32px", { lineHeight: "36px", letterSpacing: "0.1px" }],

				// Title
				"title-1": ["28px", { lineHeight: "44px", letterSpacing: "0.1px" }],
				"title-2": ["24px", { lineHeight: "36px", letterSpacing: "0.1px" }],

				// Sub-Title
				"subtitle-1": ["22px", { lineHeight: "32px", letterSpacing: "0.1px" }],
				"subtitle-2": ["20px", { lineHeight: "28px", letterSpacing: "0.1px" }],

				// Label
				"label-1": ["18px", { lineHeight: "28px", letterSpacing: "0.1px" }],
				"label-2": ["16px", { lineHeight: "26px", letterSpacing: "0.1px" }],
				"label-3": ["14px", { lineHeight: "24px", letterSpacing: "0.1px" }],
				"label-4": ["12px", { lineHeight: "20px", letterSpacing: "0.1px" }],
				"label-5": ["10px", { lineHeight: "16px", letterSpacing: "0.1px" }],

				// Body
				"body-1": ["18px", { lineHeight: "28px", letterSpacing: "0.1px" }],
				"body-2": ["16px", { lineHeight: "26px", letterSpacing: "0.1px" }],
				"body-3": ["14px", { lineHeight: "24px", letterSpacing: "0.1px" }],
			},

			fontWeight: {
				regular: "400",
				medium: "500",
				semibold: "600",
				bold: "700",
			},
		},
	},
	plugins: [],
} satisfies Config;
