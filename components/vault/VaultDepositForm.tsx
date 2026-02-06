/**
 * Example Vault Deposit Component
 * Demonstrates how to use the useVaultDeposit hook
 */

'use client';

import { useState, useEffect } from 'react';
import { useVaultDeposit } from '@/hooks/useVaultDeposit';
import { vaultApi } from '@/services/vaultServices';
import { VaultConfig } from '@/lib/vault-transaction';
import { useWalletStore } from '@/store/walletStore';
import { useWalletConnect } from '@/hooks/useWalletConnect';

interface VaultDepositFormProps {
  vaultId: string;
}

export function VaultDepositForm({ vaultId }: VaultDepositFormProps) {
  const [amount, setAmount] = useState('');
  const [vaultConfig, setVaultConfig] = useState<VaultConfig | null>(null);
  const [isLoadingVault, setIsLoadingVault] = useState(true);

  const { deposit, isDepositing, error, txHash, reset } = useVaultDeposit();
  const { connect, disconnect, isLoading: isConnectingWallet } = useWalletConnect();
  const activeWallet = useWalletStore((state) => state.activeWallet);
  const usedAddress = useWalletStore((state) => state.usedAddress);

  // Load vault configuration
  useEffect(() => {
    const loadVaultConfig = async () => {
      try {
        setIsLoadingVault(true);
        const vaultInfo = await vaultApi.getVaultInfo(vaultId);

        setVaultConfig({
          vault_address: vaultInfo.address,
          pool_id: vaultInfo.pool_id,
          min_lovelace: 2_000_000, // 2 ADA minimum
        });
      } catch (err) {
        console.error('Failed to load vault config:', err);
      } finally {
        setIsLoadingVault(false);
      }
    };

    loadVaultConfig();
  }, [vaultId]);

  const handleDeposit = async () => {
    if (!vaultConfig) {
      alert('Vault configuration not loaded');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    // Perform deposit
    const resultTxHash = await deposit(vaultConfig, amountNum);

    if (resultTxHash) {
      // Success - reset form
      setAmount('');
    }
  };

  const handleConnectWallet = async (walletId: string) => {
    await connect(walletId);
  };

  const minAda = vaultConfig ? vaultConfig.min_lovelace / 1_000_000 : 2;

  return (
    <div className="vault-deposit-form p-6 border rounded-lg max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Deposit to Vault</h2>

      {/* Wallet Connection */}
      {!activeWallet ? (
        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-3">
            Please connect your wallet to deposit
          </p>
          <div className="space-y-2">
            <button
              onClick={() => handleConnectWallet('nami')}
              disabled={isConnectingWallet}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              Connect Nami
            </button>
            <button
              onClick={() => handleConnectWallet('eternl')}
              disabled={isConnectingWallet}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              Connect Eternl
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded">
          <p className="text-sm text-green-800">
            ✓ Wallet Connected
          </p>
          {usedAddress && (
            <p className="text-xs text-gray-600 mt-1 truncate">
              {usedAddress.slice(0, 20)}...{usedAddress.slice(-10)}
            </p>
          )}
          <button
            onClick={disconnect}
            className="text-xs text-red-600 hover:underline mt-2"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoadingVault && (
        <div className="text-center py-4">
          <p className="text-gray-600">Loading vault information...</p>
        </div>
      )}

      {/* Deposit Form */}
      {!isLoadingVault && vaultConfig && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Amount (ADA)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Min: ${minAda} ADA`}
              min={minAda}
              step={0.1}
              disabled={isDepositing || !activeWallet}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">
              Minimum deposit: {minAda} ADA
            </p>
          </div>

          <button
            onClick={handleDeposit}
            disabled={isDepositing || !activeWallet || !amount}
            className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDepositing ? 'Processing...' : 'Deposit'}
          </button>

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-800">❌ {error}</p>
              <button
                onClick={reset}
                className="text-xs text-red-600 hover:underline mt-2"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Success Display */}
          {txHash && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-sm text-green-800 font-medium mb-1">
                ✓ Deposit Successful!
              </p>
              <p className="text-xs text-gray-600 break-all">
                Transaction: {txHash}
              </p>
              <a
                href={`https://cardanoscan.io/transaction/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline mt-2 inline-block"
              >
                View on Explorer →
              </a>
            </div>
          )}
        </>
      )}

      {/* Vault Info */}
      {vaultConfig && (
        <div className="mt-6 pt-4 border-t">
          <h3 className="text-sm font-medium mb-2">Vault Information</h3>
          <div className="text-xs text-gray-600 space-y-1">
            <p className="truncate">
              <span className="font-medium">Address:</span>{' '}
              {vaultConfig.vault_address.slice(0, 20)}...
            </p>
            <p className="truncate">
              <span className="font-medium">Pool ID:</span>{' '}
              {vaultConfig.pool_id.slice(0, 16)}...
            </p>
            <p>
              <span className="font-medium">Min Deposit:</span>{' '}
              {vaultConfig.min_lovelace / 1_000_000} ADA
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
