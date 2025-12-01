"use client";

import { Check } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import type { PlatformStatistics } from "@/types/platform";

const STATS_CARDS = [
	{
		value: "7,302,402",
		label: "Trading pairs",
		numericValue: "n_pair",
		prefix: "",
		suffix: "",
	},
	{
		value: "$459.30B",
		label: "liquidity",
		numericValue: "liquidity",
		prefix: "$",
		suffix: "B",
	},
	{
		value: "8,450",
		label: "decentralised exchanges",
		numericValue: "n_tx",
		prefix: "",
		suffix: "",
	},
] as const;

// Counter Animation Component
function AnimatedCounter({
	value,
	prefix = "",
	suffix = "",
	duration = 600,
}: {
	value: number;
	prefix?: string;
	suffix?: string;
	duration?: number;
}) {
	const [count, setCount] = useState(0);
	const [hasAnimated, setHasAnimated] = useState(false);
	const counterRef = useRef<HTMLHeadingElement>(null);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting && !hasAnimated) {
						setHasAnimated(true);
						animateCounter();
					}
				});
			},
			{ threshold: 0.3 }
		);

		if (counterRef.current) {
			observer.observe(counterRef.current);
		}

		return () => {
			if (counterRef.current) {
				observer.unobserve(counterRef.current);
			}
		};
	}, [hasAnimated]);

	const animateCounter = () => {
		const startTime = Date.now();
		const endValue = value;

		const updateCounter = () => {
			const now = Date.now();
			const elapsed = now - startTime;
			const progress = Math.min(elapsed / duration, 1);

			const easeOut = 1 - Math.pow(1 - progress, 2);
			const currentValue = easeOut * endValue;

			setCount(currentValue);

			if (progress < 1) {
				requestAnimationFrame(updateCounter);
			} else {
				setCount(endValue);
			}
		};

		requestAnimationFrame(updateCounter);
	};

	const formatNumber = (num: number) => {
		if (num >= 1000) {
			return Math.floor(num).toLocaleString("en-US");
		}
		return num.toFixed(1);
	};

	return (
		<h2 ref={counterRef} className="why-seerbot-stats-value">
			{prefix}
			{formatNumber(count)}
			{suffix}
		</h2>
	);
}

export default function WhySeerBOT({stats} : {stats: PlatformStatistics}) {
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
		<section
			id="why-seerbot"
			className="landing-section why-seerbot-section"
		>
			{/* Black Background */}
			<div className="why-seerbot-background"></div>

			<div className="landing-section-wrapper">
				<div className="landing-section-content">
					<h2 className="landing-section-title">Why SeerBOT</h2>
					<p className="landing-section-subtitle">
						Navigating the Cardano DeFi ecosystem shouldn't be complicated. SeerBOT combines the security of non-custodial trading with the power of AI-driven analysis. We provide the tools you need to validate market trends, automate your strategies, and trade with confidence without ever giving up control of your assets
					</p>
				</div>

			{/* Features */}
			<div className="flex flex-col md:flex-row justify-center items-center gap-8 -mt-3xl pb-10">
					<div className="flex items-center gap-2">
						<div className="w-5 h-5 rounded-full border-2 border-green-500 flex items-center justify-center">
							<Check
								className="w-3 h-3 text-green-500"
								strokeWidth={3}
							/>
						</div>
						<span className="text-green-500 text-sm font-medium">
							100% transparent
						</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-5 h-5 rounded-full border-2 border-green-500 flex items-center justify-center">
							<Check
								className="w-3 h-3 text-green-500"
								strokeWidth={3}
							/>
						</div>
						<span className="text-green-500 text-sm font-medium">
							Self-custodial
						</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-5 h-5 rounded-full border-2 border-green-500 flex items-center justify-center">
							<Check
								className="w-3 h-3 text-green-500"
								strokeWidth={3}
							/>
						</div>
						<span className="text-green-500 text-sm font-medium">
							No fixed fees
						</span>
					</div>
				</div>

				{/* Stats Cards */}
				<div
					ref={cardsRef}
					className="why-seerbot-stats-container"
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleMouseLeave}
				>
					{STATS_CARDS.map((card, index) => (
						<div key={index} className="why-seerbot-stats-card">
							<div className="why-seerbot-stats-card-bg"></div>
							<div className="why-seerbot-stats-card-content">
								<AnimatedCounter
									value={Number(stats[card.numericValue])}
									prefix={card.prefix}
									suffix={card.suffix}
									duration={1000}
								/>
								<p className="why-seerbot-stats-label">
									{card.label}
								</p>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
