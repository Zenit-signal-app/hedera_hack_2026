import Image from "next/image";
import Link from "next/link";

export default function Header() {
	return (
		<header className="landing-header">
			<div className="landing-header-container">
				{/* Logo */}
				<div className="landing-logo-wrapper">
					<div className="landing-logo-icon">
						<Image
							src="/images/Logo_landingpage.png"
							alt="SeerBOT Logo"
							width={184}
							height={44}
							priority
						/>
					</div>
				</div>

				{/* Navigation */}
				<nav className="landing-nav">
					<div className="landing-nav-bg"></div>
					<a href="#home" className="landing-nav-link">
						Home
					</a>
					<a href="#how-it-works" className="landing-nav-link">
						How it works
					</a>
					<a href="#ai-assistant" className="landing-nav-link">
						AI Assistant
					</a>
					<a href="#why-seerbot" className="landing-nav-link">
						Why SeerBOT
					</a>
					<a href="#faq" className="landing-nav-link">
						FAQ
					</a>
					<a href="#trade-smarter" className="landing-nav-link">
						Trade smarter
					</a>
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
					<Link href="/analysis" className="landing-btn-launch">
						<span>Launch App</span>
					</Link>
				</div>
			</div>
		</header>
	);
}
