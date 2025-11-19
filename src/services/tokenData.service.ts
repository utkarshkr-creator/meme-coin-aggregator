import { Token, AggregatedToken, TokenQueryParams, ApiResponse, PaginationMeta } from '../types/token.types';
import { CacheService } from './cache.service';
import { AggregatorService } from './aggregator.service';
import { DexScreenerClient } from '../clients/dexscreener.client';
import { JupiterClient } from '../clients/jupiter.client';
import { logger } from '../utils/logger';
import { config } from '../config';
import { CONSTANTS } from '../config/constants';
import { validateLimit, encodeCursor, decodeCursor } from '../utils/pagination.util';

export class TokenDataService {
  private static instance: TokenDataService;
  private cacheService: CacheService;
  private aggregatorService: AggregatorService;
  private dexScreenerClient: DexScreenerClient;
  private jupiterClient: JupiterClient;

  private constructor() {
    this.cacheService = CacheService.getInstance();
    this.aggregatorService = AggregatorService.getInstance();
    this.dexScreenerClient = DexScreenerClient.getInstance();
    this.jupiterClient = JupiterClient.getInstance();
  }

  public static getInstance(): TokenDataService {
    if (!TokenDataService.instance) {
      TokenDataService.instance = new TokenDataService();
    }
    return TokenDataService.instance;
  }

  /**
   * Get tokens with filtering, sorting, and pagination
   */
  public async getTokens(params: TokenQueryParams): Promise<ApiResponse<AggregatedToken[]>> {
    const startTime = Date.now();
    const limit = validateLimit(params.limit);
    const sortBy = params.sortBy || 'volume';
    const period = params.period || '24h';

    // Generate cache key based on params
    const cacheKey = this.generateCacheKey(params);
    
    logger.info('Fetching tokens', { params, cacheKey });

    // Try cache first
    const cached = await this.cacheService.get<ApiResponse<AggregatedToken[]>>(cacheKey);
    if (cached) {
      logger.info('Cache hit', { cacheKey, duration: Date.now() - startTime });
      return {
        ...cached,
        meta: {
          ...cached.meta!,
          cached: true,
        },
      };
    }

    // Fetch from sources
    const tokens = await this.fetchAndAggregateTokens();

    // Apply filters
    const filtered = this.aggregatorService.filterTokens(tokens, {
      minVolume: params.minVolume,
      minLiquidity: params.minLiquidity,
      minQualityScore: 50, // Only return decent quality data
    });

    // Sort
    const sorted = this.aggregatorService.sortTokens(filtered, sortBy, period);

    // Paginate
    const { data, pagination } = this.paginateResults(sorted, params.cursor, limit);

    const response: ApiResponse<AggregatedToken[]> = {
      success: true,
      data,
      pagination,
      meta: {
        cached: false,
        sources: ['dexscreener', 'jupiter'],
        timestamp: Date.now(),
      },
    };

    // Cache the result
    await this.cacheService.set(cacheKey, response, config.cache.ttl.tokenList);

    logger.info('Tokens fetched', { 
      count: data.length,
      total: sorted.length,
      duration: Date.now() - startTime 
    });

    return response;
  }

  /**
   * Get single token by address
   */
  public async getTokenByAddress(address: string): Promise<AggregatedToken | null> {
    const cacheKey = `${CONSTANTS.CACHE_KEYS.TOKEN_DETAIL}:${address.toLowerCase()}`;
    
    // Try cache
    const cached = await this.cacheService.get<AggregatedToken>(cacheKey);
    if (cached) {
      logger.info('Token cache hit', { address });
      return cached;
    }

    // Fetch from multiple sources in parallel
    const [dexToken, jupToken] = await Promise.allSettled([
      this.dexScreenerClient.getTokenByAddress(address),
      // Jupiter doesn't have a direct address lookup, skip for now
      Promise.resolve(null),
    ]);

    const tokens: Token[] = [];
    
    if (dexToken.status === 'fulfilled' && dexToken.value) {
      tokens.push(dexToken.value);
    }

    if (jupToken.status === 'fulfilled' && jupToken.value) {
      tokens.push(jupToken.value);
    }

    if (tokens.length === 0) {
      return null;
    }

    // Merge if multiple sources
    const aggregated = this.aggregatorService.mergeTokens([tokens])[0];

    // Cache
    await this.cacheService.set(cacheKey, aggregated, config.cache.ttl.tokenDetail);

    return aggregated;
  }

