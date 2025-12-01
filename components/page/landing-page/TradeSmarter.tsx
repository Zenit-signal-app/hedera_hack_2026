import { ArrowRight } from "lucide-react";
import { Facebook, Instagram, Twitter, Linkedin, Youtube } from "lucide-react";

export default function TradeSmarter() {
	return (
		<section
			id="trade-smarter"
			className="landing-section trade-smarter-section"
		>
			{/* Background */}
			<div className="trade-smarter-background"></div>

			<div className="landing-section-wrapper h-[524px] justify-between items-center">
				<div className="trade-smarter-content">
					<h2 className="landing-section-title">
						Ready to Start
					</h2>

					{/* CTA Buttons */}
					<div className="flex items-center gap-4 flex-wrap justify-center">
						<span className="text-white text-lg font-medium">
							Try SeerBOT
						</span>
						<a href="/analysis" className="trade-smarter-btn">
							<span>Launch App</span>
							<ArrowRight className="w-5 h-5" />
						</a>
					</div>
				</div>

				{/* Footer */}
				<footer className="trade-smarter-footer">
					<div className="trade-smarter-footer-content">
						<div className="trade-smarter-footer-copyright">
							<span>© 2025 SeerBOT. All rights reserved.</span>
						</div>

						<div className="trade-smarter-footer-socials">
							<a href="#">
								<Facebook size={20} />
							</a>
							<a href="#">
								<Instagram size={20} />
							</a>
							<a href="#">
								<Twitter size={20} />
							</a>
							<a href="#">
								<Linkedin size={20} />
							</a>
							<a href="#">
								<Youtube size={20} />
							</a>
						</div>
					</div>
				</footer>
			</div>
		</section>
	);
}
