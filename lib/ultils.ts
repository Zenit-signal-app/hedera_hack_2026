import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function absoluteUrl(path: string) {
	return `${process.env.NEXT_PUBLIC_APP_URL}${path}`;
}

type TType = {
	baseToken: string;
	quoteToken: string;
};

export function parseTokenPair(symbol: string): TType {
	if (!symbol || typeof symbol !== "string") {
		return {
			baseToken: "",
			quoteToken: "",
		};
	}

	const parts = symbol.split("_");

	if (parts.length !== 2) {
		return {
			baseToken: symbol,
			quoteToken: "",
		};
	}

	const baseToken = parts[0].toUpperCase();
	const quoteToken = parts[1].toUpperCase();

	return { baseToken, quoteToken };
}
