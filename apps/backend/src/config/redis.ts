import Redis from 'ioredis';
import { env } from './env';

function resolveRedisUrl(): string {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  // If Upstash REST variables are provided, convert to rediss protocol
  if (restUrl && restToken) {
    const host = restUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `rediss://default:${restToken}@${host}:6379`;
  }

  let url = (env.REDIS_URL || '').trim();

  // If someone set REDIS_URL to the upstash host and also provided the token
  if (url.includes('upstash.io') && restToken && !url.includes('@')) {
    const host = url.replace(/^https?:\/\//, '').replace(/^\/\//, '').replace(/\/$/, '').replace(/:6379$/, '');
    return `rediss://default:${restToken}@${host}:6379`;
  }

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

const resolvedUrl = resolveRedisUrl();
const isTls = resolvedUrl.startsWith('rediss://') || resolvedUrl.includes('upstash.io');

export const redis = new Redis(resolvedUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  tls: isTls ? { rejectUnauthorized: false } : undefined,
  retryStrategy(times) {
    if (times > 8) {
      console.warn('⚠️ Redis unreachable after multiple retries. Using in-memory fallback.');
      return null;
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
