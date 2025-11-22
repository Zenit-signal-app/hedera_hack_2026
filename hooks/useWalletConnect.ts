// hooks/useWalletConnect.ts (Đã sửa đổi hoàn toàn)

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useCallback, useState } from 'react';
import { WalletApi, SUPPORTED_WALLETS } from '../types/wallet';
import { useWalletStore } from '../store/walletStore'; // ✨ IMPORT ZUSTAND STORE

interface WalletHook {
  connect: (walletId: string) => Promise<void>;
  disconnect: () => void;
  isLoading: boolean;
}

// 1. Hàm tải thông tin ví (Được tách ra khỏi hook để dễ dàng gọi lại)
const loadWalletInfo = async (walletApi: WalletApi) => {
  const { setWalletInfo, setWalletInfoLoading, setError } = useWalletStore.getState();

  setWalletInfoLoading(true);
  setError(null);

  try {
    const netId = await walletApi.getNetworkId();
    
    const usedAddresses = await walletApi.getUsedAddresses();
    let addressToDisplay = null;

    if (usedAddresses && usedAddresses.length > 0) {
      addressToDisplay = usedAddresses[0].toString();
    } else {
      const unusedAddresses = await walletApi.getUnusedAddresses();
      if (unusedAddresses && unusedAddresses.length > 0) {
        addressToDisplay = unusedAddresses[0].toString();
      }
    }
    
    const walletBalance = await walletApi.getBalance();
    
    setWalletInfo({
      networkId: netId,
      usedAddress: addressToDisplay,
      balance: walletBalance.toString(),
    });

  } catch (e) {
    console.error('Lỗi khi tải thông tin ví:', e);
    setError('Lỗi khi tải thông tin ví.');
  } finally {
    setWalletInfoLoading(false);
  }
};


export const useWalletConnect = (): WalletHook => {
  // Lấy state và actions từ Zustand
  const activeWallet = useWalletStore((state) => state.activeWallet);
  const { setWallets, setConnected, setDisconnected, setError } = useWalletStore.getState();
  
  // State cục bộ cho loading của hành động Connect/Disconnect
  const [isLoading, setIsLoading] = useState(false);

  // 1. Tải danh sách ví đã cài đặt (Chỉ chạy một lần)
  useEffect(() => {
    if (typeof window.cardano !== 'undefined') {
      const installedWallets = SUPPORTED_WALLETS.filter(
        (wallet) => !!window.cardano && !!window.cardano[wallet.id]
      );
      setWallets(installedWallets);
    }
  }, [setWallets]);

  // 2. Hàm ngắt kết nối
  const disconnect = useCallback(() => {
    localStorage.removeItem('connectedWalletId');
    setDisconnected();
    console.log('Đã ngắt kết nối.');
  }, [setDisconnected]);

  // 3. Hàm kết nối ví
  const connect = useCallback(async (walletId: string) => {
    setError(null);
    setIsLoading(true);

    if (typeof window.cardano === 'undefined' || !window.cardano[walletId]) {
      setError(`Ví ${walletId} chưa được cài đặt.`);
      setIsLoading(false);
      return;
    }

    try {
      const api: WalletApi = await window.cardano[walletId].enable();
      setConnected(api, walletId);
      localStorage.setItem('connectedWalletId', walletId);
    } catch (err: any) {
      setError(`Lỗi kết nối: ${err.message || 'Người dùng từ chối.'}`);
      setDisconnected();
      throw new Error('Connection Rejected'); 
    } finally {
      setIsLoading(false);
    }
  }, [setConnected, setDisconnected, setError]);

  useEffect(() => {
    if (!activeWallet) return;
    loadWalletInfo(activeWallet);

    if (typeof activeWallet.on === 'function' && typeof activeWallet.off === 'function') {
      const handleAccountChange = () => {
        console.log('CIP-30 Event: Account change detected. Refetching wallet info.');
        loadWalletInfo(activeWallet);
      };

      activeWallet.on('accountChange', handleAccountChange);

      return () => {
        activeWallet.off('accountChange', handleAccountChange);
      };
    }
  }, [activeWallet]);

  useEffect(() => {
    const storedWalletId = localStorage.getItem('connectedWalletId');
    const { availableWallets } = useWalletStore.getState();
    if (
      storedWalletId &&
      availableWallets.some((w) => w.id === storedWalletId)
    ) {
      setTimeout(() => {
        connect(storedWalletId).catch((err) => {
          console.warn('Tự động kết nối lại thất bại.');
          disconnect();
        });
      }, 0);
    }
  }, [connect, disconnect]);
  return {
    connect,
    disconnect,
    isLoading,
  };
};