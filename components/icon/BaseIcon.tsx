import React, { CSSProperties, SVGProps } from "react";

export interface IconProps extends SVGProps<SVGSVGElement> {
	color?: string;

	size?: number | string;

	children?: React.ReactNode;
}



const Icon: React.FC<IconProps> = ({
	children,
	color = "currentColor",
	size = 24,
	style,
	viewBox = "0 0 24 24",
	...rest
}) => {
	const baseStyles: CSSProperties = {
		width: size,
		height: size,
		color: color,
		display: "inline-block",
		flexShrink: 0,
	};

	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox={viewBox}
			fill="none"
			stroke={color}
			style={{ ...baseStyles, ...style }}
			{...rest}>
			{children}
		</svg>
	);
};

export default Icon;


