import { BaseApiClient } from './base.client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { JupiterToken } from '../types/api.types';
import { Token } from '../types/token.types';

interface JupiterSearchResponse {
  data: JupiterToken[];
}

export class JupiterClient extends BaseApiClient {
  private static instance: JupiterClient;

  private constructor() {
    super(
      config.apis.jupiter,
      'jupiter',
      config.rateLimit.jupiter
    );
  }

  public static getInstance(): JupiterClient {
    if (!JupiterClient.instance) {
      JupiterClient.instance = new JupiterClient();
    }
    return JupiterClient.instance;
  }

  public getName(): string {
    return 'Jupiter';
  }

  public async searchTokens(query: string): Promise<Token[]> {
    try {
      logger.info('Fetching tokens from Jupiter', { query });
      
      const response = await this.get<JupiterSearchResponse>(
        `/tokens/v2/search?query=${encodeURIComponent(query)}`
      );

      if (!response.data || response.data.length === 0) {
        return [];
      }

      return response.data.map(token => this.transformJupiterToken(token));
    } catch (error) {
      logger.error('Jupiter search error', { error, query });
      return [];
    }
  }

  private transformJupiterToken(jupToken: JupiterToken): Token {
    // Jupiter doesn't provide price/volume data directly
    // This is a placeholder - in production, you'd need to enrich this
    return {
      token_address: jupToken.address,
      token_name: jupToken.name,
      token_ticker: jupToken.symbol,
      price_sol: 0, // Not available from Jupiter search
      market_cap_sol: 0,
      volume_sol: jupToken.daily_volume || 0,
      liquidity_sol: 0,
      transaction_count: 0,
      price_1hr_change: 0,
      protocol: 'Jupiter',
      source: 'jupiter',
      last_updated: Date.now(),
    };
  }
}
