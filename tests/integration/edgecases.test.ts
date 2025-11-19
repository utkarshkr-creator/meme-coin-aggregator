import request from 'supertest';
import { createApp } from '../../src/app';
import { CacheService } from '../../src/services/cache.service';

describe('Edge Cases Tests', () => {
  let app: any;
  let cacheService: CacheService;

  beforeAll(async () => {
    app = createApp();
    cacheService = CacheService.getInstance();
    await cacheService.connect();
  });

  afterAll(async () => {
    await cacheService.disconnect();
  });

  describe('Cache Operations', () => {
    it('should handle cache write and read', async () => {
      const key = 'test:simple';
      await cacheService.set(key, { test: 'data' }, 10);
      const result = await cacheService.get(key);
      
      // Should be able to read what we wrote
      expect(result).toBeTruthy();
      await cacheService.del(key);
    });

    it('should handle missing keys', async () => {
      const result = await cacheService.get('nonexistent:key:12345');
      expect(result).toBeNull();
    });

    it('should handle cache expiration', async () => {
      const key = 'test:expire:fast';
      await cacheService.set(key, { data: 'test' }, 1);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const result = await cacheService.get(key);
      expect(result).toBeNull();
    }, 3000);
  });

  describe('Invalid Inputs', () => {
    it('should handle negative limit', async () => {
      const response = await request(app)
        .get('/api/tokens')
        .query({ limit: -10 });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    }, 30000);

    it('should handle very large limit', async () => {
      const response = await request(app)
        .get('/api/tokens')
        .query({ limit: 999999 });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(100);
    }, 30000);

    it('should handle invalid cursor', async () => {
      const response = await request(app)
        .get('/api/tokens')
        .query({ cursor: 'invalid_cursor' });

      expect(response.status).toBe(200);
    }, 30000);

    it('should handle invalid sortBy', async () => {
      const response = await request(app)
        .get('/api/tokens')
        .query({ sortBy: 'invalid' });

      expect(response.status).toBe(200);
    }, 30000);

    it('should handle invalid period', async () => {
      const response = await request(app)
        .get('/api/tokens')
        .query({ period: 'invalid' });

      expect(response.status).toBe(200);
    }, 30000);

    it('should handle malformed query parameters', async () => {
      const response = await request(app)
        .get('/api/tokens?limit=abc&minVolume=xyz');

      expect(response.status).toBe(200);
    }, 30000);
  });

  describe('Empty Results', () => {
    it('should handle search with no results', async () => {
      const response = await request(app)
        .get('/api/tokens/search/NONEXISTENT12345ABCDEF');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    }, 30000);

    it('should handle filters that return no results', async () => {
      const response = await request(app)
        .get('/api/tokens')
        .query({ minVolume: 9999999999 });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid token address format', async () => {
      const response = await request(app)
        .get('/api/tokens/invalid_format_123');

      expect([404, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('success', false);
    }, 30000);

    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/api/unknown/route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Rate Limiting', () => {
    it('should handle multiple requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      const successCount = responses.filter(r => r.status === 200).length;

      // Most should succeed
      expect(successCount).toBeGreaterThan(7);
    }, 15000);
  });
});