import {
	Header,
	Home,
	HowItWorks,
	AIAssistant,
	WhySeerBOT,
	FAQ,
	TradeSmarter,
} from "@/components/page/landing-page";
import { Partner } from "@/types/partner";
import { PlatformStatistics } from "@/types/platform";

const baseUrl =
	process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.seerbot.io";
const fetchApi = async (path: string) => {
	const url = `${baseUrl}${path}`;
	try {
		const res = await fetch(url, {
			headers: { Accept: "application/json" },
			next: { revalidate: 60 }, // Cache for 60 seconds
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(
				`Fetch ${url} failed: ${res.status} ${res.statusText} ${text}`
			);
		}
		const json = await res.json().catch(() => null);
		return json && Object.prototype.hasOwnProperty.call(json, "data")
			? json.data
			: json;
	} catch (error) {
		// Log error but ensure function returns null instead of throwing
		console.error(`API fetch error for ${path}:`, error);
		return null;
	}
};

export default async function LandingPage() {
	// Default values to prevent crash on API failure
	const defaultStatistics: PlatformStatistics = {
		n_pair: "0",
		liquidity: "0",
		n_tx: "0",
	};

	let partners: Partner[] = [];
	let statistics: PlatformStatistics = defaultStatistics;
	
	// Fetch partners with graceful error handling
	try {
		const result = await fetchApi("/content/partners");
		if (Array.isArray(result)) {
			partners = result;
		}
	} catch (err) {
		console.error("Failed to load partners", err);
		// Keep default empty array
	}

	// Fetch statistics with graceful error handling
	try {
		const result = await fetchApi("/content/statistics");
		if (result && typeof result === "object") {
			statistics = {
				n_pair: result.n_pair || defaultStatistics.n_pair,
				liquidity: result.liquidity || defaultStatistics.liquidity,
				n_tx: result.n_tx || defaultStatistics.n_tx,
			};
		}
	} catch (err) {
		console.error("Failed to load statistics", err);
		// Keep default values
	}

	return (
		<div className="landing-page-container">
			<Header />
			<div className="landing-content">
				<Home partners={partners} />
				<HowItWorks />
				<div className="bg-[url(/images/background_home.png)] bg-center bg-cover bg-no-repeat">
					<AIAssistant />
					<WhySeerBOT stats={statistics} />
					<FAQ />
					<TradeSmarter />
				</div>
			</div>
		</div>
	);
}
