import { TooltipWrapper } from "@/components/common/tooltip";
import QuestionInfoIcon from "@/components/icon/Icon_QuestionInfo";

interface DetailItem {
	label: string;
	value: string | React.ReactNode;
	tooltipContent: string;
}

const transactionDetailsData: DetailItem[] = [
	{
		label: "Pricing",
		value: "1 USDT ≈ 420.31001991",
		tooltipContent: "Tỷ giá hối đoái hiện tại giữa hai token.",
	},
	{
		label: "Slippage",
		value: "Auto • 1.1%",
		tooltipContent: "Độ trượt giá tối đa được chấp nhận cho giao dịch này.",
	},
	{
		label: "Price Impact",
		value: "0.324%",
		tooltipContent: "Mức độ ảnh hưởng của giao dịch đến giá thị trường.",
	},
	{
		label: "Network fee",
		value: "2 ADA",
		tooltipContent:
			"Phí mạng lưới (gas fee) để thực hiện giao dịch trên blockchain.",
	},
	{
		label: "Refundable deposit",
		value: "0.89 ADA",
		tooltipContent:
			"Khoản tiền gửi có thể hoàn lại, thường được yêu cầu bởi các hợp đồng thông minh.",
	},
	{
		label: "Trading Fee",
		value: "2 ADA",
		tooltipContent: "Phí sàn giao dịch (DEX) cho việc sử dụng dịch vụ.",
	},
];

export const TransactionDetails: React.FC = () => {
	return (
		<div className="w-full rounded-xl bg-white/10 text-sm font-sans">
			<div className="space-y-3 [&>:not(:last-child)]:border-b">
				{transactionDetailsData.map((item) => (
					<div
						key={item.label}
						className="flex justify-between items-center p-3  border-white/10"
					>
						<div className="flex items-center space-x-2 text-dark-gray-100 font-semibold">
							<span className=" text-[14px]">{item.label}</span>
							<TooltipWrapper
								trigger={<QuestionInfoIcon />}
								content={item.tooltipContent}
							/>
						</div>

						<span className="text-white text-[14px] font-semibold">
							{item.value}
						</span>
					</div>
				))}
			</div>
		</div>
	);
};
