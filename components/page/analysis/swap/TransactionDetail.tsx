import { TooltipWrapper } from "@/components/common/tooltip";
import QuestionInfoIcon from "@/components/icon/Icon_QuestionInfo";
import { formatNumber } from "@/lib/format";
import { useTokenStore } from "@/store/tokenStore";
import { MinswapEstimate } from "@/types/minswap";

interface DetailItem {
	label: string;
	value: (
		data: MinswapEstimate,
		tokens: { in: string; out: string }
	) => React.ReactNode;
	tooltipContent: string;
}

interface TransactionDetailsProps {
	tokenIn: string;
	tokenOut: string;
}

const getTransactionDetailsConfig = (): DetailItem[] => [
	{
		label: "Pricing",
		tooltipContent: "Current exchange rate between the two tokens.",
		value: (data, tokens) => {
			if (!data) return <span className="animate-pulse">Loading...</span>;
			const rate = Number(data.amount_out) / Number(data.amount_in);
			return (
				<span>
					1 {tokens.in} ≈ {formatNumber(rate, 6)} {tokens.out}
				</span>
			);
		},
	},
	{
		label: "Slippage",
		tooltipContent: "Maximum price slippage tolerated for this trade.",
		value: () => (
			<span>
				Auto • <span className="text-white">1.1%</span>
			</span>
		),
	},
	{
		label: "Price Impact",
		tooltipContent: "Degree of impact this trade has on market price.",
		value: (data) => {
			if (!data) return "-";
			const impact = data.avg_price_impact;
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
		value: (data: MinswapEstimate) =>
			data.total_dex_fee
				? `${formatNumber(data.total_dex_fee)} ADA`
				: "-",
	},
	{
		label: "Refundable deposit",
		tooltipContent: "Refundable deposit (ADA attached to the UTXO).",
		value: (data) => {
			if (!data) return "-";
			return `${formatNumber(data.deposits)} ADA`;
		},
	},
	{
		label: "Trading Fee",
		tooltipContent: "Exchange fee (DEX) plus LP fee.",
		value: (data) => {
			if (!data) return "-";
			const totalFee =
				Number(data.total_dex_fee) + Number(data.total_lp_fee);
			return `${formatNumber(totalFee)} ADA`;
		},
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
							{item.value(estimateDetail as MinswapEstimate, {
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
