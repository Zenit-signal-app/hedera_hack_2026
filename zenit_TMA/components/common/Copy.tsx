"use client";

import React from "react";
import { Copy as CopyIcon } from "lucide-react";
import { toast } from "sonner";

type CopyProps = {
	value: string;
	successMessage?: string;
	errorMessage?: string;
	className?: string;
	iconClassName?: string;
	children?: React.ReactNode;
};

const Copy: React.FC<CopyProps> = ({
	value,
	successMessage = "Copy successfully to clipboard!",
	errorMessage = "Cannot copy to clipboard",
	className = "",
	iconClassName = "",
	children,
}) => {
	const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		try {
			await navigator.clipboard.writeText(value);
			toast.success(successMessage);
		} catch (err) {
			console.error("Copy failed", err);
			toast.error(errorMessage);
		}
	};

	return (
		<button
			type="button"
			onClick={handleCopy}
			className={`inline-flex items-center gap-1 text-gray-400 hover:text-white transition-colors ${className}`}
			aria-label={successMessage}
		>
			{children || (
				<>
					<span className="sr-only">Copy to clipboard</span>
				</>
			)}
			<CopyIcon className={`w-3 h-3 ${iconClassName}`} />
		</button>
	);
};

export default Copy;
