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

/**
 * Hook for depositing to vault via smart contract
 * Requires wallet to be connected
 */
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

  /**
   * Deposit to vault
   * @param vaultConfig - Vault configuration (address, pool_id, min_lovelace)
   * @param amountAda - Amount to deposit in ADA
   * @param contributorAddress - Optional contributor address
   * @returns Transaction hash or null if failed
   */
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

      // Validate contributor address is provided or wallet is connected
      if (!contributorAddress) {
        const errorMsg = 'Contributor wallet address is required for deposit';
        setError(errorMsg);
        toast.error(errorMsg);
        console.error('Missing contributorAddress:', { contributorAddress, activeWallet: Boolean(activeWallet) });
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

      // Check minimum deposit (convert lovelace to ADA for comparison)
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
        // Determine network (0 = testnet, 1 = mainnet)
        const network = networkId === 1 ? 'Mainnet' : 'Preview';

        const addressNetwork = inferNetworkFromAddress(vaultConfig.vault_address);
        if (addressNetwork && addressNetwork !== network) {
          throw new Error(
            `Vault address is on ${addressNetwork} but wallet is on ${network}. Please switch wallet network.`
          );
        }

        // Get Blockfrost API key from environment
        const blockfrostApiKey = process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY;
        if (!blockfrostApiKey) {
          throw new Error('Blockfrost API key not configured');
        }

        toast.loading('Building transaction...', { id: 'deposit-tx' });

        // Initialize Lucid with wallet
        const lucid = await initializeLucid(network, blockfrostApiKey, activeWallet);

        // Convert ADA to lovelace
        const amountLovelace = adaToLovelace(amountAda);

        // Build, sign, and submit transaction directly to smart contract
        const txHash = await depositToVaultContract(
          lucid,
          vaultConfig,
          amountLovelace,
          contributorAddress
        );

        setTxHash(txHash);
        toast.success('Deposit transaction submitted successfully!', {
          id: 'deposit-tx',
          description: `TX: ${txHash.slice(0, 8)}...${txHash.slice(-8)}`,
        });

        return txHash;
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

  /**
   * Reset state
   */
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
