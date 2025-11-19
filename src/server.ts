import http from 'http';
import { Server as SocketServer } from 'socket.io';
import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { CacheService } from './services/cache.service';
import { WebSocketService } from './services/websocket.service';
import { DataRefreshJob } from './jobs/dataRefresh.job';

async function startServer() {
  try {
    // Initialize cache
    const cacheService = CacheService.getInstance();
    await cacheService.connect();
    logger.info('Redis connected successfully');

    // Create Express app
    const app = createApp();

    // Create HTTP server
    const httpServer = http.createServer(app);
    // Initialize Socket.io
    const io = new SocketServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    // Initialize WebSocket service
    const wsService = WebSocketService.getInstance(io);
    wsService.initialize();
    DataRefreshJob.getInstance().initialize(wsService);
    logger.info('WebSocket service initialized');

    // Start server
    httpServer.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`Health check: http://localhost:${config.port}/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      httpServer.close(() => {
        logger.info('HTTP server closed');
      });
      await cacheService.disconnect();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();
