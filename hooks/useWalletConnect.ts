// hooks/useWalletConnect.ts (Đã sửa đổi hoàn toàn)

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useCallback, useState } from "react";
import { WalletApi } from "../types/wallet";
import { useWalletStore } from "../store/walletStore";
import { convertHexToBech32, parseBalance } from "@/lib/ultils";
import { SUPPORTED_WALLETS } from "@/lib/constant";
import { MinswapBalanceItem } from "@/types/minswap";
import { fetchMinswapBalance } from "@/services/swapApi";

interface WalletHook {
	connect: (walletId: string) => Promise<void>;
	disconnect: () => void;
	isLoading: boolean;
}
const loadWalletInfo = async (walletApi: WalletApi) => {
	const { setWalletInfo, setWalletInfoLoading, setError } =
		useWalletStore.getState();

	setWalletInfoLoading(true);
	setError(null);

	try {
		const netId = await walletApi.getNetworkId();

		const usedAddresses = await walletApi.getUsedAddresses();
		let addressToDisplay = null;

		if (usedAddresses && usedAddresses.length > 0) {
			addressToDisplay = convertHexToBech32(usedAddresses[0]);
		} else {
			const unusedAddresses = await walletApi.getUnusedAddresses();
			if (unusedAddresses && unusedAddresses.length > 0) {
				addressToDisplay = convertHexToBech32(unusedAddresses[0]);
			}
		}

		if (!addressToDisplay) {
			throw new Error("Không thể xác định địa chỉ ví Bech32.");
		}

		const assetsList: MinswapBalanceItem[] = await fetchMinswapBalance(
			addressToDisplay
		);

		setWalletInfo({
			networkId: netId,
			usedAddress: addressToDisplay,

			balance: assetsList,
		});
	} catch (e: any) {
		console.error("Lỗi khi tải thông tin ví:", e);
		setError(
			`Lỗi khi tải thông tin ví: ${e.message || "Lỗi không xác định"}`
		);
	} finally {
		setWalletInfoLoading(false);
	}
};

export const useWalletConnect = (): WalletHook => {
	const activeWallet = useWalletStore((state) => state.activeWallet);
	const availableWallets = useWalletStore((state) => state.availableWallets);
	const { setWallets, setConnected, setDisconnected, setError } =
		useWalletStore.getState();

	const [isLoading, setIsLoading] = useState(false);
	useEffect(() => {
		let mounted = true;
		let checkCount = 0;
		const maxChecks = 10;
		const checkInterval = 300;

		const detectWallets = () => {
			if (!mounted) return;

			if (typeof window.cardano !== "undefined") {
				const installedWallets = SUPPORTED_WALLETS.filter(
					(wallet) => window.cardano && window.cardano[wallet.id]
				);

				if (installedWallets.length > 0 || checkCount >= maxChecks) {
					setWallets(installedWallets);
				} else {
					checkCount++;
					setTimeout(detectWallets, checkInterval);
				}
			} else {
				checkCount++;
				if (checkCount < maxChecks) {
					setTimeout(detectWallets, checkInterval);
				} else {
					setWallets([]);
				}
			}
		};

		detectWallets();

		const handleWalletInjected = () => {
			detectWallets();
		};

		window.addEventListener("cardano#initialized", handleWalletInjected);

		return () => {
			mounted = false;
			window.removeEventListener(
				"cardano#initialized",
				handleWalletInjected
			);
		};
	}, []);

	const disconnect = useCallback(() => {
		localStorage.removeItem("connectedWalletId");
		setDisconnected();
		console.log("Đã ngắt kết nối.");
	}, []);

	// 3. Hàm kết nối ví
	const connect = useCallback(
		async (walletId: string) => {
			setError(null);
			setIsLoading(true);

			if (
				typeof window.cardano === "undefined" ||
				!window.cardano[walletId]
			) {
				// Get wallet URL to redirect user
				const wallet = SUPPORTED_WALLETS.find(w => w.id === walletId);
				const extensionUrl = wallet?.url || '';
				
				if (extensionUrl) {
					// Redirect to extension store
					window.open(extensionUrl, '_blank');
				}
				
				setError(`Ví ${walletId} chưa được cài đặt. Vui lòng cài đặt extension.`);
				setIsLoading(false);
				return;
			}

			let retries = 0;
			const maxRetries = 3;
			const retryDelay = 1000; // 1 second

			const attemptConnection = async (): Promise<void> => {
				try {
					const walletApi = window.cardano[walletId];

					// Check if wallet is available and has enable method
					if (!walletApi || typeof walletApi.enable !== "function") {
						throw new Error(
							`Ví ${walletId} không được tìm thấy hoặc không hỗ trợ.`
						);
					}

					const api: WalletApi = await walletApi.enable();
					setConnected(api, walletId);
					localStorage.setItem("connectedWalletId", walletId);
				} catch (err: any) {
					if (retries < maxRetries - 1) {
						retries++;
						console.warn(
							`Lỗi kết nối, thử lại (${retries}/${maxRetries})...`
						);
						await new Promise((resolve) =>
							setTimeout(resolve, retryDelay)
						);
						await attemptConnection();
					} else {
						const errorMsg = err.message || "Người dùng từ chối.";
						setError(`Lỗi kết nối: ${errorMsg}`);
						setDisconnected();
						throw err;
					}
				}
			};

			try {
				await attemptConnection();
			} finally {
				setIsLoading(false);
			}
		},
		[setConnected, setDisconnected, setError]
	);

	useEffect(() => {
		if (!activeWallet) return;
		loadWalletInfo(activeWallet);

		if (
			typeof activeWallet.on === "function" &&
			typeof activeWallet.off === "function"
		) {
			const handleAccountChange = () => {
				loadWalletInfo(activeWallet);
			};

			activeWallet.on("accountChange", handleAccountChange);

			return () => {
				activeWallet.off("accountChange", handleAccountChange);
			};
		}
	}, [activeWallet]);

	useEffect(() => {
		const storedWalletId = localStorage.getItem("connectedWalletId");
		if (
			storedWalletId &&
			availableWallets.length > 0 &&
			availableWallets.some((w) => w.id === storedWalletId)
		) {
			setTimeout(() => {
				connect(storedWalletId).catch((err) => {
					console.warn("Tự động kết nối lại thất bại.");
					disconnect();
				});
			}, 0);
		}
	}, [connect, disconnect, availableWallets]);
	return {
		connect,
		disconnect,
		isLoading,
	};
};
