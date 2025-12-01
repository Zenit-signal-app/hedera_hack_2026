import {
	Header,
	Home,
	HowItWorks,
	AIAssistant,
	WhySeerBOT,
	FAQ,
	TradeSmarter,
} from "@/components/page/landing-page";

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
	// API may wrap payload in { data: T, ... } or return T directly
	return json && Object.prototype.hasOwnProperty.call(json, "data")
		? json.data
		: json;
};

export default async function LandingPage() {
	let partners = [] as any[];
	let statistics: any = null;

	try {
		const [p, s] = await Promise.all([
			fetchApi("/content/partners"),
			fetchApi("/content/statistics"),
		]);
		partners = p ?? [];
		statistics = s ?? null;
	} catch (err) {
		console.error("Failed to load landing page content", err);
	}
	console.log("statistics", statistics);

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
