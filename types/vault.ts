export type VaultState =
	| "open"
	| "withdrawable"
	| "trading"
	| "settled"
	| "closed";

export type VaultStatus = "active" | "inactive" | "all";

export interface Vault {
	id: string;
	state: VaultState;
	icon_url?: string;
	vault_name: string;
	summary?: string;
	annual_return: number;
	tvl_usd: number;
	max_drawdown?: number;
	start_time: string;
}

export interface VaultInfo {
	id: string;
	state: VaultState;
	icon_url?: string;
	vault_name: string;
	vault_type: string;
	vault_type_logo: string;
	blockchain: string;
	blockchain_logo: string;
	address: string;
	pool_id: string;
	summary?: string;
	description: string;
	annual_return: number;
	tvl_usd: number;
	max_drawdown: number;
	start_time: string;
	trade_per_month: number;
	decision_cycle: string;
}

export interface VaultsResponse {
	page: number;
	limit: number;
	offset: number;
	vaults: Vault[];
}

export type VaultResolution = "1d" | "1w" | "1m";
export type VaultCurrency = "usd" | "ada";

export interface VaultValuesRequest {
	resolution?: VaultResolution;
	currency?: VaultCurrency;
	start_time?: number;
	end_time?: number;
	count_back?: number;
}

export interface VaultValuesResponse {
	s: "ok" | "no_data";
	t: number[]; // timestamps
	c: number[]; // closing prices
	o?: number[]; // opening prices
	h?: number[]; // high prices
	l?: number[]; // low prices
	v?: number[]; // volume
}

export type PositionStatus = "open" | "closed";

export interface Position {
	pair: string;
	spend: number;
	value: number;
	profit: number; // profit percentage
	open_time: string;
	status: PositionStatus;
	close_time: string;
}

export interface PositionsResponse {
	total: number;
	page: number;
	limit: number;
	positions: Position[];
}

export interface PositionsRequest {
	status?: PositionStatus;
	page?: number;
	limit?: number;
	offset?: number;
}

export interface VaultStats {
	state: VaultState;
	tvl_usd: number;
	max_drawdown: number;
	trade_start_time: string;
	trade_end_time: string;
	start_value: number;
	current_value: number;
	return_percent: number;
	update_time: string;
	total_trades: number;
	winning_trades: number;
	losing_trades: number;
	win_rate: number;
	avg_profit_per_winning_trade_pct: number;
	avg_loss_per_losing_trade_pct: number;
	total_fees_paid: number;
	trade_per_month: number;
	decision_cycle: string;
	start_time: string;
}

export interface VaultEarning {
	vault_id: string;
	vault_name: string;
	vault_address: string;
	total_deposit: number;
	current_value: number;
	roi: number;
}

export interface UserVaultEarningInfoResponse {
	total_deposit: number;
	is_redeemed: boolean;
	profit_rate: number;
	min_deposit?: number;
	min_withdraw?: number;
}

export interface UserVaultEarningsRequest {
	wallet_address: string;
	limit?: number;
	offset?: number;
}

export interface UserVaultEarningsResponse {
	earnings: VaultEarning[];
	total: number;
	page: number;
	limit: number;
}

export type VaultTransactionType =
	| "deposit"
	| "withdrawal"
	| "claim"
	| "reinvest";

export interface VaultTransaction {
	id: string;
	vault_id: string;
	vault_name: string;
	wallet_address: string;
	action: VaultTransactionType;
	amount: number;
	token_id: string;
	token_symbol: string;
	txn: string;
	timestamp: number;
	status: "completed" | "pending" | "failed";
	fee: number;
}

export interface UserVaultTransactionsRequest {
	wallet_address: string;
	vault_id?: string;
	page?: number;
	limit?: number;
}

export interface UserVaultTransactionsResponse {
	transactions: VaultTransaction[];
	total: number;
	page: number;
	limit: number;
}

export interface VaultWithdrawRequest {
	vault_id: string;
	wallet_address: string;
	amount_ada?: number;
}

export interface VaultWithdrawResponse {
	status: "ok" | "invalid";
	tx_id: string | null;
	reason?: string;
}
