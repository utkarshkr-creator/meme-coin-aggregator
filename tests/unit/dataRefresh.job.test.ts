/**
 * Unit tests for DataRefreshJob without scheduling cron timers.
 */
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    stop: jest.fn(),
  })),
}));

import { DataRefreshJob } from '../../src/jobs/dataRefresh.job';
import { TokenDataService } from '../../src/services/tokenData.service';
import { AggregatorService } from '../../src/services/aggregator.service';
import { WebSocketService } from '../../src/services/websocket.service';

describe('DataRefreshJob', () => {
  let tokenDataServiceMock: any;
  let aggregatorServiceMock: any;

  // Helper to create WebSocket mock
  const createWsMock = (clientCount: number = 1): jest.Mocked<Partial<WebSocketService>> => ({
    broadcastTokensRefresh: jest.fn(),
    broadcastTokensRefreshForFilters: jest.fn(),
    broadcastPriceAlert: jest.fn(),
    broadcastVolumeSpike: jest.fn(),
    getConnectedClientsCount: jest.fn().mockReturnValue(clientCount),
  });

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Create fresh mock instances for each test
    tokenDataServiceMock = {
      fetchAndAggregateTokens: jest.fn(),
    };

    aggregatorServiceMock = {
      detectSignificantChanges: jest.fn(),
    };

    // Mock the getInstance methods to return our fresh mocks
    jest.spyOn(TokenDataService, 'getInstance').mockReturnValue(tokenDataServiceMock);
    jest.spyOn(AggregatorService, 'getInstance').mockReturnValue(aggregatorServiceMock);
  });

  afterEach(async () => {
    // Cleanup: stop the job
    const job = DataRefreshJob.getInstance();
    await job.stop();
    
    // Reset singleton
    DataRefreshJob.reset();

    jest.restoreAllMocks();

    // Wait for any pending operations
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  it('broadcasts updates and alerts when data changes significantly', async () => {
    const tokensPrev = [
      { token_address: 'A', price_sol: 100, volume_sol: 100 } as any,
      { token_address: 'B', price_sol: 5, volume_sol: 10 } as any,
    ];

    const tokensNew = [
      { token_address: 'A', price_sol: 110, volume_sol: 200 } as any,
      { token_address: 'B', price_sol: 5, volume_sol: 10 } as any,
    ];

    // Setup mocks for this specific test
    tokenDataServiceMock.fetchAndAggregateTokens
      .mockResolvedValueOnce(tokensPrev)
      .mockResolvedValueOnce(tokensNew);

    aggregatorServiceMock.detectSignificantChanges.mockReturnValue({
      priceChanges: [tokensNew[0]],
      volumeSpikes: [tokensNew[0]],
    });

    const ws = createWsMock();

    const job = DataRefreshJob.getInstance();

    // Initialize performs first refresh (fetches tokensPrev)
    await job.initialize(ws as WebSocketService);

    // First refresh: fetches data but has no previous data to compare
    expect(tokenDataServiceMock.fetchAndAggregateTokens).toHaveBeenCalledTimes(1);
    expect(aggregatorServiceMock.detectSignificantChanges).not.toHaveBeenCalled();
    expect(ws.broadcastTokensRefresh).not.toHaveBeenCalled();
    expect(ws.broadcastPriceAlert).not.toHaveBeenCalled();
    expect(ws.broadcastVolumeSpike).not.toHaveBeenCalled();

    // Verify previous tokens were stored
    let prev = job.getPreviousTokens();
    expect(prev).toHaveLength(2);
    expect(prev[0].price_sol).toBe(100);

    // Second refresh should trigger alerts (fetches tokensNew)
    await job.refresh();

    expect(tokenDataServiceMock.fetchAndAggregateTokens).toHaveBeenCalledTimes(2);
    expect(aggregatorServiceMock.detectSignificantChanges).toHaveBeenCalledTimes(1);
    expect(ws.broadcastPriceAlert).toHaveBeenCalledTimes(1);
    expect(ws.broadcastVolumeSpike).toHaveBeenCalledTimes(1);
    expect(ws.broadcastTokensRefresh).toHaveBeenCalledTimes(1);
    expect(ws.broadcastTokensRefreshForFilters).toHaveBeenCalledTimes(1);

    // Verify alert was called with correct change percent
    expect(ws.broadcastPriceAlert).toHaveBeenCalledWith(
      expect.objectContaining({ token_address: 'A' }),
      10 // 10% price change
    );
    expect(ws.broadcastVolumeSpike).toHaveBeenCalledWith(
      expect.objectContaining({ token_address: 'A' }),
      100 // 100% volume change
    );

    // Verify previous tokens were updated
    prev = job.getPreviousTokens();
    expect(prev).toHaveLength(2);
    expect(prev[0].price_sol).toBe(110);
  });

  it('handles empty token list gracefully', async () => {
    tokenDataServiceMock.fetchAndAggregateTokens.mockResolvedValue([]);

    const ws = createWsMock();

    const job = DataRefreshJob.getInstance();
    await job.initialize(ws as WebSocketService);

    expect(tokenDataServiceMock.fetchAndAggregateTokens).toHaveBeenCalledTimes(1);
    expect(ws.broadcastTokensRefresh).not.toHaveBeenCalled();
    expect(job.getPreviousTokens()).toHaveLength(0);
  });

  it('handles refresh errors gracefully', async () => {
    tokenDataServiceMock.fetchAndAggregateTokens.mockRejectedValue(new Error('Network error'));

    const ws = createWsMock();

    const job = DataRefreshJob.getInstance();
    
    // Should not throw
    await expect(job.initialize(ws as WebSocketService)).resolves.not.toThrow();
    
    expect(tokenDataServiceMock.fetchAndAggregateTokens).toHaveBeenCalledTimes(1);
    expect(ws.broadcastTokensRefresh).not.toHaveBeenCalled();
    expect(job.getPreviousTokens()).toHaveLength(0);
  });

  it('skips refresh when already in progress', async () => {
    const tokens = [{ token_address: 'A', price_sol: 100 }] as any[];
    
    // Make the first fetch take a long time
    tokenDataServiceMock.fetchAndAggregateTokens
      .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(tokens), 200)));

    const job = DataRefreshJob.getInstance();
    
    // Start first refresh (takes 200ms) - don't use initialize to avoid double call
    const promise1 = job.refresh();
    
    // Wait a bit, then try to start second refresh (should skip)
    await new Promise(resolve => setTimeout(resolve, 50));
    const promise2 = job.refresh();

    await Promise.all([promise1, promise2]);

    // Should only call fetch once (second call was skipped due to isRunning lock)
    expect(tokenDataServiceMock.fetchAndAggregateTokens).toHaveBeenCalledTimes(1);
  });

  it('does not broadcast when no clients are connected', async () => {
    const tokensPrev = [{ token_address: 'A', price_sol: 100, volume_sol: 100 }] as any[];
    const tokensNew = [{ token_address: 'A', price_sol: 110, volume_sol: 200 }] as any[];

    tokenDataServiceMock.fetchAndAggregateTokens
      .mockResolvedValueOnce(tokensPrev)
      .mockResolvedValueOnce(tokensNew);

    aggregatorServiceMock.detectSignificantChanges.mockReturnValue({
      priceChanges: [tokensNew[0]],
      volumeSpikes: [tokensNew[0]],
    });

    const ws = createWsMock(0); // No clients connected

    const job = DataRefreshJob.getInstance();
    await job.initialize(ws as WebSocketService);

    // First refresh
    expect(tokenDataServiceMock.fetchAndAggregateTokens).toHaveBeenCalledTimes(1);

    // Second refresh
    await job.refresh();
    
    expect(tokenDataServiceMock.fetchAndAggregateTokens).toHaveBeenCalledTimes(2);
    expect(aggregatorServiceMock.detectSignificantChanges).toHaveBeenCalledTimes(1);
    
    // Should detect changes but not broadcast refresh (still broadcasts alerts)
    expect(ws.broadcastPriceAlert).toHaveBeenCalledTimes(1);
    expect(ws.broadcastVolumeSpike).toHaveBeenCalledTimes(1);
    expect(ws.broadcastTokensRefresh).not.toHaveBeenCalled();
    expect(ws.broadcastTokensRefreshForFilters).not.toHaveBeenCalled();
  });
});