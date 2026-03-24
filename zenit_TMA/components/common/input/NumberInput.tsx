import type React from "react";
import { cn } from "@/lib/ultils";
import { Input } from "@/components/ui/input";
import { NumericFormat, type NumericFormatProps } from "react-number-format";

interface CommonNumberInputProps
	extends Omit<NumericFormatProps, "type" | "className"> {
	startIcon?: React.ReactNode;
	endIcon?: React.ReactNode;
	textColorClass?: string;
	highlightColorClass?: string;
	className?: string;
	inputClassName?: string;
}

const NumberInput = ({
	startIcon,
	endIcon,
	textColorClass = "",
	highlightColorClass = "",
	placeholder = "0.00",
	className = "",
	inputClassName = "",
	...otherProps
}: CommonNumberInputProps) => {
	const iconAndTextClasses = `
    ${textColorClass} 
  `;

	return (
		<div
			className={cn(
				"flex items-center w-full border border-dark-gray-700 rounded-lg px-3 py-2 transition-all duration-200",
				highlightColorClass,
				className
			)}
		>
			{startIcon && (
				<div className={cn("mr-2 py-0.5", iconAndTextClasses)}>
					{startIcon}
				</div>
			)}

			<NumericFormat
				customInput={Input}
				className={cn(
					"w-full outline-none bg-transparent label-3 placeholder--dark-gray-100",
					"border-0 px-0 py-0 h-auto ring-0 focus-visible:ring-0 focus-visible:ring-offset-0",
					iconAndTextClasses,
					inputClassName
				)}
				placeholder={placeholder}
				{...otherProps}
			/>

			{endIcon && (
				<div className={cn("ml-2", iconAndTextClasses)}>
					{endIcon}
				</div>
			)}
		</div>
	);
};

export default NumberInput;
