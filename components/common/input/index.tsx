interface CommonInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
	startIcon?: React.ReactNode;
	endIcon?: React.ReactNode;
	textColorClass?: string;
	highlightColorClass?: string;
	className?: string;
}

const Input = ({
	startIcon,
	endIcon,
	textColorClass = "text-gray-100",
	highlightColorClass = "focus-within:ring-white focus-within:ring-2",
	placeholder = "Nhập vào...",
	className = "",
	...otherProps
}: CommonInputProps) => {
	const containerClasses = `
    flex items-center 
    w-full border border-gray-300 rounded-lg p-2 
    transition-all duration-200 
    ${highlightColorClass} 
    ${className}
  `;

	// Class cho icon và text
	const iconAndTextClasses = `
    ${textColorClass} 
  `;

	return (
		<div className={containerClasses}>
			{startIcon && (
				<div className={`mr-2 ${iconAndTextClasses}`}>{startIcon}</div>
			)}

			<input
				className={`
          w-full outline-none bg-transparent 
          placeholder-gray-400 
          ${iconAndTextClasses} 
        `}
				placeholder={placeholder}
				{...otherProps}
			/>

			{endIcon && <div className={`ml-2 ${iconAndTextClasses}`}>{endIcon}</div>}
		</div>
	);
};

export default Input;
