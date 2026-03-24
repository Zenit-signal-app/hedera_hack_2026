import WalletBalance from "@/components/page/portfolio/WalletBalance";
import VaultEarnings from "@/components/page/portfolio/VaultEarnings";
import TransactionHistory from "@/components/page/portfolio/TransactionHistory";

export default function Portfolio() {
	return (
		<div className="min-h-screen w-full px-4 py-6 md:p-6">
			<div className="flex flex-col gap-6">
				<div className="flex flex-col lg:flex-row gap-6">
					<div className="flex-shrink-0">
						<WalletBalance />
					</div>
					<div className="flex-1">
						<VaultEarnings />
					</div>
				</div>

				<div className="w-full">
					<TransactionHistory />
				</div>
			</div>
		</div>
	);
}
