"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Partner } from "@/types/partner";
import { useIsMobile } from "@/src/components/hooks/useIsMobile";

export default function Home({ partners = [] }: { partners?: Partner[] }) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const backgroundRef = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number>(0);
	const isMobile = useIsMobile();
	useEffect(() => {
		const updateHeight = () => {
			if (wrapperRef.current && backgroundRef.current) {
				const wrapperHeight = wrapperRef.current.offsetHeight;
				setHeight(wrapperHeight);
			}
		};

		updateHeight();
		window.addEventListener("resize", updateHeight);

		return () => {
			window.removeEventListener("resize", updateHeight);
		};
	}, []);
	const scaledPartners = useMemo(() => {
		const MIN_ITEMS = isMobile ? 1 : 10;
		const currentCount = partners.length;

		if (currentCount >= MIN_ITEMS) {
			return partners;
		}
		let scaledList: Partner[] = [...partners];
		while (scaledList.length < MIN_ITEMS) {
			const remaining = MIN_ITEMS - scaledList.length;

			const itemsToAppend = partners.slice(
				0,
				Math.min(remaining, currentCount)
			);

			scaledList = scaledList.concat(itemsToAppend);

			if (currentCount > 0 && scaledList.length < MIN_ITEMS) {
				scaledList = scaledList.concat(partners);
			}
		}

		return scaledList.slice(0, MIN_ITEMS);
	}, [partners]);
	return (
		<section id="home" className="landing-section">
			{/* Home Background */}
			<div
				ref={backgroundRef}
				className="home-background"
				style={{ height: height > 0 ? `${height}px` : "auto" }}
			></div>

			{/* Content Wrapper */}
			<div ref={wrapperRef} className="landing-section-wrapper">
				{/* Hero Section */}
				<div className="landing-hero">
					<h1 className="landing-hero-title">
						The next generation trading
						<br />
					platform on Cardano
					</h1>
					<p className="landing-hero-subtitle">
						Analyze, manage, and grow your crypto balance — all in one secure platform
					</p>
					<div className="landing-hero-actions justify-center">
						<button className="landing-btn-primary">
							Get started
						</button>
						<button className="landing-btn-secondary">
							Learn more
						</button>
					</div>
				</div>

				{/* Demo Image Section */}
				<div className="landing-demo">
					<Image
						src="/images/landing-page-1.png"
						alt="SeerBot Trading Platform Demo"
						width={1280}
						height={681}
						className="landing-demo-image"
						quality={100}
						priority
						unoptimized
					/>
				</div>

				{/* Brands Section */}
				<div className="landing-brands">
					{/* Backed by */}
					{partners && partners.length > 0 && (
						<div className="landing-brands-group">
							<div className="landing-brands-label bg-linear-to-r from-[#0E0E0F] from-73% to-transparent font-semibold whitespace-nowrap w-full ">
								<p className="lg:w-full w-max">Backed by</p>
							</div>
							<div className="landing-brands-track">
								{scaledPartners.map((p, i) => (
									<div
										key={`partner-${i}-${p.name}`}
										className="landing-brand-logo flex items-center"
									>
										<Image
											src={p.logo}
											alt={p.name}
											width={134}
											height={35}
											className="w-[134px] h-[35px] mobile:!w-[100px] mobile:!h-[40px] object-contain"
											style={{ objectFit: "contain" }}
											unoptimized
										/>
									</div>
								))}
							</div>
						</div>
					)}

					{/* {partners && partners.length > 0 && (
						<div className="landing-brands-group">
							<div className="landing-brands-label bg-linear-to-r from-[#0E0E0F] from-83% to-transparent font-semibold whitespace-nowrap w-full ">
								<p className="lg:w-full w-max">
									Angel investors
								</p>
							</div>
							<div className="landing-brands-track">
								{scaledPartners.map((p, i) => (
									<div
										key={`partner-${i}-${p.name}`}
										className="landing-brand-logo flex items-center"
									>
										<Image
											src={p.logo}
											alt={p.name}
											width={134}
											height={35}
											className="w-[134px] h-[35px] mobile:!w-[100px] mobile:!h-[40px] object-contain"
											style={{ objectFit: "contain" }}
											unoptimized
										/>
									</div>
								))}
							</div>
						</div>
					)} */}
				</div>
			</div>
		</section>
	);
}
