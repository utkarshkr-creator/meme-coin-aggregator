import { DexScreenerClient } from '../../src/clients/dexscreener.client';
import { BaseApiClient } from '../../src/clients/base.client';
import { DexScreenerResponse } from '../../src/types/api.types';

describe('DexScreenerClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('searchTokens filters to Solana and maps fields', async () => {
    const client = DexScreenerClient.getInstance();

    const response: DexScreenerResponse = {
      schemaVersion: '1',
      pairs: [
        {
          chainId: 'solana',
          dexId: 'raydium',
          url: '',
          pairAddress: 'pair1',
          baseToken: { address: 'addr1', name: 'Token1', symbol: 'TK1' },
          quoteToken: { address: 'sol', name: 'SOL', symbol: 'SOL' },
          priceNative: '0.01',
          txns: { h1: { buys: 1, sells: 1 }, h24: { buys: 10, sells: 5 } },
          volume: { h1: 1000, h24: 10000 },
          priceChange: { h1: 5, h24: 10 },
          liquidity: { usd: 20000, base: 0, quote: 0 },
          fdv: 0,
          marketCap: 100000,
        },
        {
          chainId: 'bsc',
          dexId: 'pancake',
          url: '',
          pairAddress: 'pair2',
          baseToken: { address: 'addr2', name: 'BEP', symbol: 'BEP' },
          quoteToken: { address: 'usdt', name: 'USDT', symbol: 'USDT' },
          priceNative: '1',
          txns: { h1: { buys: 1, sells: 1 }, h24: { buys: 1, sells: 1 } },
          volume: { h1: 10, h24: 20 },
          priceChange: { h1: 0, h24: 0 },
          liquidity: { usd: 1000, base: 0, quote: 0 },
          fdv: 0,
          marketCap: 0,
        },
      ],
    };

    jest.spyOn(BaseApiClient.prototype as any, 'get').mockResolvedValue(response);

    const tokens = await client.searchTokens('SOL');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token_address).toBe('addr1');
    expect(tokens[0].price_sol).toBeCloseTo(0.01);
    expect(tokens[0].volume_sol).toBeGreaterThan(0); // converted from usd/100
    expect(tokens[0].source).toBe('dexscreener');
  });

  it('getTokenByAddress returns most liquid Solana pair transformed', async () => {
    const client = DexScreenerClient.getInstance();

    const response: DexScreenerResponse = {
      schemaVersion: '1',
      pairs: [
        {
          chainId: 'solana', dexId: 'raydium', url: '', pairAddress: 'p1',
          baseToken: { address: 'A', name: 'A', symbol: 'A' },
          quoteToken: { address: 'SOL', name: 'SOL', symbol: 'SOL' },
          priceNative: '0.1', txns: { h1: { buys: 0, sells: 0 }, h24: { buys: 0, sells: 0 } },
          volume: { h1: 0, h24: 0 }, priceChange: { h1: 0, h24: 0 }, liquidity: { usd: 100, base: 0, quote: 0 },
          fdv: 0, marketCap: 0,
        },
        {
          chainId: 'solana', dexId: 'raydium', url: '', pairAddress: 'p2',
          baseToken: { address: 'A', name: 'A', symbol: 'A' },
          quoteToken: { address: 'SOL', name: 'SOL', symbol: 'SOL' },
          priceNative: '0.1', txns: { h1: { buys: 0, sells: 0 }, h24: { buys: 0, sells: 0 } },
          volume: { h1: 0, h24: 0 }, priceChange: { h1: 0, h24: 0 }, liquidity: { usd: 9999, base: 0, quote: 0 },
          fdv: 0, marketCap: 0,
        },
      ],
    };

    jest.spyOn(BaseApiClient.prototype as any, 'get').mockResolvedValue(response);
    const token = await client.getTokenByAddress('A');
    expect(token?.token_address).toBe('A');
    // chose p2 (liquidity 9999)
    expect(token?.liquidity_sol).toBeCloseTo(9999 / 100);
  });

  it('getTrendingTokens deduplicates and returns top by volume', async () => {
    const client = DexScreenerClient.getInstance();
    const spy = jest.spyOn(client, 'searchTokens');
    spy.mockResolvedValueOnce([
      { token_address: 'A', volume_sol: 100 } as any,
      { token_address: 'B', volume_sol: 50 } as any,
    ]);
    spy.mockResolvedValueOnce([
      { token_address: 'A', volume_sol: 100 } as any, // duplicate
      { token_address: 'C', volume_sol: 200 } as any,
    ]);
    spy.mockResolvedValueOnce([
      { token_address: 'D', volume_sol: 10 } as any,
    ]);

    const list = await client.getTrendingTokens();
    // After dedupe: A,B,C,D; sorted by volume -> C,A,B,D and slice(0,50)
    expect(list.map(t => t.token_address)).toEqual(['C','A','B','D']);
  });
});

