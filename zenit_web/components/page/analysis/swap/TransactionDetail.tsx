import { TooltipWrapper } from "@/components/common/tooltip";
import QuestionInfoIcon from "@/components/icon/Icon_QuestionInfo";
import { formatNumber } from "@/lib/format";
import { useTokenStore } from "@/store/tokenStore";
import type { SwapToken, SwapQuoteResult } from "@/services/chainSwapService";

interface DetailItem {
	label: string;
	value: (
		data: SwapQuoteResult,
		tokens: { in: SwapToken; out: SwapToken }
	) => React.ReactNode;
	tooltipContent: string;
}

interface TransactionDetailsProps {
	tokenIn: SwapToken;
	tokenOut: SwapToken;
}

const getTransactionDetailsConfig = (): DetailItem[] => [
	{
		label: "Pricing",
		tooltipContent: "Current exchange rate between the two tokens.",
		value: (data, tokens) => {
			if (!data) return <span className="animate-pulse">Loading...</span>;
			// Convert from smallest units to human amounts, then compute rate
			const amountInHuman = Number(data.amountIn) / Math.pow(10, tokens.in.decimals);
			const amountOutHuman = Number(data.amountOut) / Math.pow(10, tokens.out.decimals);
			const rate = amountInHuman > 0 ? amountOutHuman / amountInHuman : 0;
			return (
				<span>
					1 {tokens.in.symbol} ≈ {formatNumber(rate, 6)}{" "}
					{tokens.out.symbol}
				</span>
			);
		},
	},
	{
		label: "Min. Received",
		tooltipContent:
			"Minimum amount you will receive after slippage tolerance is applied.",
		value: (data, tokens) => {
			if (!data) return "-";
			const minOut =
				Number(data.minAmountOut) / Math.pow(10, tokens.out.decimals);
			return (
				<span>
					{formatNumber(minOut, 6)} {tokens.out.symbol}
				</span>
			);
		},
	},
	{
		label: "Slippage",
		tooltipContent: "Maximum price slippage tolerated for this trade.",
		value: () => (
			<span>
				Auto • <span className="text-white">0.5%</span>
			</span>
		),
	},
	{
		label: "Price Impact",
		tooltipContent: "Degree of impact this trade has on market price.",
		value: (data) => {
			if (!data) return "-";
			const impact = data.priceImpact;
			const colorClass =
				impact > 5
					? "text-red-500"
					: impact > 1
					? "text-yellow-500"
					: "text-green-500";
			return (
				<span className={colorClass}>{formatNumber(impact, 3)}%</span>
			);
		},
	},
	{
		label: "Network fee",
		tooltipContent:
			"Network (gas) fee required to process the transaction on-chain.",
		value: (data) => {
			if (!data?.fee) return "-";
			return (
				<span>
					{data.fee}
					{data.feeUsd ? (
						<span className="text-dark-gray-100 ml-1">
							({data.feeUsd})
						</span>
					) : null}
				</span>
			);
		},
	},
	{
		label: "Route",
		tooltipContent: "The DEX route used for this swap.",
		value: (data) => data.route || "-",
	},
];

export const TransactionDetails: React.FC<TransactionDetailsProps> = ({
	tokenIn,
	tokenOut,
}) => {
	const estimateDetail = useTokenStore((state) => state.estimateDetail);
	const configData = getTransactionDetailsConfig();

	return !!estimateDetail ? (
		<div className="w-full rounded-xl bg-white/10 text-sm font-sans mt-4">
			<div className="flex flex-col [&>div:not(:last-child)]:border-b [&>div:not(:last-child)]:border-white/10">
				{configData.map((item) => (
					<div
						key={item.label}
						className="flex justify-between items-center p-3"
					>
						<div className="flex items-center space-x-2 text-dark-gray-100 font-medium">
							<span className="text-[14px] opacity-80">
								{item.label}
							</span>
							<TooltipWrapper
								trigger={<QuestionInfoIcon />}
								content={item.tooltipContent}
							/>
						</div>

						<div className="text-white text-[14px] font-semibold">
							{item.value(estimateDetail as SwapQuoteResult, {
								in: tokenIn,
								out: tokenOut,
							})}
						</div>
					</div>
				))}
			</div>
		</div>
	) : null;
};
