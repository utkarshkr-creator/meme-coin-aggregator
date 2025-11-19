import cron from 'node-cron';
import { TokenDataService } from '../services/tokenData.service';
import { WebSocketService } from '../services/websocket.service';
import { AggregatorService } from '../services/aggregator.service';
import { logger } from '../utils/logger';
import { config } from '../config';
import { AggregatedToken } from '../types/token.types';

export class DataRefreshJob {
  private static instance: DataRefreshJob;
  private tokenDataService: TokenDataService;
  private wsService: WebSocketService | null = null;
  private aggregatorService: AggregatorService;
  private previousTokens: AggregatedToken[] = [];
  private isRunning: boolean = false;
  private cronJob: cron.ScheduledTask | null = null;

  private constructor() {
    this.tokenDataService = TokenDataService.getInstance();
    this.aggregatorService = AggregatorService.getInstance();
  }

  public static getInstance(): DataRefreshJob {
    if (!DataRefreshJob.instance) {
      DataRefreshJob.instance = new DataRefreshJob();
    }
    return DataRefreshJob.instance;
  }

  /**
   * Initialize the refresh job
   */
  public async initialize(wsService: WebSocketService): Promise<void> {
    this.wsService = wsService;

    // Run every 30 seconds (configurable)
    const interval = Math.floor(config.jobs.dataRefreshInterval / 1000);
    const cronExpression = `*/${interval} * * * * *`;

    logger.info('Initializing data refresh job', { interval: `${interval}s` });

    // Schedule periodic refresh
    this.cronJob = cron.schedule(cronExpression, async () => {
      await this.refresh();
    });

    // Run immediately on startup and wait for it to complete
    await this.refresh();
  }

  /**
   * Manual refresh trigger
   */
  public async refresh(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Refresh already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Starting data refresh');

      // Fetch fresh data
      const newTokens = await this.tokenDataService.fetchAndAggregateTokens();

      if (newTokens.length === 0) {
        logger.warn('No tokens fetched during refresh');
        return;
      }

      // Detect significant changes (only if we have previous data)
      if (this.previousTokens.length > 0 && this.wsService) {
        const { priceChanges, volumeSpikes } = this.aggregatorService.detectSignificantChanges(
          this.previousTokens,
          newTokens,
          config.websocket.priceChangeThreshold,
          config.websocket.volumeSpikeThreshold
        );

        // Broadcast price changes
        for (const token of priceChanges) {
          const oldToken = this.previousTokens.find(
            t => t.token_address.toLowerCase() === token.token_address.toLowerCase()
          );
          
          if (oldToken) {
            const changePercent = ((token.price_sol - oldToken.price_sol) / oldToken.price_sol) * 100;
            this.wsService.broadcastPriceAlert(token, changePercent);
          }
        }

        // Broadcast volume spikes
        for (const token of volumeSpikes) {
          const oldToken = this.previousTokens.find(
            t => t.token_address.toLowerCase() === token.token_address.toLowerCase()
          );
          
          if (oldToken && oldToken.volume_sol > 0) {
            const spikePercent = ((token.volume_sol - oldToken.volume_sol) / oldToken.volume_sol) * 100;
            this.wsService.broadcastVolumeSpike(token, spikePercent);
          }
        }

        // Broadcast full refresh if connected clients exist
        if (this.wsService.getConnectedClientsCount() > 0) {
          this.wsService.broadcastTokensRefresh(newTokens.slice(0, 50)); // Top 50 to all
          // Also push filtered snapshots to subscribed rooms
          this.wsService.broadcastTokensRefreshForFilters(newTokens);
        }
      }

      // Update previous tokens
      this.previousTokens = newTokens;

      logger.info('Data refresh completed', {
        tokenCount: newTokens.length,
        duration: Date.now() - startTime,
      });

    } catch (error) {
      logger.error('Data refresh failed', { error });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop the cron job
   */
  public async stop(): Promise<void> {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    // Wait for any ongoing refresh to complete
    let attempts = 0;
    while (this.isRunning && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    logger.info('Data refresh job stopped');
  }

  /**
   * Get previous tokens (for testing/debugging)
   */
  public getPreviousTokens(): AggregatedToken[] {
    return this.previousTokens;
  }

  /**
   * Reset instance (for testing)
   */
  public static reset(): void {
    if (DataRefreshJob.instance) {
      DataRefreshJob.instance.stop();
      DataRefreshJob.instance = null as any;
    }
  }
}