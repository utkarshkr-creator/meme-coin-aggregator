import request from 'supertest';
import { createApp } from '../../src/app';
import { CacheService } from '../../src/services/cache.service';

describe('Load Testing', () => {
  let app: any;
  let cacheService: CacheService;
  let connected = false;

  beforeAll(async () => {
    app = createApp();
    cacheService = CacheService.getInstance();
    try {
      await cacheService.connect();
      // Verify connection is actually working
      await cacheService.set('connection:test', 'ok', 10);
      await cacheService.del('connection:test');
      connected = true;
      console.log('✅ Redis connected successfully');
    } catch (e) {
      console.log('⚠️  Redis not available, skipping cache-dependent tests');
      connected = false;
    }
  });

  afterAll(async () => {
    try {
      if (connected) {
        await cacheService.disconnect();
      }
      // Give time for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('Throughput Tests', () => {
    it('should handle 50 concurrent health check requests', async () => {
      const startTime = Date.now();
      const requests = Array(50).fill(null).map(() =>
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      const successCount = responses.filter(r => r.status === 200).length;
      
      console.log(`\n📊 Load Test Results:`);
      console.log(`   Total requests: 50`);
      console.log(`   Successful: ${successCount}`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Avg response time: ${duration / 50}ms`);

      expect(successCount).toBeGreaterThan(40); // At least 80% success
      expect(duration).toBeLessThan(10000); // Under 10 seconds
    }, 15000);

    (connected ? it : it.skip)('should handle 30 concurrent API requests', async () => {
      const startTime = Date.now();
      const requests = Array(30).fill(null).map(() =>
        request(app).get('/api/tokens').query({ limit: 5 })
      );

      const responses = await Promise.allSettled(requests);
      const duration = Date.now() - startTime;

      const successCount = responses.filter(
        r => r.status === 'fulfilled' && r.value.status === 200
      ).length;

      console.log(`\n📊 API Load Test Results:`);
      console.log(`   Total requests: 30`);
      console.log(`   Successful: ${successCount}`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Avg response time: ${duration / 30}ms`);

      expect(responses.length).toBe(30);
      expect(successCount).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Stress Tests', () => {
    it('should handle burst traffic', async () => {
      const bursts = 5;
      const requestsPerBurst = 10;
      let totalSuccess = 0;

      for (let burst = 0; burst < bursts; burst++) {
        const requests = Array(requestsPerBurst).fill(null).map(() =>
          request(app).get('/health')
        );

        const responses = await Promise.all(requests);
        totalSuccess += responses.filter(r => r.status === 200).length;

        // Small delay between bursts
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`\n🌊 Burst Test Results:`);
      console.log(`   Bursts: ${bursts}`);
      console.log(`   Requests/burst: ${requestsPerBurst}`);
      console.log(`   Total success: ${totalSuccess}/${bursts * requestsPerBurst}`);

      expect(totalSuccess).toBeGreaterThan(30); // At least 60% success
    }, 20000);

    it('should recover from sustained load', async () => {
      const duration = 5000; // 5 seconds
      const interval = 100; // Request every 100ms
      const startTime = Date.now();
      let successCount = 0;
      let totalRequests = 0;

      while (Date.now() - startTime < duration) {
        totalRequests++;
        try {
          const response = await request(app).get('/health');
          if (response.status === 200) successCount++;
        } catch (error) {
          // Request failed
        }
        await new Promise(resolve => setTimeout(resolve, interval));
      }

      console.log(`\n⏱️  Sustained Load Test:`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Total requests: ${totalRequests}`);
      console.log(`   Successful: ${successCount}`);
      console.log(`   Success rate: ${((successCount / totalRequests) * 100).toFixed(2)}%`);

      expect(successCount).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Cache Performance Under Load', () => {
    (connected ? it : it.skip)('should handle rapid cache operations', async () => {
      const operations = 100;
      const startTime = Date.now();

      // Batch set operations
      const setPromises = [];
      for (let i = 0; i < operations; i++) {
        setPromises.push(
          cacheService.set(`load:test:${i}`, { data: i }, 60)
            .catch(err => console.error(`Set error for key ${i}:`, err.message))
        );
      }

      await Promise.allSettled(setPromises);

      // Batch get operations
      const readPromises = [];
      for (let i = 0; i < operations; i++) {
        readPromises.push(
          cacheService.get(`load:test:${i}`)
            .catch(err => console.error(`Get error for key ${i}:`, err.message))
        );
      }

      await Promise.allSettled(readPromises);

      const duration = Date.now() - startTime;

      console.log(`\n💾 Cache Load Test:`);
      console.log(`   Operations: ${operations * 2} (set + get)`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Avg op time: ${duration / (operations * 2)}ms`);

      // Cleanup
      const cleanupPromises = [];
      for (let i = 0; i < operations; i++) {
        cleanupPromises.push(
          cacheService.del(`load:test:${i}`).catch(() => {})
        );
      }
      await Promise.allSettled(cleanupPromises);

      expect(duration).toBeLessThan(5000); // Should complete in 5 seconds
    }, 15000);

    (connected ? it : it.skip)('should handle cache key pattern deletion under load', async () => {
      // Create many keys
      const setPromises = [];
      for (let i = 0; i < 50; i++) {
        setPromises.push(
          cacheService.set(`pattern:test:${i}`, { data: i }, 60)
            .catch(() => {})
        );
      }
      await Promise.allSettled(setPromises);

      const startTime = Date.now();
      await cacheService.delPattern('pattern:test:*');
      const duration = Date.now() - startTime;

      console.log(`\n🗑️  Pattern Delete Performance:`);
      console.log(`   Keys deleted: ~50`);
      console.log(`   Duration: ${duration}ms`);

      expect(duration).toBeLessThan(2000);
    }, 10000);
  });

  describe('Response Time Tests', () => {
    it('should have acceptable p95 response times', async () => {
      const requests = 20;
      const responseTimes: number[] = [];

      for (let i = 0; i < requests; i++) {
        const start = Date.now();
        await request(app).get('/health');
        responseTimes.push(Date.now() - start);
      }

      responseTimes.sort((a, b) => a - b);
      const p50 = responseTimes[Math.floor(requests * 0.5)];
      const p95 = responseTimes[Math.floor(requests * 0.95)];
      const p99 = responseTimes[Math.floor(requests * 0.99)];

      console.log(`\n📈 Response Time Percentiles:`);
      console.log(`   p50: ${p50}ms`);
      console.log(`   p95: ${p95}ms`);
      console.log(`   p99: ${p99}ms`);

      expect(p95).toBeLessThan(1000); // p95 under 1 second
    }, 30000);
  });
});