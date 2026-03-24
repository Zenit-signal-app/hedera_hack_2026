import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
export function TooltipWrapper({
	trigger,
	content,
}: {
	trigger: React.ReactNode;
	content: React.ReactNode | string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button>{trigger}</button>
			</TooltipTrigger>
			<TooltipContent>{content}</TooltipContent>
		</Tooltip>
	);
}
