import DetailPage from "@/components/page/asset-vault/detail";

interface AssetDetailPageProps {
	params: {
		id: string; 
	};
}

export default function Detail() {

	return (
		<div className="font-exo px-6 py-4">
			<DetailPage  />
		</div>
	);
}
