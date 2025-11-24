export const strategyDescriptionContent = {
	mainDescription: `This strategy is a momentum and breakout strategy. It is ETH and BTC momentum strategy to maximize gains in bull market and avoid losses in bear market, on Arbitrum

The strategy trades ETH and BTC over long term time horizon, doing only few trades per a year.

The strategy delivers similar profits as buying and holding ETH and BTC, but with much less severe drawdowns.

The strategy performs well in long-term Bitcoin bull market.

In bear and sideways markets the strategy does not perform well.

It is based on RSI technical indicator, the strategy is buying when others are buying, and the strategy is selling when others are selling.

The strategy deposits excess cash to Aave V3 USDT pool to gain interest on cash.

Past performance is not indicative of future results.`,

	assetsAndTradingVenues: {
		title: "Assets and trading venues",
		content: `The strategy trades only spot market

We trade two trading asset: ETH and BTC

The strategy keeps reserves in USDT stablecoin

The trading happens on Uniswap V3 on Arbitrum blockchain

The strategy decision cycle is daily rebalances`,
	},

	backtesting: {
		title: "Backtesting",
		content: `The backtesting was performed with Binance ETH-USDT and BTC-USDT data of 2019-2024.

See backtesting results

Read more about what is backtesting.

Aave USDT interest is not included in the backtest results.

The backtesting trading venue (Binance) is different from the live trading venue (Uniswap), because DEX markets do not have long enough history to result to a meaningful backtest.

The backtesting period saw one bull market rally that is unlikely to repeat in the same magnitude for the assets we trade.

Past peformance is no guarantee of future results. Like with manual trading, automated trading is unlikely to be perfect. There will be variance in the range of 30% - 50% in the results.`,
	},

	profit: {
		title: "Profit",
		content: `The backtested results indicate 80% estimated yearly profit (CAGR).

This is similar profit as you would get by buying and holding BTC or ETH.`,
	},

	risk: {
		title: "Risk",
		content: `This strategy has -30% backtested maximum drawdown. This is much less severe compared to buy and hold, making the strategy less risky than buy and hold.

For further understanding the key aspescts of risks

The strategy does not use any leverage

The strategy trades only established, highly liquid, trading pairs which are unlikely to go zero`,
	},

	benchmark: {
		title: "Benchmark",
		content: `For the same backtesting period, here are some benchmark of performance of different assets and indices:`,
		table: {
			headers: ["", "CAGR", "Maximum drawdown", "Sharpe"],
			rows: [
				["This strategy", "84%", "-34%", "1.78"],
				["SP500 (20 years)", "11%", "-33%", "0.72"],
				["Bitcoin (backtesting period)", "76%", "-76%", "1.17"],
				["Ether (backtesting period)", "85%", "-79%", "1.18"],
			],
		},
		sources: [
			"Our strategy",
			"Buy and hold BTC",
			"Buy and hold ETH",
			"SP500 stock index",
		],
	},

	tradingFrequency: {
		title: "Trading frequency",
		content: `The strategy is very slow moving macro-like strategy.

This strategy is estimated to to rebalance every 20 days and enter/exit positions even less frequently.`,
	},

	robustness: {
		title: "Robustness",
		content: `This strategy does not have good robustness tests available.`,
	},

	updates: {
		title: "Updates",
		content: `This is one of the early, simple, strategies deployed on Trading Strategy protocol.

It is likely this strategy will be replaced with a newer, more robust, more optimised, version in some point of the future. Follow Trading Strategy for updates as you need to move your balance to a new strategy.`,
	},

	furtherInformation: {
		title: "Further information",
		content: `Any questions are welcome in the Discord community chat

See the blog post on how this strategy is constructed`,
	},
};

