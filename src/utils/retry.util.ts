import { logger } from './logger';
import { CONSTANTS } from '../config/constants';

interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = CONSTANTS.RETRY.MAX_ATTEMPTS,
    baseDelay = CONSTANTS.RETRY.BASE_DELAY,
    maxDelay = CONSTANTS.RETRY.MAX_DELAY,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts) {
        logger.error('Max retry attempts reached', {
          attempt,
          error: lastError.message,
        });
        throw lastError;
      }

      // Calculate exponential backoff delay
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      
      // Add jitter (±20%)
      const jitter = delay * (0.8 + Math.random() * 0.4);

      logger.warn('Retrying after error', {
        attempt,
        nextAttempt: attempt + 1,
        delay: Math.round(jitter),
        error: lastError.message,
      });

      if (onRetry) {
        onRetry(attempt, lastError);
      }

      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }

  throw lastError!;
}
