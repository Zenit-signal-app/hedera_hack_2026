import {
	Header,
	Home,
	HowItWorks,
	AIAssistant,
	WhySeerBOT,
	FAQ,
	TradeSmarter,
} from "@/components/page/landing-page";

export default function LandingPage() {
	return (
		<div className="landing-page-container">
			<Header />
			<div className="landing-content">
				<Home />
				<HowItWorks />
				<AIAssistant />
				<WhySeerBOT />
				<FAQ />
				<TradeSmarter />
			</div>
		</div>
	);
}
