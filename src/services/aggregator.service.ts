import { Token, AggregatedToken } from '../types/token.types';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../config/constants';

export class AggregatorService {
  private static instance: AggregatorService;

  private constructor() {}

  public static getInstance(): AggregatorService {
    if (!AggregatorService.instance) {
      AggregatorService.instance = new AggregatorService();
    }
    return AggregatorService.instance;
  }

  /**
   * Merge tokens from multiple sources, deduplicating by address
   */
  public mergeTokens(tokenArrays: Token[][]): AggregatedToken[] {
    const tokenMap = new Map<string, AggregatedToken>();

    // Flatten all token arrays
    const allTokens = tokenArrays.flat();

    logger.debug('Merging tokens', { 
      totalTokens: allTokens.length,
      sources: tokenArrays.length 
    });

    for (const token of allTokens) {
      const address = token.token_address.toLowerCase();
      
      if (!tokenMap.has(address)) {
        // First occurrence of this token
        tokenMap.set(address, {
          ...token,
          sources: [token.source],
          data_quality_score: this.calculateQualityScore(token),
        });
      } else {
        // Token exists, merge data
        const existing = tokenMap.get(address)!;
        const merged = this.mergeDuplicateTokens(existing, token);
        tokenMap.set(address, merged);
      }
    }

    const result = Array.from(tokenMap.values());
    logger.info('Tokens merged', { 
      uniqueTokens: result.length,
      originalCount: allTokens.length 
    });

    return result;
  }

  /**
   * Merge two tokens with same address from different sources
   */
  private mergeDuplicateTokens(existing: AggregatedToken, newToken: Token): AggregatedToken {
    const sourcePriority = CONSTANTS.SOURCE_PRIORITY;
    const existingPriority = sourcePriority[existing.source as keyof typeof sourcePriority] || 0;
    const newPriority = sourcePriority[newToken.source as keyof typeof sourcePriority] || 0;

    // Use data from higher priority source for core fields
    const primaryToken = newPriority > existingPriority ? newToken : existing;

    // Aggregate metrics (sum volumes, average prices)
    const volumeCount = existing.sources.length + 1;
    
    return {
      ...primaryToken,
      token_address: existing.token_address, // Keep consistent casing
      
      // Average price across sources
      price_sol: (existing.price_sol * existing.sources.length + newToken.price_sol) / volumeCount,
      
      // Sum volumes
      volume_sol: existing.volume_sol + newToken.volume_sol,
      
      // Sum liquidity
      liquidity_sol: existing.liquidity_sol + newToken.liquidity_sol,
      
      // Sum transactions
      transaction_count: existing.transaction_count + newToken.transaction_count,
      
      // Average price changes
      price_1hr_change: (existing.price_1hr_change * existing.sources.length + newToken.price_1hr_change) / volumeCount,
      price_24hr_change: existing.price_24hr_change && newToken.price_24hr_change
        ? (existing.price_24hr_change * existing.sources.length + newToken.price_24hr_change) / volumeCount
        : existing.price_24hr_change || newToken.price_24hr_change,
      
      // Combine sources
      sources: [...existing.sources, newToken.source],
      
      // Recalculate quality score
      data_quality_score: this.calculateQualityScore({
        ...primaryToken,
        volume_sol: existing.volume_sol + newToken.volume_sol,
      }),
      
      // Use latest timestamp
      last_updated: Math.max(existing.last_updated, newToken.last_updated),
    };
  }

  /**
   * Calculate data quality score (0-100)
   */
  private calculateQualityScore(token: Token): number {
    let score = 0;

    // Has price
    if (token.price_sol > 0) score += 20;
    
    // Has volume
    if (token.volume_sol > 0) score += 20;
    
    // Has liquidity
    if (token.liquidity_sol > 0) score += 20;
    
    // Has market cap
    if (token.market_cap_sol > 0) score += 15;
    
    // Has transaction count
    if (token.transaction_count > 0) score += 15;
    
    // Has price change data
    if (token.price_1hr_change !== undefined) score += 10;

    return Math.min(score, 100);
  }

  /**
   * Sort tokens by specified metric
   */
  public sortTokens(
    tokens: AggregatedToken[], 
    sortBy: 'volume' | 'priceChange' | 'marketCap' | 'liquidity' = 'volume',
    period: '1h' | '24h' | '7d' = '24h'
  ): AggregatedToken[] {
    logger.debug('Sorting tokens', { sortBy, period, count: tokens.length });

    return tokens.sort((a, b) => {
      switch (sortBy) {
        case 'volume':
          return b.volume_sol - a.volume_sol;

        case 'priceChange': {
          const getChange = (t: AggregatedToken) => {
            if (period === '1h') return t.price_1hr_change ?? 0;
            if (period === '24h') return t.price_24hr_change ?? 0;
            // 7d fallback if available, else 0
            return (t as any).price_7d_change ?? 0;
          };
          const aChange = getChange(a);
          const bChange = getChange(b);
          return bChange - aChange;
        }

        case 'marketCap':
          return b.market_cap_sol - a.market_cap_sol;

        case 'liquidity':
          return b.liquidity_sol - a.liquidity_sol;

        default:
          return 0;
      }
    });
  }

  /**
   * Filter tokens by criteria
   */
  public filterTokens(
    tokens: AggregatedToken[],
    filters: {
      minVolume?: number;
      minLiquidity?: number;
      minQualityScore?: number;
    }
  ): AggregatedToken[] {
    logger.debug('Filtering tokens', { filters, count: tokens.length });

    let filtered = tokens;

    if (filters.minVolume !== undefined) {
      filtered = filtered.filter(t => t.volume_sol >= filters.minVolume!);
    }

    if (filters.minLiquidity !== undefined) {
      filtered = filtered.filter(t => t.liquidity_sol >= filters.minLiquidity!);
    }

    if (filters.minQualityScore !== undefined) {
      filtered = filtered.filter(t => t.data_quality_score >= filters.minQualityScore!);
    }

    logger.info('Tokens filtered', { 
      original: tokens.length, 
      filtered: filtered.length 
    });

    return filtered;
  }

  /**
   * Detect significant changes for WebSocket broadcasting
   */
  public detectSignificantChanges(
    oldTokens: AggregatedToken[],
    newTokens: AggregatedToken[],
    priceThreshold: number = 5,
    volumeThreshold: number = 50
  ): {
    priceChanges: AggregatedToken[];
    volumeSpikes: AggregatedToken[];
  } {
    const priceChanges: AggregatedToken[] = [];
    const volumeSpikes: AggregatedToken[] = [];

    const oldTokenMap = new Map(
      oldTokens.map(t => [t.token_address.toLowerCase(), t])
    );

    for (const newToken of newTokens) {
      const oldToken = oldTokenMap.get(newToken.token_address.toLowerCase());
      
      if (!oldToken) continue;

      // Check price change
      const priceChangePct = Math.abs(
        ((newToken.price_sol - oldToken.price_sol) / oldToken.price_sol) * 100
      );
      
      if (priceChangePct >= priceThreshold) {
        priceChanges.push(newToken);
      }

      // Check volume spike
      const volumeChangePct = oldToken.volume_sol > 0
        ? ((newToken.volume_sol - oldToken.volume_sol) / oldToken.volume_sol) * 100
        : 0;
      
      if (volumeChangePct >= volumeThreshold) {
        volumeSpikes.push(newToken);
      }
    }

    logger.info('Significant changes detected', {
      priceChanges: priceChanges.length,
      volumeSpikes: volumeSpikes.length,
    });

    return { priceChanges, volumeSpikes };
  }
}
