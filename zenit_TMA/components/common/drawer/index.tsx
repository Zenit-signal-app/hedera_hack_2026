import {
	Sheet,
	SheetTrigger,
	SheetContent,
	SheetTitle,
	SheetDescription,
} from "@/components/ui/sheet";

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
			<SheetContent side={side}>
				<SheetTitle className="sr-only">Popup Content</SheetTitle>
				<SheetDescription className="sr-only">
					Chi tiết nội dung
				</SheetDescription>
				{children}
			</SheetContent>
		</Sheet>
	);
};

export default Drawer;
