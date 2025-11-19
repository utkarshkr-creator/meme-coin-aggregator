import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer, createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { WebSocketService } from '../../src/services/websocket.service';
import { CacheService } from '../../src/services/cache.service';
import { CONSTANTS } from '../../src/config/constants';
import { AggregatedToken, ApiResponse } from '../../src/types/token.types';

// Helper to build tokens quickly
function makeToken(partial: Partial<AggregatedToken> & { token_address: string }): AggregatedToken {
  const now = Date.now();
  return {
    token_address: partial.token_address,
    token_name: partial.token_name || 'Test',
    token_ticker: partial.token_ticker || 'TST',
    price_sol: partial.price_sol ?? 1,
    market_cap_sol: partial.market_cap_sol ?? 100,
    volume_sol: partial.volume_sol ?? 0,
    liquidity_sol: partial.liquidity_sol ?? 0,
    transaction_count: partial.transaction_count ?? 0,
    price_1hr_change: partial.price_1hr_change ?? 0,
    price_24hr_change: partial.price_24hr_change,
    price_7d_change: partial.price_7d_change,
    protocol: partial.protocol || 'Raydium',
    source: partial.source || 'dexscreener',
    sources: partial.sources || ['dexscreener'],
    data_quality_score: partial.data_quality_score ?? 80,
    last_updated: partial.last_updated ?? now,
  };
}

