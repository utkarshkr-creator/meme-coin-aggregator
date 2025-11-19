// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
});

afterAll(async () => {
  // Give time for cleanup
  await new Promise(resolve => setTimeout(resolve, 500));
});
