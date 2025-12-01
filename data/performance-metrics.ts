export interface PerformanceMetric {
	label: string;
	long: string | number | null;
	short: string | number | null;
	trend: string | number | null;
}

export interface PerformanceSummaryData {
	strategy: string;
	tradingPeriodRange: string;
	metrics: PerformanceMetric[];
}

export const performanceSummaryData: PerformanceSummaryData = {
	strategy: "Strategy performance metrics based on live trading data",
	tradingPeriodRange: "290 days 3 hours",
	metrics: [
		{
			label: "Return %",
			long: "15.17%",
			short: "-1.69%",
			trend: "-0.05%",
		},
		{
			label: "Annualized return %",
			long: "-47.2%",
			short: "-100%",
			trend: null,
		},
		{
			label: "Gain vs start",
			long: "$0.00",
			short: null,
			trend: null,
		},
		{
			label: "Value end",
			long: "$11,343.76",
			short: null,
			trend: null,
		},
		{
			label: "Time in market",
			long: "99.6%",
			short: "99.6%",
			trend: "0.00%",
		},
		{
			label: "Trade volume",
			long: "$1,973,313.92",
			short: "$1,974,313.92",
			trend: "$0.00",
		},
		{
			label: "Return %",
			long: "-52.77%",
			short: "-51.93%",
			trend: "-0.02%",
		},
		{
			label: "Annualized return %",
			long: "-97.6%",
			short: "-79.68%",
			trend: null,
		},
		{
			label: "Total positions",
			long: 260,
			short: 260,
			trend: "0",
		},
		{
			label: "Won positions",
			long: 72,
			short: 72,
			trend: "0",
		},
		{
			label: "Lost positions",
			long: 160,
			short: 160,
			trend: null,
		},
		{
			label: "Max trades staggered",
			long: 0,
			short: null,
			trend: null,
		},
		{
			label: "Stop loss % of all",
			long: "0.00%",
			short: "0.00%",
			trend: null,
		},
		{
			label: "Winning (10x, Loss1x)",
			long: 0,
			short: 0,
			trend: null,
		},
		{
			label: "Winning miss boost percent",
			long: null,
			short: null,
			trend: null,
		},
		{
			label: "Losing miss boost",
			long: 0,
			short: 0,
			trend: null,
		},
		{
			label: "Losing miss boost percent",
			long: null,
			short: null,
			trend: null,
		},
		{
			label: "Take profit triggered",
			long: null,
			short: null,
			trend: null,
		},
		{
			label: "Take profit % of prof",
			long: "0.00%",
			short: "0.00%",
			trend: null,
		},
		{
			label: "Take profit % of won",
			long: "0.00%",
			short: "0.00%",
			trend: null,
		},
		{
			label: "Zero profit positions",
			long: 40,
			short: 40,
			trend: null,
		},
		{
			label: "Positions open at the end",
			long: 0,
			short: 0,
			trend: null,
		},
		{
			label: "Realized profit end loss",
			long: "$4,450.94",
			short: "$4,434.32",
			trend: "$0.00",
		},
		{
			label: "Unrealized profit end loss",
			long: "$244.97",
			short: "$244.97",
			trend: "$0.00",
		},
		{
			label: "Portfolio correlated value",
			long: "$93,222.02",
			short: "$93,222.02",
			trend: "$0.00",
		},
		{
			label: "Extra volume on overlap over invested",
			long: "$0.00",
			short: "$0.00",
			trend: "$0.00",
		},
		{
			label: "Cash left at the end",
			long: "$520.00",
			short: null,
			trend: null,
		},
		{
			label: "Average winning position (profit) %",
			long: "19.31%",
			short: "19.31%",
			trend: "0.00%",
		},
		{
			label: "Average losing position (loss) %",
			long: "-13.73%",
			short: "-13.73%",
			trend: "0.00%",
		},
		{
			label: "Biggest winning position %",
			long: "102.61%",
			short: "102.61%",
			trend: null,
		},
		{
			label: "Biggest losing position %",
			long: "-74.54%",
			short: "-74.54%",
			trend: null,
		},
		{
			label: "Average duration of winning positions",
			long: "9 days 21 hours",
			short: "9 days 21 hours",
			trend: "0 hours 0 minutes",
		},
		{
			label: "Average duration of losing positions",
			long: "4 days 17 hours",
			short: "4 days 17 hours",
			trend: "0 hours 0 minutes",
		},
		{
			label: "Lt. loss prof",
			long: "$9,545.10",
			short: "$9,545.10",
			trend: "$0.00",
		},
		{
			label: "Lt. less prof & lot volume",
			long: "0.48%",
			short: "0.48%",
			trend: "0.00%",
		},
		{
			label: "Inventor position",
			long: "2.7%",
			short: "2.7%",
			trend: "0.00%",
		},
		{
			label: "Position duration",
			long: "6.3%",
			short: "6.3%",
			trend: "0.00%",
		},
		{
			label: "Most conservative wins",
			long: null,
			short: null,
			trend: null,
		},
		{
			label: "Most conservative losses",
			long: null,
			short: null,
			trend: null,
		},
		{
			label: "Biggest max-sized risk",
			long: "-3.6%",
			short: "-3.6%",
			trend: "0.00%",
		},
		{
			label: "Risk realized risk",
			long: "-0.48%",
			short: "-0.48%",
			trend: null,
		},
		{
			label: "Time of value on invested capital",
			long: "0.0%",
			short: null,
			trend: null,
		},
		{
			label: "Max loss risk @ opening of position",
			long: "95.00%",
			short: "89.93%",
			trend: "0.00%",
		},
		{
			label: "Max loss @ start of position",
			long: "-89.75%",
			short: null,
			trend: null,
		},
	],
};
