/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Custom hook for vault deposit operations
 * Handles direct deposit to vault smart contract with wallet signing
 */

import { useState, useCallback } from 'react';
import { useWalletStore } from '@/store/walletStore';
import { toast } from 'sonner';

export interface UseVaultDepositResult {
  isDepositing: boolean;
  error: string | null;
  txHash: string | null;
  deposit: (vaultId: string, amountNative: number, contributorAddress?: string) => Promise<string | null>;
  estimateFee: (vaultId: string, amountNative: number, contributorAddress?: string) => Promise<number>;
  reset: () => void;
}

export function useVaultDeposit(): UseVaultDepositResult {
  const [isDepositing, setIsDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const activeChain = useWalletStore((state) => state.activeChain);
  const chainConnections = useWalletStore((state) => state.chainConnections);
  const walletAddress = activeChain ? chainConnections[activeChain]?.address : undefined;

  const deposit = useCallback(
    async (
      vaultId: string,
      amountNative: number,
      contributorAddress?: string
    ): Promise<string | null> => {
      if (!walletAddress) {
        const errorMsg = 'Please connect your wallet first';
        setError(errorMsg);
        toast.error(errorMsg);
        return null;
      }

      if (!contributorAddress) {
        const errorMsg = 'Contributor wallet address is required for deposit';
        setError(errorMsg);
        toast.error(errorMsg);
        return null;
      }

      if (amountNative <= 0) {
        const errorMsg = 'Deposit amount must be greater than 0';
        setError(errorMsg);
        toast.error(errorMsg);
        return null;
      }

      setIsDepositing(true);
      setError(null);
      setTxHash(null);

      try {
        // Chain-specific vault deposit — implementation coming soon
        throw new Error(`Vault deposit via ${activeChain ?? 'selected chain'} — coming soon`);
      } catch (err: any) {
        const errorMsg = err.message || 'Failed to deposit to vault';
        setError(errorMsg);
        toast.error('Deposit failed', { description: errorMsg });
        return null;
      } finally {
        setIsDepositing(false);
      }
    },
    [walletAddress, activeChain]
  );

  const reset = useCallback(() => {
    setIsDepositing(false);
    setError(null);
    setTxHash(null);
  }, []);

  return {
    isDepositing,
    error,
    txHash,
    deposit,
    estimateFee,
    reset,
  };
}
