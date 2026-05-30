import { Redis } from 'ioredis';

const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';

// Setup reusable Redis connection with auto-reconnect logic
export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

redisConnection.on('error', (err) => {
  console.error('Redis Connection Error:', err.message);
});
