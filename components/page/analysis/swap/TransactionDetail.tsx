import { TooltipWrapper } from "@/components/common/tooltip";
import QuestionInfoIcon from "@/components/icon/Icon_QuestionInfo";
import { formatNumber } from "@/lib/format";
import { useTokenStore } from "@/store/tokenStore";
import { MinswapEstimate } from "@/types/minswap";

interface DetailItem {
	label: string;
	value: (
		data: MinswapEstimate | null,
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
		tooltipContent: "Tỷ giá hối đoái hiện tại giữa hai token.",
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
		tooltipContent: "Độ trượt giá tối đa được chấp nhận cho giao dịch này.",
		value: () => (
			<span>
				Auto • <span className="text-white">1.1%</span>
			</span>
		),
	},
	{
		label: "Price Impact",
		tooltipContent: "Mức độ ảnh hưởng của giao dịch đến giá thị trường.",
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
			"Phí mạng lưới (gas fee) để thực hiện giao dịch trên blockchain.",
		value: () => "0.17 ADA", // Phí mạng Cardano tiêu chuẩn (thường ko có trong API estimate swap)
	},
	{
		label: "Refundable deposit",
		tooltipContent: "Khoản tiền gửi có thể hoàn lại (ADA đi kèm UTXO).",
		value: (data) => {
			if (!data) return "-";
			// API trả về deposits là string "2" (theo mẫu json bạn đưa)
			return `${formatNumber(data.deposits)} ADA`;
		},
	},
	{
		label: "Trading Fee",
		tooltipContent: "Phí sàn giao dịch (DEX) + LP Fee.",
		value: (data) => {
			if (!data) return "-";
			const totalFee =
				Number(data.total_dex_fee) + Number(data.total_lp_fee);
			return `${formatNumber(totalFee)} ADA`;
		},
	},
];

export const TransactionDetails: React.FC<TransactionDetailsProps> = ({ tokenIn, tokenOut }) => {
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
              <TooltipWrapper trigger={<QuestionInfoIcon/>} content={item.tooltipContent}/>
						</div>

						<div className="text-white text-[14px] font-semibold">
							{item.value(estimateDetail as MinswapEstimate, {in: tokenIn, out: tokenOut})}
						</div>
					</div>
				))}
			</div>
		</div>
	) : null;
};
