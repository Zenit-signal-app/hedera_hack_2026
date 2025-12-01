import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

type TProps = {
	trigger: React.ReactNode | string;
	children: React.ReactNode;
	open: boolean;
	onOpenChange: (o: boolean) => void;
	className?:string
};

const PopoverWrapper = ({ trigger, children, open, onOpenChange,className="" }: TProps) => {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent className={className}>{children}</PopoverContent>
		</Popover>
	);
};

export default PopoverWrapper;
