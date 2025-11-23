import SwapContainer from "@/components/page/analysis/swap";

export default function Analysis() {
	return (
		<div className="flex min-h-screen font-museomoderno items-center justify-center grid grid-cols-3">
			<div className="col-span-2"></div>
			<div className="col-span-1">
				<SwapContainer />
			</div>
		</div>
	);
}
