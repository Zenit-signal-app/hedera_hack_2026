import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";

type TProps = {
	trigger?: React.ReactNode | string;
	children: React.ReactNode;
	open: boolean;
	onOpenChange?: (o: boolean) => void;
	side: "right" | "left" | "top" | "bottom";
};

const Drawer = ({
	trigger,
	children,
	open,
	onOpenChange,
	side = "right",
}: TProps) => {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetTrigger asChild>{trigger}</SheetTrigger>
			<SheetContent side={side}>{children}</SheetContent>
		</Sheet>
	);
};

export default Drawer;