describe('WebSocket Filtered Subscriptions', () => {
  let httpServer: HttpServer;
  let io: SocketServer;
  let wsService: WebSocketService;
  let cache: CacheService;
  const port = 3003;

  beforeAll(async () => {
    cache = CacheService.getInstance();
    await cache.connect();

    httpServer = createServer();
    io = new SocketServer(httpServer, { cors: { origin: '*' }, transports: ['websocket', 'polling'] });
    wsService = WebSocketService.resetForTests(io);
    wsService.initialize();
    await new Promise<void>((resolve) => httpServer.listen(port, () => resolve()));
  });

  afterAll(async () => {
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await cache.disconnect();
  });

  it('sends initial filtered snapshot on subscribe:filters (from cache)', async () => {
    // Prepare cached token list
    const tokens = [
      makeToken({ token_address: 'A', volume_sol: 100, liquidity_sol: 200 }),
      makeToken({ token_address: 'B', volume_sol: 60, liquidity_sol: 150 }),
      makeToken({ token_address: 'C', volume_sol: 10, liquidity_sol: 50 }),
    ];

    const cacheKey = `${CONSTANTS.CACHE_KEYS.TOKEN_LIST}:volume:24h:0:0`;
    const payload: ApiResponse<AggregatedToken[]> = {
      success: true,
      data: tokens,
      pagination: { nextCursor: null, hasMore: false, total: tokens.length },
      meta: { cached: false, sources: ['dexscreener', 'jupiter'], timestamp: Date.now() },
    };
    await cache.set(cacheKey, payload, 30);

    const client: ClientSocket = ioClient(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });

    const result = await new Promise<{ tokens: AggregatedToken[] }>((resolve, reject) => {
      const onError = (err: any) => reject(err);
      client.on('connect_error', onError);
      client.on('tokens:refresh', (data) => resolve(data));
      client.on('connect', () => {
        client.emit('subscribe:filters', { sortBy: 'volume', period: '24h', minVolume: 40, limit: 2 });
      });
      setTimeout(() => reject(new Error('timeout')), 5000);
    });

    expect(result.tokens.map((t) => t.token_address)).toEqual(['A', 'B']);
    client.disconnect();
  });

  it('delivers filtered refreshes to filter rooms only', async () => {
    // FIRST: Set up cache with tokens so initial snapshot works
    const cacheTokens = [
      makeToken({ token_address: 'CACHED1', volume_sol: 100, liquidity_sol: 200 }),
      makeToken({ token_address: 'CACHED2', volume_sol: 60, liquidity_sol: 100 }),
    ];
    
    const cacheKey = `${CONSTANTS.CACHE_KEYS.TOKEN_LIST}:volume:24h:0:0`;
    const cachePayload: ApiResponse<AggregatedToken[]> = {
      success: true,
      data: cacheTokens,
      pagination: { nextCursor: null, hasMore: false, total: cacheTokens.length },
      meta: { cached: false, sources: ['dexscreener', 'jupiter'], timestamp: Date.now() },
    };
    await cache.set(cacheKey, cachePayload, 30);
  
    const client1: ClientSocket = ioClient(`http://localhost:${port}`, { 
      transports: ['websocket'], 
      forceNew: true,
      reconnection: false // Prevent reconnection attempts
    });
    
    const client2: ClientSocket = ioClient(`http://localhost:${port}`, { 
      transports: ['websocket'], 
      forceNew: true,
      reconnection: false
    });
  
    // Wait for both clients to connect
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        client1.on('connect', resolve);
        client1.on('connect_error', reject);
        setTimeout(() => reject(new Error('client1 connection timeout')), 5000);
      }),
      new Promise<void>((resolve, reject) => {
        client2.on('connect', resolve);
        client2.on('connect_error', reject);
        setTimeout(() => reject(new Error('client2 connection timeout')), 5000);
      })
    ]);
  
    // Subscribe both clients and wait for initial snapshots
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        let initialReceived = false;
        client1.once('tokens:refresh', () => {
          initialReceived = true;
          resolve();
        });
        client1.emit('subscribe:filters', 
          { sortBy: 'volume', period: '24h', minVolume: 50, limit: 1 },
          (res: { ok: boolean }) => {
            if (!res.ok) reject(new Error('client1 subscribe failed'));
            // Give a moment for the refresh event if ack comes first
            if (!initialReceived) {
              setTimeout(() => {
                if (!initialReceived) reject(new Error('client1 no initial snapshot'));
              }, 1000);
            }
          }
        );
      }),
      new Promise<void>((resolve, reject) => {
        let initialReceived = false;
        client2.once('tokens:refresh', () => {
          initialReceived = true;
          resolve();
        });
        client2.emit('subscribe:filters', 
          { sortBy: 'liquidity', period: '24h', minLiquidity: 300, limit: 5 },
          (res: { ok: boolean }) => {
            if (!res.ok) reject(new Error('client2 subscribe failed'));
            if (!initialReceived) {
              setTimeout(() => {
                if (!initialReceived) reject(new Error('client2 no initial snapshot'));
              }, 1000);
            }
          }
        );
      })
    ]);
  
    // NOW set up listeners for the broadcast
    const p1 = new Promise<AggregatedToken[]>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('client1 broadcast timeout')), 5000);
      client1.once('tokens:refresh', (data: any) => {
        clearTimeout(timeout);
        resolve(data.tokens);
      });
    });
  
    const p2 = new Promise<AggregatedToken[]>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('client2 broadcast timeout')), 5000);
      client2.once('tokens:refresh', (data: any) => {
        clearTimeout(timeout);
        resolve(data.tokens);
      });
    });
  
    // Broadcast tokens
    const tokens = [
      makeToken({ token_address: 'A', volume_sol: 100, liquidity_sol: 200 }),
      makeToken({ token_address: 'B', volume_sol: 60, liquidity_sol: 100 }),
      makeToken({ token_address: 'C', volume_sol: 10, liquidity_sol: 50 }),
      makeToken({ token_address: 'D', volume_sol: 55, liquidity_sol: 500 }),
    ];
  
    // Small delay to ensure everything is ready
    await new Promise((r) => setTimeout(r, 100));
    
    wsService.broadcastTokensRefreshForFilters(tokens);
  
    const [list1, list2] = await Promise.all([p1, p2]);
  
    // Client1: volume >= 50, limit 1, sorted by volume desc => A (vol=100)
    expect(list1.map((t) => t.token_address)).toEqual(['A']);
    
    // Client2: liquidity >= 300, limit 5, sorted by liquidity desc => D (liq=500)
    expect(list2.map((t) => t.token_address)).toEqual(['D']);
  
    client1.disconnect();
    client2.disconnect();
  }, 20000);

  it('does not send filtered refresh after unsubscribe:filters', async () => {
    const client: ClientSocket = ioClient(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });

    await new Promise<void>((resolve) => client.on('connect', () => {
      client.emit('subscribe:filters', { sortBy: 'volume', period: '24h', minVolume: 0, limit: 5 }, () => {
        // Once subscribed and initial snapshot sent, immediately unsubscribe with ack
        client.emit('unsubscribe:filters', () => resolve());
      });
    }));

    let received = false;
    client.once('tokens:refresh', () => { received = true; });

    wsService.broadcastTokensRefreshForFilters([
      makeToken({ token_address: 'X', volume_sol: 1 }),
      makeToken({ token_address: 'Y', volume_sol: 2 }),
    ]);

    await new Promise((r) => setTimeout(r, 300));
    expect(received).toBe(false);

    client.disconnect();
  }, 10000);
});
