export const dashboardData = {
	// ==================================================
	// COMBO CHART – TVL (line) + NETFLOW (bar)
	// TVL: 58-74K, Netflow: 0-4K
	// ==================================================
	comboChart: {
		unit: "USD",
		points: [
			// September - Large variations
			{ date: "1", tvl: 72.5, netflow: 0 },
			{ date: "2", tvl: 71.8, netflow: 0 },
			{ date: "3", tvl: 70.2, netflow: 0 },
			{ date: "4", tvl: 68.5, netflow: 0 },
			{ date: "5", tvl: 67.2, netflow: 0 },
			{ date: "6", tvl: 66.8, netflow: 0 },
			{ date: "7", tvl: 65.5, netflow: 0 },
			{ date: "8", tvl: 64.2, netflow: 3.5 },
			{ date: "9", tvl: 63.5, netflow: 0 },
			{ date: "10", tvl: 62.8, netflow: 0 },
			{ date: "11", tvl: 62.0, netflow: 0 },
			{ date: "12", tvl: 61.5, netflow: 0 },
			{ date: "13", tvl: 60.8, netflow: 0 },
			{ date: "14", tvl: 60.2, netflow: 0 },
			{ date: "15", tvl: 59.5, netflow: 1.8 },
			{ date: "16", tvl: 59.0, netflow: 0 },
			{ date: "17", tvl: 58.5, netflow: 0 },
			{ date: "18", tvl: 58.2, netflow: 0 },
			{ date: "19", tvl: 58.8, netflow: 0 },
			{ date: "20", tvl: 59.5, netflow: 0 },
			{ date: "21", tvl: 60.2, netflow: 0 },
			{ date: "22", tvl: 61.5, netflow: 0 },
			{ date: "23", tvl: 63.8, netflow: 0 },
			{ date: "24", tvl: 65.5, netflow: 0 },
			{ date: "25", tvl: 67.2, netflow: 0 },
			{ date: "26", tvl: 68.8, netflow: 0 },
			{ date: "27", tvl: 70.5, netflow: 0 },
			{ date: "28", tvl: 71.8, netflow: 0 },
			{ date: "29", tvl: 72.5, netflow: 0 },
			{ date: "30", tvl: 73.8, netflow: 0 },
		],
	},

	// =========================================
	// 3. FEES TABLE – SAME AS UI
	// =========================================
	feesTable: [
		{ label: "Management fee", value: "0.00%" },
		{ label: "Total performance fee", value: "20.00%" },
		{ label: "Strategy participant share", value: "80.00%" },
		{ label: "Lagoon Protocol fee", value: "0.00%" },
	],
};
