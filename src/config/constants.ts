export const CONSTANTS = {
  // Pagination
  DEFAULT_PAGE_LIMIT: 20,
  MAX_PAGE_LIMIT: 100,

  // Token deduplication priority
  SOURCE_PRIORITY: {
    dexscreener: 3,
    jupiter: 2,
    geckoterminal: 1,
  },

  // Retry configuration
  RETRY: {
    MAX_ATTEMPTS: 5,
    BASE_DELAY: 1000, // 1 second
    MAX_DELAY: 16000, // 16 seconds
  },

  // Cache keys
  CACHE_KEYS: {
    TOKEN_LIST: 'tokens:list',
    TOKEN_DETAIL: 'token',
    RATE_LIMIT: 'ratelimit',
  },

  // WebSocket events
  WS_EVENTS: {
    TOKEN_UPDATE: 'token:update',
    TOKENS_REFRESH: 'tokens:refresh',
    PRICE_ALERT: 'price:alert',
    VOLUME_SPIKE: 'volume:spike',
  },

  // Supported time periods
  TIME_PERIODS: ['1h', '24h', '7d'] as const,

  // Sort options
  SORT_OPTIONS: ['volume', 'priceChange', 'marketCap', 'liquidity'] as const,
};
