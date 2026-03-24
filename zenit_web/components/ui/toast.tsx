"use client";
import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import IconSuccess from "../icon/Icon_ Success";
const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();
	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			position="top-center"
			className="toaster group"
			icons={{
				success: <IconSuccess className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" color="var(--color-yellow-600)" />,
				error: (
					<OctagonXIcon
						className="size-4"
						color="var(--color-red-500)"
					/>
				),
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "#000000",
					"--normal-text": "#ffffff",
					"--normal-border": "var(--color-dark-gray-700)",
					"--border-radius": "6px",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};
export { Toaster };
