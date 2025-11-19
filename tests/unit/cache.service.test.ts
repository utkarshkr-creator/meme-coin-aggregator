import { CacheService } from '../../src/services/cache.service';

describe('CacheService', () => {
  let service: CacheService;

  beforeAll(async () => {
    service = CacheService.getInstance();
    await service.connect();
  });

  afterAll(async () => {
    await service.disconnect();
  });

  beforeEach(async () => {
    // Clean test keys
    await service.delPattern('test:*');
  });

  describe('get and set', () => {
    it('should set and get a value', async () => {
      const key = 'test:key1';
      const value = { test: 'data' };

      await service.set(key, value, 10);
      const result = await service.get(key);

      expect(result).toEqual(value);
    });

    it('should return null for non-existent key', async () => {
      const result = await service.get('test:nonexistent');
      expect(result).toBeNull();
    });

    it('should expire after TTL', async () => {
      const key = 'test:expiring';
      await service.set(key, 'data', 1); // 1 second TTL

      await new Promise(resolve => setTimeout(resolve, 1500));

      const result = await service.get(key);
      expect(result).toBeNull();
    }, 3000);
  });

  describe('del', () => {
    it('should delete a key', async () => {
      const key = 'test:delete';
      await service.set(key, 'data');
      await service.del(key);

      const result = await service.get(key);
      expect(result).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true for existing key', async () => {
      const key = 'test:exists';
      await service.set(key, 'data');

      const exists = await service.exists(key);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const exists = await service.exists('test:notexists');
      expect(exists).toBe(false);
    });
  });

  describe('rate limiting', () => {
    it('should increment rate limit counter', async () => {
      const key = 'test:ratelimit';

      const count1 = await service.incrementRateLimit(key, 10);
      const count2 = await service.incrementRateLimit(key, 10);

      expect(count1).toBe(1);
      expect(count2).toBe(2);
    });
  });
});
