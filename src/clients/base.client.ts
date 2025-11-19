import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from '../utils/logger';
import { CacheService } from '../services/cache.service';
import { CONSTANTS } from '../config/constants';

export abstract class BaseApiClient {
  protected client: AxiosInstance;
  protected cacheService: CacheService;
  protected rateLimitKey: string;
  protected requestsPerMinute: number;

  constructor(
    baseURL: string,
    rateLimitKey: string,
    requestsPerMinute: number,
    timeout: number = 10000
  ) {
    this.client = axios.create({
      baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Configure retry logic
    axiosRetry(this.client, {
      retries: CONSTANTS.RETRY.MAX_ATTEMPTS,
      retryDelay: (retryCount) => {
        const delay = Math.min(
          CONSTANTS.RETRY.BASE_DELAY * Math.pow(2, retryCount - 1),
          CONSTANTS.RETRY.MAX_DELAY
        );
        logger.debug('API retry delay', { retryCount, delay });
        return delay;
      },
      retryCondition: (error: AxiosError) => {
        // Retry on network errors or 5xx responses
        return (
          axiosRetry.isNetworkError(error) ||
          axiosRetry.isRetryableError(error) ||
          (error.response?.status ? error.response.status >= 500 : false)
        );
      },
      onRetry: (retryCount, error, requestConfig) => {
        logger.warn('Retrying API request', {
          retryCount,
          url: requestConfig.url,
          error: error.message,
        });
      },
    });

    // Request interceptor for rate limiting
    this.client.interceptors.request.use(
      async (config) => {
        await this.checkRateLimit();
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('API response', {
          url: response.config.url,
          status: response.status,
        });
        return response;
      },
      (error: AxiosError) => {
        logger.error('API error', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );

    this.cacheService = CacheService.getInstance();
    this.rateLimitKey = rateLimitKey;
    this.requestsPerMinute = requestsPerMinute;
  }

  protected async checkRateLimit(): Promise<void> {
    const key = `${CONSTANTS.CACHE_KEYS.RATE_LIMIT}:${this.rateLimitKey}:${Math.floor(Date.now() / 60000)}`;
    const currentCount = await this.cacheService.incrementRateLimit(key, 60);

    if (currentCount > this.requestsPerMinute) {
      const waitTime = 60 - (Date.now() / 1000) % 60;
      logger.warn('Rate limit reached, waiting', {
        source: this.rateLimitKey,
        waitTime,
      });
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
    }
  }

  protected async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  protected async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  public abstract getName(): string;
}
