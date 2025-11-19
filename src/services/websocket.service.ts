import { Server as SocketServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../config/constants';
import { AggregatedToken } from '../types/token.types';
import { AggregatorService } from './aggregator.service';
import { TokenDataService } from './tokenData.service';

export class WebSocketService {
  private static instance: WebSocketService;
  private io: SocketServer;
  private connectedClients: Map<string, Socket>;
  private filterRooms: Map<string, {
    sortBy: 'volume' | 'priceChange' | 'marketCap' | 'liquidity';
    period: '1h' | '24h' | '7d';
    minVolume?: number;
    minLiquidity?: number;
    limit: number;
  }>;
  private socketFilterRooms: Map<string, Set<string>>;
  private aggregator: AggregatorService;
  private tokenDataService: TokenDataService;

  private constructor(io: SocketServer) {
    this.io = io;
    this.connectedClients = new Map();
    this.filterRooms = new Map();
    this.socketFilterRooms = new Map();
    this.aggregator = AggregatorService.getInstance();
    this.tokenDataService = TokenDataService.getInstance();
  }

  public static getInstance(io?: SocketServer): WebSocketService {
    if (!WebSocketService.instance) {
      if (!io) {
        throw new Error('SocketServer instance required for initialization');
      }
      WebSocketService.instance = new WebSocketService(io);
    }
    return WebSocketService.instance;
  }

  // Test helper to ensure fresh instance bound to a specific server
  public static resetForTests(io: SocketServer): WebSocketService {
    WebSocketService.instance = new WebSocketService(io);
    return WebSocketService.instance;
  }

  /**
   * Initialize WebSocket handlers
   */
  public initialize(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info('Client connected', { 
        socketId: socket.id,
        clientsCount: this.connectedClients.size + 1 
      });

      this.connectedClients.set(socket.id, socket);

      // Handle client subscription to specific tokens
      socket.on('subscribe:token', (tokenAddress: string) => {
        socket.join(`token:${tokenAddress}`);
        logger.debug('Client subscribed to token', { 
          socketId: socket.id, 
          tokenAddress 
        });
      });

      socket.on('unsubscribe:token', (tokenAddress: string) => {
        socket.leave(`token:${tokenAddress}`);
        logger.debug('Client unsubscribed from token', { 
          socketId: socket.id, 
          tokenAddress 
        });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        // Clean up filter room membership for this socket
        const rooms = this.socketFilterRooms.get(socket.id);
        if (rooms) {
          rooms.forEach((room) => {
            socket.leave(room);
            const size = this.io.sockets.adapter.rooms.get(room)?.size || 0;
            if (size === 0) {
              this.filterRooms.delete(room);
            }
          });
          this.socketFilterRooms.delete(socket.id);
        }
        this.connectedClients.delete(socket.id);
        logger.info('Client disconnected', { 
          socketId: socket.id,
          clientsCount: this.connectedClients.size 
        });
      });

      // Send initial connection acknowledgment
      socket.emit('connected', {
        message: 'Connected to Meme Coin Aggregator',
        socketId: socket.id,
        timestamp: Date.now(),
      });

      // Subscribe to server-side filtered streams
      socket.on('subscribe:filters', async (criteria: any = {}, ack?: (res: { ok: boolean }) => void) => {
        const normalized = this.normalizeFilters(criteria);
        const room = this.filterRoomId(normalized);

        // Track filter room config
        if (!this.filterRooms.has(room)) {
          this.filterRooms.set(room, normalized);
        }

        // Track socket membership
        if (!this.socketFilterRooms.has(socket.id)) {
          this.socketFilterRooms.set(socket.id, new Set());
        }
        this.socketFilterRooms.get(socket.id)!.add(room);

        socket.join(room);
        logger.debug('Client subscribed to filters', { socketId: socket.id, room, normalized });

        try {
          // Send initial snapshot from cached tokens (no new HTTP calls)
          const tokens = await this.tokenDataService.getCachedTokens();
          const filtered = this.applyFilters(tokens, normalized);
          socket.emit(CONSTANTS.WS_EVENTS.TOKENS_REFRESH, {
            tokens: filtered,
            count: filtered.length,
            timestamp: Date.now(),
          });
          if (ack) ack({ ok: true });
        } catch (error) {
          logger.error('Failed to send initial filtered snapshot', { error });
          if (ack) ack({ ok: false });
        }
      });

      socket.on('unsubscribe:filters', (ack?: (res: { ok: boolean }) => void) => {
        const rooms = this.socketFilterRooms.get(socket.id);
        if (rooms) {
          rooms.forEach((room) => {
            socket.leave(room);
            const size = this.io.sockets.adapter.rooms.get(room)?.size || 0;
            if (size === 0) {
              this.filterRooms.delete(room);
            }
          });
          this.socketFilterRooms.delete(socket.id);
        }
        logger.debug('Client unsubscribed from all filters', { socketId: socket.id });
        if (ack) ack({ ok: true });
      });
    });

    logger.info('WebSocket service initialized');
  }

  /**
   * Broadcast token update to all clients
   */
  public broadcastTokenUpdate(token: AggregatedToken): void {
    this.io.emit(CONSTANTS.WS_EVENTS.TOKEN_UPDATE, {
      token,
      timestamp: Date.now(),
    });
    // Also send to specific room for this token
    this.io.to(`token:${token.token_address}`).emit(CONSTANTS.WS_EVENTS.TOKEN_UPDATE, {
      token,
      timestamp: Date.now(),
    });

    logger.debug('Token update broadcasted', {
      address: token.token_address,
      clients: this.connectedClients.size,
    });
  }

  /**
   * Broadcast full token list refresh
   */
  public broadcastTokensRefresh(tokens: AggregatedToken[]): void {
    this.io.emit(CONSTANTS.WS_EVENTS.TOKENS_REFRESH, {
      tokens,
      count: tokens.length,
      timestamp: Date.now(),
    });

    logger.info('Token list refresh broadcasted', {
      count: tokens.length,
      clients: this.connectedClients.size,
    });
  }

  /**
   * Broadcast refresh to filter-based rooms
   */
  public broadcastTokensRefreshForFilters(tokens: AggregatedToken[]): void {
    if (this.filterRooms.size === 0) return;
    for (const [room, criteria] of this.filterRooms.entries()) {
      const filtered = this.applyFilters(tokens, criteria);
      this.io.to(room).emit(CONSTANTS.WS_EVENTS.TOKENS_REFRESH, {
        tokens: filtered,
        count: filtered.length,
        timestamp: Date.now(),
      });
    }

    logger.info('Filtered token list refresh broadcasted', {
      rooms: this.filterRooms.size,
      clients: this.connectedClients.size,
    });
  }

  /**
   * Broadcast price alert
   */
  public broadcastPriceAlert(token: AggregatedToken, changePercent: number): void {
    this.io.emit(CONSTANTS.WS_EVENTS.PRICE_ALERT, {
      token,
      changePercent,
      timestamp: Date.now(),
    });

    logger.info('Price alert broadcasted', {
      address: token.token_address,
      ticker: token.token_ticker,
      changePercent,
    });
  }

  /**
   * Broadcast volume spike
   */
  public broadcastVolumeSpike(token: AggregatedToken, spikePercent: number): void {
    this.io.emit(CONSTANTS.WS_EVENTS.VOLUME_SPIKE, {
      token,
      spikePercent,
      timestamp: Date.now(),
    });

    logger.info('Volume spike broadcasted', {
      address: token.token_address,
      ticker: token.token_ticker,
      spikePercent,
    });
  }

  /**
   * Get connected clients count
   */
  public getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Send message to specific client
   */
  public sendToClient(socketId: string, event: string, data: any): void {
    const socket = this.connectedClients.get(socketId);
    if (socket) {
      socket.emit(event, data);
    }
  }

  // Helpers
  private normalizeFilters(criteria: any): {
    sortBy: 'volume' | 'priceChange' | 'marketCap' | 'liquidity';
    period: '1h' | '24h' | '7d';
    minVolume?: number;
    minLiquidity?: number;
    limit: number;
  } {
    const sortBy = ['volume', 'priceChange', 'marketCap', 'liquidity'].includes(criteria?.sortBy)
      ? criteria.sortBy
      : 'volume';
    const period = ['1h', '24h', '7d'].includes(criteria?.period)
      ? criteria.period
      : '24h';
    const minVolume = typeof criteria?.minVolume === 'number' ? criteria.minVolume : undefined;
    const minLiquidity = typeof criteria?.minLiquidity === 'number' ? criteria.minLiquidity : undefined;
    const limit = typeof criteria?.limit === 'number' && criteria.limit > 0 ? Math.min(criteria.limit, 100) : 20;
    return { sortBy, period, minVolume, minLiquidity, limit } as any;
  }

  private filterRoomId(criteria: { sortBy: string; period: string; minVolume?: number; minLiquidity?: number; limit: number }): string {
    const parts = [
      `sort=${criteria.sortBy}`,
      `period=${criteria.period}`,
      `minVol=${criteria.minVolume ?? 0}`,
      `minLiq=${criteria.minLiquidity ?? 0}`,
      `limit=${criteria.limit}`,
    ];
    return `filters:${parts.join('&')}`;
  }

  private applyFilters(tokens: AggregatedToken[],
    criteria: { sortBy: 'volume' | 'priceChange' | 'marketCap' | 'liquidity'; period: '1h' | '24h' | '7d'; minVolume?: number; minLiquidity?: number; limit: number; }
  ): AggregatedToken[] {
    const filtered = this.aggregator.filterTokens(tokens, {
      minVolume: criteria.minVolume,
      minLiquidity: criteria.minLiquidity,
      minQualityScore: 50,
    });
    const sorted = this.aggregator.sortTokens(filtered, criteria.sortBy, criteria.period);
    return sorted.slice(0, criteria.limit);
  }
}
