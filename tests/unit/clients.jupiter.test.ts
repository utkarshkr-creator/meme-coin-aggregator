import { JupiterClient } from '../../src/clients/jupiter.client';
import { BaseApiClient } from '../../src/clients/base.client';

describe('JupiterClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('searchTokens maps fields with defaults', async () => {
    const client = JupiterClient.getInstance();
    jest.spyOn(BaseApiClient.prototype as any, 'get').mockResolvedValue({
      data: [
        { address: 'J1', name: 'Jupiter1', symbol: 'JUP1', decimals: 9, daily_volume: 1234 },
        { address: 'J2', name: 'Jupiter2', symbol: 'JUP2', decimals: 6 }, // missing volume
      ],
    });

    const list = await client.searchTokens('SOL');
    expect(list).toHaveLength(2);
    const j1 = list.find(t => t.token_address === 'J1')!;
    const j2 = list.find(t => t.token_address === 'J2')!;
    expect(j1.volume_sol).toBe(1234);
    expect(j2.volume_sol).toBe(0);
    expect(j1.price_sol).toBe(0);
    expect(j1.source).toBe('jupiter');
  });
});

