import { useState, useEffect } from "react";

/**
 * Hook to detect if the device is mobile or tablet
 * Uses both user agent and window width for accurate detection
 */
export const useIsMobile = () => {
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		const checkMobile = () => {
			// Check user agent
			const userAgent = navigator.userAgent.toLowerCase();
			const mobileKeywords = [
				"android",
				"webos",
				"iphone",
				"ipad",
				"ipod",
				"blackberry",
				"windows phone",
			];
			const isMobileUA = mobileKeywords.some((keyword) =>
				userAgent.includes(keyword)
			);

			// Check window width (mobile/tablet breakpoint)
			const isMobileWidth = window.innerWidth < 768; // md breakpoint

			setIsMobile(isMobileUA || isMobileWidth);
		};

		checkMobile();
		window.addEventListener("resize", checkMobile);

		return () => window.removeEventListener("resize", checkMobile);
	}, []);

	return isMobile;
};
