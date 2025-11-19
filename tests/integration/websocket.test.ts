import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { WebSocketService } from '../../src/services/websocket.service';
import { AggregatedToken } from '../../src/types/token.types';

describe('WebSocket Integration Tests', () => {
  let httpServer: HttpServer;
  let io: SocketServer;
  let wsService: WebSocketService;
  let clientSocket: ClientSocket;
  const port = 3002;

  beforeAll((done) => {
    httpServer = createServer();
    io = new SocketServer(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket', 'polling'],
    });

    wsService = WebSocketService.getInstance(io);
    wsService.initialize();

    httpServer.listen(port, () => {
      done();
    });
  });

  afterAll((done) => {
    io.close();
    httpServer.close(() => {
      done();
    });
  });

  beforeEach((done) => {
    clientSocket = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    
    clientSocket.on('connect', () => {
      done();
    });

    clientSocket.on('connect_error', (error) => {
      done(error);
    });
  });

  afterEach((done) => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
    setTimeout(done, 100);
  });

  it('should connect client successfully', (done) => {
    // Test that client is already connected from beforeEach
    expect(clientSocket.connected).toBe(true);
    
    // The 'connected' event is sent after connection, set listener first
    const newClient = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    
    newClient.on('connected', (data) => {
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('socketId');
      expect(data.socketId).toBe(newClient.id);
      newClient.disconnect();
      done();
    });

    newClient.on('connect_error', (error) => {
      newClient.disconnect();
      done(error);
    });
  });

  it('should receive token update broadcast', (done) => {
    const mockToken: AggregatedToken = {
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
      sources: ['dexscreener'],
      data_quality_score: 80,
      last_updated: Date.now(),
    };

    clientSocket.on('token:update', (data) => {
      expect(data).toHaveProperty('token');
      expect(data.token.token_address).toBe('0x123');
      done();
    });

    setTimeout(() => {
      wsService.broadcastTokenUpdate(mockToken);
    }, 100);
  });

  it('should subscribe to specific token', (done) => {
    const tokenAddress = '0xabc';

    clientSocket.emit('subscribe:token', tokenAddress);

    setTimeout(() => {
      expect(wsService.getConnectedClientsCount()).toBeGreaterThan(0);
      done();
    }, 100);
  });

  it('should receive price alert', (done) => {
    const mockToken: AggregatedToken = {
      token_address: '0x456',
      token_name: 'Alert Token',
      token_ticker: 'ALERT',
      price_sol: 2.0,
      market_cap_sol: 2000,
      volume_sol: 1000,
      liquidity_sol: 400,
      transaction_count: 200,
      price_1hr_change: 10,
      protocol: 'Raydium',
      source: 'dexscreener',
      sources: ['dexscreener'],
      data_quality_score: 90,
      last_updated: Date.now(),
    };

    clientSocket.on('price:alert', (data) => {
      expect(data).toHaveProperty('token');
      expect(data).toHaveProperty('changePercent');
      expect(data.changePercent).toBe(10);
      done();
    });

    setTimeout(() => {
      wsService.broadcastPriceAlert(mockToken, 10);
    }, 100);
  });

  it('should handle multiple clients', (done) => {
    const client2 = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });

    client2.on('connect', () => {
      setTimeout(() => {
        expect(wsService.getConnectedClientsCount()).toBe(2);
        client2.disconnect();
        done();
      }, 100);
    });
  });
});