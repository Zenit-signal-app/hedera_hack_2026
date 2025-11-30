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
};

const PopoverWrapper = ({ trigger, children, open, onOpenChange }: TProps) => {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger>{trigger}</PopoverTrigger>
			<PopoverContent>{children}</PopoverContent>
		</Popover>
	);
};

export default PopoverWrapper;
