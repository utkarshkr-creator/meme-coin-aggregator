import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  cache: {
    ttl: {
      default: parseInt(process.env.CACHE_TTL_DEFAULT || '30', 10),
      tokenList: parseInt(process.env.CACHE_TTL_TOKEN_LIST || '30', 10),
      tokenDetail: parseInt(process.env.CACHE_TTL_TOKEN_DETAIL || '60', 10),
    },
  },

  rateLimit: {
    dexScreener: parseInt(process.env.DEXSCREENER_RATE_LIMIT || '300', 10),
    jupiter: parseInt(process.env.JUPITER_RATE_LIMIT || '60', 10),
    geckoTerminal: parseInt(process.env.GECKOTERMINAL_RATE_LIMIT || '30', 10),
  },

  websocket: {
    priceChangeThreshold: parseFloat(process.env.WS_PRICE_CHANGE_THRESHOLD || '5'),
    volumeSpikeThreshold: parseFloat(process.env.WS_VOLUME_SPIKE_THRESHOLD || '50'),
  },

  jobs: {
    dataRefreshInterval: parseInt(process.env.DATA_REFRESH_INTERVAL || '30000', 10),
  },

  apis: {
    dexScreener: process.env.DEXSCREENER_BASE_URL || 'https://api.dexscreener.com/latest/dex',
    jupiter: process.env.JUPITER_BASE_URL || 'https://lite-api.jup.ag',
    geckoTerminal: process.env.GECKOTERMINAL_BASE_URL || 'https://api.geckoterminal.com/api/v2',
  },
};
