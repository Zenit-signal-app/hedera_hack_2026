import api from "@/axios/axiosInstance";
import { useWalletStore } from "@/store/walletStore";

const useSwapToken = () => {
	const { activeWallet, usedAddress } = useWalletStore();

	const submitSwapTransaction = async (unsignedTxHex: string) => {
		if (!activeWallet || !usedAddress) return;

		try {
			const txWitnessSetHex = await activeWallet.signTx(unsignedTxHex);

			const submitResponse = await api.post("/analysis/swap", {
				tx_id: txWitnessSetHex,
			});

			const result = submitResponse?.data;
			if (!submitResponse) {
				throw new Error(result.message || "Lỗi gửi giao dịch.");
			}

			return result?.transaction_id;
		} catch (error) {
			console.error("Swap Error:", error);
			throw new Error("Giao dịch bị từ chối hoặc thất bại.");
		}
	};

	return { submitSwapTransaction };
};
