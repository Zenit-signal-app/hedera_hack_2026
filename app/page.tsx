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
	const res = await fetch(url, { headers: { Accept: "application/json" } });
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
};

export default async function LandingPage() {
	let partners: Partner[] = [];
	let statistics: PlatformStatistics = {
		n_pair: "",
		liquidity: "",
		n_tx: "",
	};
	
	try {
		partners = await fetchApi("/content/partners").catch((err) => {
			console.error("Failed to load partners", err);
			return [];
		});
	} catch (err) {
		console.error("Failed to load partners", err);
	}

	try {
		statistics = await fetchApi("/content/statistics").catch((err) => {
			console.error("Failed to load statistics", err);
			return {
				n_pair: "",
				liquidity: "",
				n_tx: "",
			};
		});
	} catch (err) {
		console.error("Failed to load statistics", err);
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
