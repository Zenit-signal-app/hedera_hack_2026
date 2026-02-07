/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Custom hook for vault deposit operations
 * Handles direct deposit to vault smart contract with wallet signing
 */

import { useState, useCallback } from 'react';
import { useWalletStore } from '@/store/walletStore';
import { 
  VaultConfig, 
  initializeLucid, 
  depositToVaultContract, 
  adaToLovelace,
  estimateDepositFee
} from '@/lib/vault-transaction';
import { toast } from 'sonner';

export interface UseVaultDepositResult {
  isDepositing: boolean;
  error: string | null;
  txHash: string | null;
  deposit: (vaultConfig: VaultConfig, amountAda: number, contributorAddress?: string) => Promise<string | null>;
  estimateFee: (vaultConfig: VaultConfig, amountAda: number, contributorAddress?: string) => Promise<number>;
  reset: () => void;
}

export function useVaultDeposit(): UseVaultDepositResult {
  const [isDepositing, setIsDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const activeWallet = useWalletStore((state) => state.activeWallet);
  const networkId = useWalletStore((state) => state.networkId);

  const inferNetworkFromAddress = (address: string): "Mainnet" | "Preview" | null => {
    const trimmed = address.trim().replace(/^"|"$/g, "");
    if (trimmed.startsWith("addr_test")) return "Preview";
    if (trimmed.startsWith("addr")) return "Mainnet";
    return null;
  };
  const deposit = useCallback(
    async (
      vaultConfig: VaultConfig,
      amountAda: number,
      contributorAddress?: string
    ): Promise<string | null> => {
      // Validate wallet connection
      if (!activeWallet) {
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

      // Validate network
      if (networkId === null) {
        const errorMsg = 'Unable to determine wallet network';
        setError(errorMsg);
        toast.error(errorMsg);
        return null;
      }

      // Validate amount
      if (amountAda <= 0) {
        const errorMsg = 'Deposit amount must be greater than 0';
        setError(errorMsg);
        toast.error(errorMsg);
        return null;
      }

      const minAda = vaultConfig.min_lovelace / 1_000_000;
      if (amountAda < minAda) {
        const errorMsg = `Minimum deposit is ${minAda} ADA`;
        setError(errorMsg);
        toast.error(errorMsg);
        return null;
      }

      setIsDepositing(true);
      setError(null);
      setTxHash(null);

      try {
        const network = networkId === 1 ? 'Mainnet' : 'Preview';

        const addressNetwork = inferNetworkFromAddress(vaultConfig.vault_address);
        if (addressNetwork && addressNetwork !== network) {
          throw new Error(
            `Vault address is on ${addressNetwork} but wallet is on ${network}. Please switch wallet network.`
          );
        }

        const blockfrostApiKey = process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY;
        if (!blockfrostApiKey) {
          throw new Error('Blockfrost API key not configured');
        }

        toast.loading('Building transaction...', { id: 'deposit-tx' });

        const lucid = await initializeLucid(network, blockfrostApiKey, activeWallet);

        const amountLovelace = adaToLovelace(amountAda); 
        const txHash = await depositToVaultContract(
          lucid,
          vaultConfig,
          amountLovelace,
          contributorAddress
        );

        if (txHash) {
          setTxHash(txHash);
          toast.success('Deposit transaction submitted successfully!', {
            id: 'deposit-tx',
            description: `TX: ${txHash.slice(0, 8)}...${txHash.slice(-8)}`,
          });
        }

        return txHash ?? null;
      } catch (err: any) {
        const errorMsg = err.message || 'Failed to deposit to vault';
        setError(errorMsg);
        toast.error('Deposit failed', {
          id: 'deposit-tx',
          description: errorMsg,
        });
        console.error('Deposit error:', err);
        return null;
      } finally {
        setIsDepositing(false);
      }
    },
    [activeWallet, networkId]
  );

  const estimateFee = useCallback(
    async (
      vaultConfig: VaultConfig,
      amountAda: number,
      contributorAddress?: string
    ): Promise<number> => {
      if (!activeWallet) {
        throw new Error('Please connect your wallet first');
      }

      if (networkId === null) {
        throw new Error('Unable to determine wallet network');
      }

      if (amountAda <= 0) {
        throw new Error('Deposit amount must be greater than 0');
      }

      const network = networkId === 1 ? 'Mainnet' : 'Preview';

      const addressNetwork = inferNetworkFromAddress(vaultConfig.vault_address);
      if (addressNetwork && addressNetwork !== network) {
        throw new Error(
          `Vault address is on ${addressNetwork} but wallet is on ${network}. Please switch wallet network.`
        );
      }

      const blockfrostApiKey = process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY;
      if (!blockfrostApiKey) {
        throw new Error('Blockfrost API key not configured');
      }

      const lucid = await initializeLucid(network, blockfrostApiKey, activeWallet);
      const amountLovelace = adaToLovelace(amountAda);

      return estimateDepositFee(
        lucid,
        vaultConfig,
        amountLovelace,
        contributorAddress
      );
    },
    [activeWallet, networkId]
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
