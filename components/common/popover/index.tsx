import * as React from "react";
import { cn } from "@/lib/utils"; // Hàm merge class của shadcn

// Import Sheet
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/src/components/hooks/useIsMobile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface PopoverWrapperProps {
	trigger: React.ReactNode;
	children: React.ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	className?: string;
	align?: "center" | "start" | "end";
}

export function PopoverWrapper({
	trigger,
	children,
	open,
	onOpenChange,
	className,
	align = "center",
}: PopoverWrapperProps) {
	const isMobile = useIsMobile();

	if (isMobile) {
		return (
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetTrigger asChild>{trigger}</SheetTrigger>
				<SheetContent
					side="bottom"
					className={cn("rounded-t-lg", className)}
				>
					<div className="mt-4">{children}</div>
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent className={className} align={align}>
				{children}
			</PopoverContent>
		</Popover>
	);
}
