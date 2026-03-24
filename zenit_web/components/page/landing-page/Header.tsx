"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import HamburgerIcon from "../../../src/components/icon/HamburgerIcon";

export default function Header() {
	const [activeSection, setActiveSection] = useState("home");
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	useEffect(() => {
		const handleScroll = () => {
			const sections = ["home", "how-it-works", "ai-assistant"];

			const scrollPosition = window.scrollY + 150; // Offset for header height + buffer
			let currentSection = "";

			// Find which section is currently in view
			for (const sectionId of sections) {
				const section = document.getElementById(sectionId);
				if (section) {
					const sectionTop = section.offsetTop;
					const sectionBottom = sectionTop + section.offsetHeight;

					// Check if scroll position is within this section
					if (
						scrollPosition >= sectionTop &&
						scrollPosition < sectionBottom
					) {
						currentSection = sectionId;
						break;
					}

					// If we've scrolled past all nav sections, clear active
					if (
						scrollPosition >= sectionBottom &&
						sectionId === sections[sections.length - 1]
					) {
						currentSection = "";
					}
				}
			}

			// Only update if there's a change
			if (currentSection !== activeSection) {
				setActiveSection(currentSection);
			}
		};

		window.addEventListener("scroll", handleScroll);
		handleScroll(); // Initial check

		return () => window.removeEventListener("scroll", handleScroll);
	}, [activeSection]);

	const handleNavClick = (
		e: React.MouseEvent<HTMLAnchorElement>,
		sectionId: string,
	) => {
		e.preventDefault();
		const section = document.getElementById(sectionId);
		if (section) {
			const headerOffset = 72; // Header height
			const elementPosition = section.offsetTop;
			const offsetPosition = elementPosition - headerOffset;

			window.scrollTo({
				top: offsetPosition,
				behavior: "smooth",
			});
		}
	};

	return (
		<header className="landing-header">
			<div className="landing-header-container">
				{/* Mobile Menu Button - Only visible on mobile */}
				<button
					className="landing-hamburger-btn"
					onClick={() => setIsMenuOpen(!isMenuOpen)}
				>
					<HamburgerIcon />
				</button>

				{/* Divider - Only visible on mobile */}
				<div className="landing-header-divider"></div>

				{/* Logo */}
				<div className="landing-logo-wrapper">
					<div className="landing-logo-icon flex items-center">
						<Image
							src="/images/logo.png"
							alt="Zenit Logo"
							width={64}
							height={32}
							priority
						/>
						<span className="font-quicksand text-4xl font-bold">
							Zenit
						</span>
					</div>
				</div>

				{/* Navigation */}
				<nav className="landing-nav">
					<div className="landing-nav-bg"></div>
					<a
						href="#home"
						className={`landing-nav-link ${
							activeSection === "home" ? "active" : ""
						}`}
						onClick={(e) => handleNavClick(e, "home")}
					>
						Home
					</a>
					<a
						href="#how-it-works"
						className={`landing-nav-link ${
							activeSection === "how-it-works" ? "active" : ""
						}`}
						onClick={(e) => handleNavClick(e, "how-it-works")}
					>
						How it works
					</a>
					<a
						href="#ai-assistant"
						className={`landing-nav-link ${
							activeSection === "ai-assistant" ? "active" : ""
						}`}
						onClick={(e) => handleNavClick(e, "ai-assistant")}
					>
						AI Assistant
					</a>
					{/* <a href="#why-Zenit" className="landing-nav-link">
						Why Zenit
					</a>
					<a href="#faq" className="landing-nav-link">
						FAQ
					</a>
					<a href="#trade-smarter" className="landing-nav-link">
						Trade smarter
					</a> */}
				</nav>

				{/* Actions */}
				<div className="landing-actions">
					<button className="landing-btn-language">
						<span>EN</span>
						<svg
							width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M4 6L8 10L12 6"
								stroke="#777777"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</button>
					<a href="/analysis" className="landing-btn-launch">
						<span>Launch App</span>
					</a>
				</div>
			</div>

			{/* Mobile Menu Dropdown */}
			{isMenuOpen && (
				<div className="landing-mobile-menu">
					<a
						href="#home"
						className={`landing-mobile-menu-link ${
							activeSection === "home" ? "active" : ""
						}`}
						onClick={(e) => {
							handleNavClick(e, "home");
							setIsMenuOpen(false);
						}}
					>
						Home
					</a>
					<a
						href="#how-it-works"
						className={`landing-mobile-menu-link ${
							activeSection === "how-it-works" ? "active" : ""
						}`}
						onClick={(e) => {
							handleNavClick(e, "how-it-works");
							setIsMenuOpen(false);
						}}
					>
						How it works
					</a>
					<a
						href="#ai-assistant"
						className={`landing-mobile-menu-link ${
							activeSection === "ai-assistant" ? "active" : ""
						}`}
						onClick={(e) => {
							handleNavClick(e, "ai-assistant");
							setIsMenuOpen(false);
						}}
					>
						AI Assistant
					</a>
				</div>
			)}
		</header>
	);
}
