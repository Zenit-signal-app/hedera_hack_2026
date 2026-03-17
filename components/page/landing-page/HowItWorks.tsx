"use client";

import Image from "next/image";
import { useRef, useState } from "react";

export default function HowItWorks() {
	const cardsRef = useRef<HTMLDivElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [startX, setStartX] = useState(0);
	const [scrollLeft, setScrollLeft] = useState(0);

	const handleMouseDown = (e: React.MouseEvent) => {
		if (!cardsRef.current) return;
		setIsDragging(true);
		setStartX(e.pageX - cardsRef.current.offsetLeft);
		setScrollLeft(cardsRef.current.scrollLeft);
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		if (!isDragging || !cardsRef.current) return;
		e.preventDefault();
		const x = e.pageX - cardsRef.current.offsetLeft;
		const walk = (x - startX) * 2; // Scroll speed
		cardsRef.current.scrollLeft = scrollLeft - walk;
	};

	const handleMouseUp = () => {
		setIsDragging(false);
	};

	const handleMouseLeave = () => {
		setIsDragging(false);
	};

	return (
		<section id="how-it-works" className="landing-section">
			{/* How It Works Background */}
			<div className="how-it-works-background"></div>

			{/* Content Wrapper */}
			<div className="landing-section-wrapper">
				{/* Section 1: Title and Image */}
				<div className="how-it-works-header">
					{/* Left: Text Content */}
					<div className="how-it-works-text">
						<h2 className="landing-section-title">How it works</h2>
						<p className="landing-section-subtitle">
							Zenit aim to make trading on Polkadot easier and
							more intuitive not just for DOT, but for the entire
							range of ecosystem token with On-chain Swap,
							Technical Analysis, AI Assistant, Strategy Vault and
							more.
						</p>
						<div className="landing-hero-actions">
							<button className="landing-btn-primary">
								Get started
							</button>
							<button className="landing-btn-secondary">
								Learn more
							</button>
						</div>
					</div>

					{/* Right: Feature Image */}
					<div className="how-it-works-image">
						<Image
							src="/images/how-it-work-bg.png"
							alt="How it works illustration"
							width={500}
							height={500}
							quality={100}
							priority
						/>
					</div>
				</div>

				{/* Section 2: Feature Cards - Horizontal Scroll */}
				<div
					ref={cardsRef}
					className="how-it-works-cards"
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleMouseLeave}
				>
					<div className="how-it-works-cards-container">
						<div className="how-it-works-card">
							<Image
								src="/images/howitwork_analysis_card.png"
								alt="Analysis"
								width={450}
								height={526}
								quality={100}
							/>
						</div>
						<div className="how-it-works-card">
							<Image
								src="/images/howitwork_assetvault_card.png"
								alt="Asset Vault"
								width={450}
								height={526}
								quality={100}
							/>
						</div>
						<div className="how-it-works-card">
							<Image
								src="/images/howitwork_portfolio_card.png"
								alt="Portfolio"
								width={450}
								height={526}
								quality={100}
							/>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
