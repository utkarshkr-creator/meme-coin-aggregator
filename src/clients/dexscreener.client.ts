import { BaseApiClient } from './base.client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { DexScreenerResponse, DexScreenerPair } from '../types/api.types';
import { Token } from '../types/token.types';

export class DexScreenerClient extends BaseApiClient {
  private static instance: DexScreenerClient;

  private constructor() {
    super(
      config.apis.dexScreener,
      'dexscreener',
      config.rateLimit.dexScreener
    );
  }

  public static getInstance(): DexScreenerClient {
    if (!DexScreenerClient.instance) {
      DexScreenerClient.instance = new DexScreenerClient();
    }
    return DexScreenerClient.instance;
  }

  public getName(): string {
    return 'DexScreener';
  }

  public async searchTokens(query: string): Promise<Token[]> {
    try {
      logger.info('Fetching tokens from DexScreener', { query });
      
      const response = await this.get<DexScreenerResponse>(
        `/search?q=${encodeURIComponent(query)}`
      );

      if (!response.pairs || response.pairs.length === 0) {
        return [];
      }

      return response.pairs
        .filter(pair => pair.chainId === 'solana') // Focus on Solana
        .map(pair => this.transformPairToToken(pair));
    } catch (error) {
      logger.error('DexScreener search error', { error, query });
      return [];
    }
  }

  public async getTokenByAddress(address: string): Promise<Token | null> {
    try {
      logger.info('Fetching token from DexScreener', { address });
      
      const response = await this.get<DexScreenerResponse>(
        `/tokens/${address}`
      );

      if (!response.pairs || response.pairs.length === 0) {
        return null;
      }

      // Get the most liquid pair
      const bestPair = response.pairs
        .filter(pair => pair.chainId === 'solana')
        .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

      return bestPair ? this.transformPairToToken(bestPair) : null;
    } catch (error) {
      logger.error('DexScreener token fetch error', { error, address });
      return null;
    }
  }

  public async getTrendingTokens(): Promise<Token[]> {
    try {
      // DexScreener doesn't have a direct trending endpoint, 
      // so we'll search for popular terms
      const searches = ['sol', 'bonk', 'wif'];
      const allTokens: Token[] = [];

      for (const term of searches) {
        const tokens = await this.searchTokens(term);
        allTokens.push(...tokens);
      }

      // Deduplicate and sort by volume
      const uniqueTokens = Array.from(
        new Map(allTokens.map(t => [t.token_address, t])).values()
      );

      return uniqueTokens
        .sort((a, b) => b.volume_sol - a.volume_sol)
        .slice(0, 50);
    } catch (error) {
      logger.error('DexScreener trending fetch error', { error });
      return [];
    }
  }

  private transformPairToToken(pair: DexScreenerPair): Token {
    const priceNative = parseFloat(pair.priceNative);
    const volume24h = pair.volume?.h24 || 0;
    const liquidityUsd = pair.liquidity?.usd || 0;

    // Estimate SOL values (1 SOL ≈ $100 for rough conversion)
    const solPrice = 100;
    const volumeSol = volume24h / solPrice;
    const liquiditySol = liquidityUsd / solPrice;
    const marketCapSol = (pair.marketCap || pair.fdv || 0) / solPrice;

    return {
      token_address: pair.baseToken.address,
      token_name: pair.baseToken.name,
      token_ticker: pair.baseToken.symbol,
      price_sol: priceNative,
      market_cap_sol: marketCapSol,
      volume_sol: volumeSol,
      liquidity_sol: liquiditySol,
      transaction_count: (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0),
      price_1hr_change: pair.priceChange?.h1 || 0,
      price_24hr_change: pair.priceChange?.h24 || 0,
      protocol: pair.dexId,
      source: 'dexscreener',
      last_updated: Date.now(),
    };
  }
}
