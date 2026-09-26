import Redis from 'ioredis';
import { env } from './env';

function formatRedisUrl(raw: string): string {
  let url = (raw || '').trim();
  if (url.startsWith('https://')) {
    url = url.replace('https://', 'rediss://');
  } else if (url.startsWith('http://')) {
    url = url.replace('http://', 'redis://');
  } else if (url.startsWith('//')) {
    url = `rediss:${url}`;
  } else if (!url.startsWith('redis://') && !url.startsWith('rediss://')) {
    url = `rediss://${url}`;
  }
  return url;
}

const formattedUrl = formatRedisUrl(env.REDIS_URL);
const isTls = formattedUrl.startsWith('rediss://') || formattedUrl.includes('upstash.io');

export const redis = new Redis(formattedUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  tls: isTls ? { rejectUnauthorized: false } : undefined,
  retryStrategy(times) {
    if (times > 8) {
      console.warn('⚠️ Redis unreachable after multiple retries. Using in-memory fallback.');
      return null; // Stop reconnection spam
    }
    return Math.min(times * 1000, 5000);
  },
});

redis.connect().catch((err) => {
  console.warn('⚠️ Initial Redis connection failed:', err.message);
});

redis.on('error', (err: any) => {
  console.error('Redis error:', err?.message || err);
});

redis.on('connect', () => {
  console.log('✅ Redis connected successfully');
});