  /**
   * Search tokens by query
   */
  public async searchTokens(query: string): Promise<AggregatedToken[]> {
    const cacheKey = `tokens:search:${query.toLowerCase()}`;
    
    // Try cache
    const cached = await this.cacheService.get<AggregatedToken[]>(cacheKey);
    if (cached) {
      logger.info('Search cache hit', { query });
      return cached;
    }

    // Search in parallel
    const [dexResults, jupResults] = await Promise.allSettled([
      this.dexScreenerClient.searchTokens(query),
      this.jupiterClient.searchTokens(query),
    ]);

    const tokenArrays: Token[][] = [];
    
    if (dexResults.status === 'fulfilled') {
      tokenArrays.push(dexResults.value);
    }
    
    if (jupResults.status === 'fulfilled') {
      tokenArrays.push(jupResults.value);
    }

    const aggregated = this.aggregatorService.mergeTokens(tokenArrays);

    // Cache for shorter time (search results change frequently)
    await this.cacheService.set(cacheKey, aggregated, 15); // 15 seconds

    return aggregated;
  }

  /**
   * Fetch and aggregate tokens from all sources
   */
  public async fetchAndAggregateTokens(): Promise<AggregatedToken[]> {
    logger.info('Fetching from all sources');

    // Fetch trending/popular tokens from each source in parallel
    const results = await Promise.allSettled([
      this.dexScreenerClient.getTrendingTokens(),
      this.jupiterClient.searchTokens('SOL'), // Jupiter doesn't have trending
    ]);

    const tokenArrays: Token[][] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        tokenArrays.push(result.value);
        logger.info(`Source ${index} fetched`, { count: result.value.length });
      } else {
        logger.error(`Source ${index} failed`, { error: result.reason });
      }
    });

    return this.aggregatorService.mergeTokens(tokenArrays);
  }

  /**
   * Generate cache key from params
   */
  private generateCacheKey(params: TokenQueryParams): string {
    const { sortBy = 'volume', period = '24h', minVolume = 0, minLiquidity = 0 } = params;
    return `${CONSTANTS.CACHE_KEYS.TOKEN_LIST}:${sortBy}:${period}:${minVolume}:${minLiquidity}`;
  }

  /**
   * Paginate results with cursor
   */
  private paginateResults(
    tokens: AggregatedToken[],
    cursor: string | undefined,
    limit: number
  ): { data: AggregatedToken[]; pagination: PaginationMeta } {
    let offset = 0;

    if (cursor) {
      try {
        const decoded = decodeCursor(cursor);
        offset = decoded.offset;
      } catch (error) {
        logger.warn('Invalid cursor, starting from beginning', { cursor });
      }
    }

    const data = tokens.slice(offset, offset + limit);
    const hasMore = offset + limit < tokens.length;

    const pagination: PaginationMeta = {
      nextCursor: hasMore 
        ? encodeCursor({ offset: offset + limit, timestamp: Date.now() })
        : null,
      hasMore,
      total: tokens.length,
    };

    return { data, pagination };
  }

  /**
   * Get current cached tokens (for WebSocket updates)
   */
  public async getCachedTokens(): Promise<AggregatedToken[]> {
    const cacheKey = `${CONSTANTS.CACHE_KEYS.TOKEN_LIST}:volume:24h:0:0`;
    const cached = await this.cacheService.get<ApiResponse<AggregatedToken[]>>(cacheKey);
    return cached?.data || [];
  }
}
