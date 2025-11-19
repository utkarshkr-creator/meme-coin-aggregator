import { AggregatorService } from '../../src/services/aggregator.service';
import { Token } from '../../src/types/token.types';

describe('AggregatorService', () => {
  let service: AggregatorService;

  beforeEach(() => {
    service = AggregatorService.getInstance();
  });

  describe('mergeTokens', () => {
    it('should merge tokens from multiple sources', () => {
      const token1: Token = {
        token_address: '0x123',
        token_name: 'Test Token',
        token_ticker: 'TEST',
        price_sol: 1.0,
        market_cap_sol: 1000,
        volume_sol: 500,
        liquidity_sol: 200,
        transaction_count: 100,
        price_1hr_change: 5,
        protocol: 'Raydium',
        source: 'dexscreener',
        last_updated: Date.now(),
      };

      const token2: Token = {
        ...token1,
        price_sol: 1.1,
        volume_sol: 600,
        source: 'jupiter',
      };

      const result = service.mergeTokens([[token1], [token2]]);

      expect(result).toHaveLength(1);
      expect(result[0].sources).toHaveLength(2);
      expect(result[0].volume_sol).toBe(1100); // Sum of volumes
    });

    it('should deduplicate by token address (case insensitive)', () => {
      const token1: Token = {
        token_address: '0xABC',
        token_name: 'Test',
        token_ticker: 'TEST',
        price_sol: 1.0,
        market_cap_sol: 1000,
        volume_sol: 500,
        liquidity_sol: 200,
        transaction_count: 100,
        price_1hr_change: 5,
        protocol: 'Raydium',
        source: 'dexscreener',
        last_updated: Date.now(),
      };

      const token2: Token = {
        ...token1,
        token_address: '0xabc', // Different case
        source: 'jupiter',
      };

      const result = service.mergeTokens([[token1], [token2]]);

      expect(result).toHaveLength(1);
    });
  });

  describe('sortTokens', () => {
    it('should sort by volume descending', () => {
      const tokens = [
        { volume_sol: 100 } as any,
        { volume_sol: 500 } as any,
        { volume_sol: 200 } as any,
      ];

      const sorted = service.sortTokens(tokens, 'volume');

      expect(sorted[0].volume_sol).toBe(500);
      expect(sorted[2].volume_sol).toBe(100);
    });

    it('should sort by 24h price change when period=24h', () => {
      const tokens = [
        { price_1hr_change: 1, price_24hr_change: 5 } as any,
        { price_1hr_change: 2, price_24hr_change: 10 } as any,
        { price_1hr_change: 3, price_24hr_change: -1 } as any,
      ];

      const sorted = service.sortTokens(tokens, 'priceChange', '24h');
      expect(sorted[0].price_24hr_change).toBe(10);
      expect(sorted[2].price_24hr_change).toBe(-1);
    });

    it('should sort by 7d price change when available (fallback 0)', () => {
      const tokens = [
        { price_7d_change: 50 } as any,
        { price_7d_change: -10 } as any,
        { } as any, // missing 7d -> treated as 0
      ];

      const sorted = service.sortTokens(tokens as any, 'priceChange', '7d');
      expect((sorted[0] as any).price_7d_change).toBe(50);
      expect((sorted[1] as any).price_7d_change ?? 0).toBe(0);
      expect((sorted[2] as any).price_7d_change).toBe(-10);
    });
  });

  describe('filterTokens', () => {
    it('should filter by minimum volume', () => {
      const tokens = [
        { volume_sol: 100, liquidity_sol: 50, data_quality_score: 80 } as any,
        { volume_sol: 500, liquidity_sol: 200, data_quality_score: 90 } as any,
        { volume_sol: 50, liquidity_sol: 20, data_quality_score: 70 } as any,
      ];

      const filtered = service.filterTokens(tokens, { minVolume: 100 });

      expect(filtered).toHaveLength(2);
    });
  });

  describe('detectSignificantChanges', () => {
    it('should detect price changes above threshold', () => {
      const oldTokens = [
        { token_address: '0x123', price_sol: 1.0, volume_sol: 100 } as any,
      ];

      const newTokens = [
        { token_address: '0x123', price_sol: 1.1, volume_sol: 100 } as any, // 10% change
      ];

      const { priceChanges } = service.detectSignificantChanges(
        oldTokens,
        newTokens,
        5 // 5% threshold
      );

      expect(priceChanges).toHaveLength(1);
    });

    it('should detect volume spikes above threshold', () => {
      const oldTokens = [
        { token_address: '0x123', price_sol: 1.0, volume_sol: 100 } as any,
      ];

      const newTokens = [
        { token_address: '0x123', price_sol: 1.0, volume_sol: 200 } as any, // 100% spike
      ];

      const { volumeSpikes } = service.detectSignificantChanges(
        oldTokens,
        newTokens,
        5,
        50 // 50% threshold
      );

      expect(volumeSpikes).toHaveLength(1);
    });
  });
});
