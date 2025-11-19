export interface Token {
  token_address: string;
  token_name: string;
  token_ticker: string;
  price_sol: number;
  market_cap_sol: number;
  volume_sol: number;
  liquidity_sol: number;
  transaction_count: number;
  price_1hr_change: number;
  price_24hr_change?: number;
  price_7d_change?: number;
  protocol: string;
  source: string;
  last_updated: number;
}

export interface AggregatedToken extends Token {
  sources: string[];
  data_quality_score: number;
}

export interface TokenQueryParams {
  limit?: number;
  cursor?: string;
  sortBy?: 'volume' | 'priceChange' | 'marketCap' | 'liquidity';
  period?: '1h' | '24h' | '7d';
  minVolume?: number;
  minLiquidity?: number;
}

export interface PaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: PaginationMeta;
  meta?: {
    cached: boolean;
    sources: string[];
    timestamp: number;
  };
  error?: string;
}
