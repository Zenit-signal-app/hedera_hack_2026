import DetailPage from "@/components/page/asset-vault/detail";

interface AssetDetailPageProps {
	params: {
		id: string;
	};
}

export default function Detail() {
	return (
		<div className="font-exo px-4 py-4 tablet:px-6">
			<DetailPage />
		</div>
	);
}
