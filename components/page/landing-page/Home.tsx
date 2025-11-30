"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Partner } from "@/types/partner";

export default function Home({ partners = [] }: { partners?: Partner[] }) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const backgroundRef = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number>(0);

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
	console.log("Partners:", partners);

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
						Unleash the power
						<br />
						of automated crypto trading
					</h1>
					<p className="landing-hero-subtitle">
						Analyze, manage, and grow your crypto portfolio — all in
						one secure platform
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
							<p className="landing-brands-label w-[166px] mobile:w-[120px]">
								Backed by
							</p>
							<div className="">
								{partners.map((p, i) => (
									<div key={`partner-${i}-${p.name}`} className="landing-brand-logo">
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

					{/* Angel investors */}
					{partners && partners.length > 0 && (
						<div className="landing-brands-group">
							<p className="landing-brands-label w-[292px] mobile:w-[200px]">
								Angel investors form angel
							</p>
							<div className="">
								{partners.map((p, i) => (
									<div key={`partner-${i}-${p.name}`} className="landing-brand-logo">
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
									))
								}
							</div>
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
