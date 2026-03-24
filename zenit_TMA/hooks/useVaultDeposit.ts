/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Custom hook for vault deposit operations
 * Handles direct deposit to vault smart contract via on-chain transaction
 * Supports Solana, Polkadot, and Hedera chains
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useWalletStore } from '@/store/walletStore';
import type { ChainId } from '@/lib/constant';
import {
  VaultConfig,
  toSmallestUnit,
  fromSmallestUnit,
  depositToVault,
  estimateDepositFee,
  CHAIN_NATIVE_SYMBOL,
} from '@/lib/vault-transaction';

export interface UseVaultDepositResult {
  isDepositing: boolean;
  error: string | null;
  txHash: string | null;
  deposit: (vaultConfig: VaultConfig, amount: number, contributorAddress?: string) => Promise<string | null>;
  estimateFee: (vaultConfig: VaultConfig, amount: number, contributorAddress?: string) => Promise<number>;
  reset: () => void;
}

export function useVaultDeposit(): UseVaultDepositResult {
  const [isDepositing, setIsDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const activeChain = useWalletStore((state) => state.activeChain) as ChainId | null;

  const deposit = useCallback(
    async (
      vaultConfig: VaultConfig,
      amount: number,
      contributorAddress?: string
    ): Promise<string | null> => {
      if (!activeChain) {
        const errorMsg = 'Please select a chain first';
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

      if (amount <= 0) {
        const errorMsg = 'Deposit amount must be greater than 0';
        setError(errorMsg);
        toast.error(errorMsg);
        return null;
      }

      setIsDepositing(true);
      setError(null);
      setTxHash(null);

      try {
        const amountSmallest = toSmallestUnit(amount, activeChain);

        if (amountSmallest < vaultConfig.min_deposit) {
          throw new Error(
            `Deposit amount is below minimum required (${fromSmallestUnit(vaultConfig.min_deposit, activeChain)} ${CHAIN_NATIVE_SYMBOL[activeChain]})`,
          );
        }

        const result = await depositToVault(
          activeChain,
          vaultConfig.vault_address,
          amountSmallest,
          contributorAddress,
        );

        setTxHash(result.txHash);
        toast.success('Deposit successful!', { description: `TX: ${result.txHash}` });
        return result.txHash;
      } catch (err: any) {
        const errorMsg = err.message || 'Failed to deposit to vault';
        setError(errorMsg);
        toast.error('Deposit failed', { description: errorMsg });
        return null;
      } finally {
        setIsDepositing(false);
      }
    },
    [activeChain]
  );

  const estimateFee = useCallback(
    async (
      vaultConfig: VaultConfig,
      amount: number,
      contributorAddress?: string
    ): Promise<number> => {
      if (!activeChain || !contributorAddress) return 0;

      const amountSmallest = toSmallestUnit(amount, activeChain);

      return estimateDepositFee(
        activeChain,
        vaultConfig.vault_address,
        amountSmallest,
        contributorAddress,
      );
    },
    [activeChain]
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
