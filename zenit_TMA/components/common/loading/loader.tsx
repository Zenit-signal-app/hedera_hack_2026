import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils"; // Giả định bạn có hàm cn để kết hợp class

// Định nghĩa các biến thể kích thước
const loaderVariants = cva(
	"animate-spin rounded-full flex items-center justify-center",
	{
		variants: {
			size: {
				sm: "w-4 h-4 border-2",
				md: "w-8 h-8 border-4",
				lg: "w-12 h-12 border-6",
				xl: "w-16 h-16 border-8",
			},
		},
		defaultVariants: {
			size: "md",
		},
	}
);

// Định nghĩa Props cho component, bao gồm cả props từ cva
interface LoaderProps extends VariantProps<typeof loaderVariants> {
	className?: string;
}

const Loader = ({ size, className }: LoaderProps) => {
	const borderDefaultColor = "border-dark-gray-900";
	const borderTopColor = "border-t-dark-gray-100";

	return (
		<div className="flex-col gap-4 w-full flex items-center justify-center">
			<div
				className={cn(
					loaderVariants({ size }),
					borderDefaultColor,
					borderTopColor,
					className
				)}></div>
		</div>
	);
};

export default Loader;
