import api from "@/axios/axiosInstance";
import {
	VaultsResponse,
	VaultStatus,
	VaultInfo,
	VaultValuesResponse,
	VaultValuesRequest,
	PositionsResponse,
	PositionsRequest,
	VaultStats,
	UserVaultEarningsResponse,
	UserVaultEarningsRequest,
	UserVaultTransactionsResponse,
	UserVaultTransactionsRequest,
	UserVaultEarningInfoResponse,
	VaultWithdrawRequest,
	VaultWithdrawResponse,
} from "@/types/vault";

type ChainIdParam = number | string;

export const vaultApi = {
	/**
	 * Get list of vaults filtered by status
	 */
	getVaultsByStatus: async (
		status: VaultStatus = "active",
		chain_id?: ChainIdParam,
	): Promise<VaultsResponse> => {
		const response = await api.get<VaultsResponse>("/vaults", {
			params: { status, ...(chain_id != null && { chain_id }) },
		});
		return response.data;
	},

	/**
	 * Get vault information by ID
	 */
	getVaultInfo: async (
		id: string,
		chain_id?: ChainIdParam,
	): Promise<VaultInfo> => {
		const response = await api.get<VaultInfo>(`/vaults/${id}/info`, {
			params: { ...(chain_id != null && { chain_id }) },
		});
		return response.data;
	},

	/**
	 * Get vault values in TradingView format
	 */
	getVaultValues: async (
		id: string,
		options?: VaultValuesRequest,
		chain_id?: ChainIdParam,
	): Promise<VaultValuesResponse> => {
		const response = await api.get<VaultValuesResponse>(
			`/vaults/${id}/values`,
			{
				params: {
					resolution: options?.resolution || "1d",
					currency: options?.currency || "usd",
					...(options?.start_time && {
						start_time: options.start_time,
					}),
					...(options?.end_time && { end_time: options.end_time }),
					count_back: options?.count_back || 20,
					...(chain_id != null && { chain_id }),
				},
			},
		);
		return response.data;
	},

	/**
	 * Get vault positions (open and closed)
	 */
	getVaultPositions: async (
		id: string,
		options?: PositionsRequest,
		chain_id?: ChainIdParam,
	): Promise<PositionsResponse> => {
		const response = await api.get<PositionsResponse>(
			`/vaults/${id}/positions`,
			{
				params: {
					...(options?.status && { status: options.status }),
					page: options?.page || 1,
					limit: options?.limit || 20,
					...(options?.offset && { offset: options.offset }),
					...(chain_id != null && { chain_id }),
				},
			},
		);
		return response.data;
	},

	/**
	 * Get vault statistics
	 */
	getVaultStats: async (
		id: string,
		chain_id?: ChainIdParam,
	): Promise<VaultStats> => {
		const response = await api.get<VaultStats>(`/vaults/${id}/stats`, {
			params: { ...(chain_id != null && { chain_id }) },
		});
		return response.data;
	},

	/**
	 * Get user vault earnings
	 */
	getUserVaultEarnings: async (
		options: UserVaultEarningsRequest,
		chain_id?: ChainIdParam,
	): Promise<UserVaultEarningsResponse> => {
		const response = await api.get<UserVaultEarningsResponse>(
			"/vaults/earnings",
			{
				params: {
					wallet_address: options.wallet_address,
					limit: options.limit || 20,
					offset: options.offset || 0,
					...(chain_id != null && { chain_id }),
				},
			},
		);
		return response.data;
	},

	/**
	 * Get user's earning info for a specific vault
	 */
	getUserVaultEarningInfo: async (
		id: string,
		walletAddress: string,
		chain_id?: ChainIdParam,
	): Promise<UserVaultEarningInfoResponse> => {
		const response = await api.get<UserVaultEarningInfoResponse>(
			`/vaults/${id}/contribute`,
			{
				params: {
					wallet_address: walletAddress,
					...(chain_id != null && { chain_id }),
				},
			},
		);
		return response.data;
	},

	/**
	 * Get user vault transactions
	 */
	getUserVaultTransactions: async (
		options: UserVaultTransactionsRequest,
		chain_id?: ChainIdParam,
	): Promise<UserVaultTransactionsResponse> => {
		const response = await api.get<UserVaultTransactionsResponse>(
			"/vaults/transactions",
			{
				params: {
					wallet_address: options.wallet_address,
					...(options.vault_id && { vault_id: options.vault_id }),
					page: options.page || 1,
					limit: options.limit || 20,
					...(chain_id != null && { chain_id }),
				},
			},
		);
		return response.data;
	},

	/**
	 * Deposit to vault
	 */
	depositToVault: async (data: {
		vault_id: string;
		pool_id: string;
		amount: number;
		amount_smallest_unit: number;
		contributor_address: string;
		chain_id?: ChainIdParam;
	}): Promise<{ tx_id: string }> => {
		const response = await api.post<{ tx_id: string }>(
			"/vault/deposit",
			data,
		);
		return response.data;
	},

	/**
	 * Withdraw from vault
	 */
	withdrawFromVault: async (
		data: VaultWithdrawRequest,
	): Promise<VaultWithdrawResponse> => {
		const response = await api.post<VaultWithdrawResponse>(
			"/vaults/withdraw",
			data,
		);
		return response.data;
	},
};
