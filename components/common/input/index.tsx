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
	textColorClass = "text-dark-gray-100",
	highlightColorClass = "focus-within:ring-white focus-within:ring-2",
	placeholder = "Nhập vào...",
	className = "",
	...otherProps
}: CommonInputProps) => {
	const containerClasses = `
    flex items-center 
    w-full border border-dark-gray-700 text-dark-gray-100 rounded-lg px-3 py-2 
    transition-all duration-200 
    ${highlightColorClass} 
    ${className}
  `;

	const iconAndTextClasses = `
    ${textColorClass} 
  `;

	return (
		<div className={containerClasses}>
			{startIcon && (
				<div className={`mr-2 py-0.5 ${iconAndTextClasses}`}>{startIcon}</div>
			)}

			<input
				className={`
          w-full outline-none bg-transparent label-3
          placeholder--dark-gray-100 
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
