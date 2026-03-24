export interface Transaction {
    transaction_id: string;
    from_token: string;
    from_amount: number;
    to_token: string;
    to_amount: number;
    price: number;
    timestamp: number;
    status: 'completed' | 'failed' | 'pending';
}

export interface ApiResponse {
    transactions: Transaction[];
    total: number;  
    totalPages: number; 
}

export interface PaginationParams {
    page: number;
    limit: number;
    pair?: string;
}

export interface TopTrader {
  rank: number;
  user_id: string;
  total_volume: number;
  total_trades: number;
}
