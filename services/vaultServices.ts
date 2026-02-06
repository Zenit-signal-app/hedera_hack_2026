import api from "@/axios/axiosInstance";
import { VaultsResponse, VaultStatus, VaultInfo, VaultValuesResponse, VaultValuesRequest, PositionsResponse, PositionsRequest, VaultStats, UserVaultEarningsResponse, UserVaultEarningsRequest, UserVaultTransactionsResponse, UserVaultTransactionsRequest, UserVaultEarningInfoResponse, VaultWithdrawRequest, VaultWithdrawResponse } from "@/types/vault";

export const vaultApi = {
  /**
   * Get list of vaults filtered by status
   * @param status - active, inactive, or all (default: active)
   * - active: returns vaults with state 'accepting_deposits', 'trading', or 'settled'
   * - inactive: returns vaults with state 'closed'
   * - all: returns all vaults
   */
  getVaultsByStatus: async (status: VaultStatus = 'active'): Promise<VaultsResponse> => {
    const response = await api.get<VaultsResponse>('/vaults', {
      params: { status }
    });
    return response.data;
  },

  /**
   * Get vault information by ID
   * @param id - Vault UUID
   */
  getVaultInfo: async (id: string): Promise<VaultInfo> => {
    const response = await api.get<VaultInfo>(`/vaults/${id}/info`);
    return response.data;
  },

  /**
   * Get vault values in TradingView format
   * @param id - Vault UUID
   * @param options - Query parameters for resolution, currency, timestamps, count_back
   */
  getVaultValues: async (id: string, options?: VaultValuesRequest): Promise<VaultValuesResponse> => {
    const response = await api.get<VaultValuesResponse>(`/vaults/${id}/values`, {
      params: {
        resolution: options?.resolution || '1d',
        currency: options?.currency || 'usd',
        ...(options?.start_time && { start_time: options.start_time }),
        ...(options?.end_time && { end_time: options.end_time }),
        count_back: options?.count_back || 20
      }
    });
    return response.data;
  },

  /**
   * Get vault positions (open and closed)
   * @param id - Vault UUID
   * @param options - Query parameters for filtering and pagination
   */
  getVaultPositions: async (id: string, options?: PositionsRequest): Promise<PositionsResponse> => {
    const response = await api.get<PositionsResponse>(`/vaults/${id}/positions`, {
      params: {
        ...(options?.status && { status: options.status }),
        page: options?.page || 1,
        limit: options?.limit || 20,
        ...(options?.offset && { offset: options.offset })
      }
    });
    return response.data;
  },

  /**
   * Get vault statistics
   * @param id - Vault UUID
   */
  getVaultStats: async (id: string): Promise<VaultStats> => {
    const response = await api.get<VaultStats>(`/vaults/${id}/stats`);
    return response.data;
  },

  /**
   * Get user vault earnings
   * @param options - wallet_address (required), limit, offset
   */
  getUserVaultEarnings: async (options: UserVaultEarningsRequest): Promise<UserVaultEarningsResponse> => {
    const response = await api.get<UserVaultEarningsResponse>('/user/vaults/earnings', {
      params: {
        wallet_address: options.wallet_address,
        limit: options.limit || 20,
        offset: options.offset || 0
      }
    });
    return response.data;
  },

  /**
   * Get user's earning info for a specific vault
   * @param id - Vault UUID
   * @param walletAddress - Wallet address of the user
   */
  getUserVaultEarningInfo: async (id: string, walletAddress: string): Promise<UserVaultEarningInfoResponse> => {
    const response = await api.get<UserVaultEarningInfoResponse>(`/vaults/${id}/contribute`, {
      params: {
        wallet_address: walletAddress
      }
    });
    return response.data;
  },

  /**
   * Get user vault transactions
   * @param options - wallet_address (required), vault_id (optional), page, limit
   */
  getUserVaultTransactions: async (options: UserVaultTransactionsRequest): Promise<UserVaultTransactionsResponse> => {
    const response = await api.get<UserVaultTransactionsResponse>('/user/vaults/transactions', {
      params: {
        wallet_address: options.wallet_address,
        ...(options.vault_id && { vault_id: options.vault_id }),
        page: options.page || 1,
        limit: options.limit || 20
      }
    });
    return response.data;
  },

  /**
   * Deposit to vault
   * @param data - vault_id, pool_id, amount_ada, amount_lovelace, contributor_address
   */
  depositToVault: async (data: {
    vault_id: string;
    pool_id: string;
    amount_ada: number;
    amount_lovelace: number;
    contributor_address: string;
  }): Promise<{ tx_id: string }> => {
    const response = await api.post<{ tx_id: string }>('/vault/deposit', data);
    return response.data;
  },

  /**
   * Withdraw from vault
   * @param data - vault_id, wallet_address, amount_ada (optional - defaults to all withdrawable)
   * @returns status, tx_id, and reason if failed
   */
  withdrawFromVault: async (data: VaultWithdrawRequest): Promise<VaultWithdrawResponse> => {
    const response = await api.post<VaultWithdrawResponse>('/vaults/withdraw', data);
    return response.data;
  }
};
