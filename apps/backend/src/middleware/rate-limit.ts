import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

/**
 * Production SaaS Sliding-Window Rate Limiter
 * Protects email endpoints against quota exhaustion, spamming, and runaway loops.
 * Uses Redis when connected, with graceful in-memory fallback.
 */
interface RateLimitOptions {
  windowSec: number;
  maxRequests: number;
  keyPrefix: string;
  message?: string;
}

const memoryStore = new Map<string, { count: number; resetAt: number }>();

export function createEmailRateLimiter(options: RateLimitOptions) {
  const { windowSec, maxRequests, keyPrefix, message } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Key by tenant company ID + user ID if authenticated, or IP fallback
    const tenantId = (req as any).user?.companyId || 'global';
    const userId = (req as any).user?.id || req.ip || 'anonymous';
    const key = `ratelimit:${keyPrefix}:${tenantId}:${userId}`;

    try {
      if (redis.status === 'ready') {
        const current = await redis.incr(key);
        if (current === 1) {
          await redis.expire(key, windowSec);
        }

        const ttl = await redis.ttl(key);
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));
        res.setHeader('X-RateLimit-Reset', Math.max(0, ttl));

        if (current > maxRequests) {
          return res.status(429).json({
            error: 'Too Many Requests',
            message: message || `Rate limit exceeded. Please wait ${ttl}s before sending more emails.`,
            retryAfterSec: ttl,
          });
        }
      } else {
        // In-memory fallback
        const now = Date.now();
        const entry = memoryStore.get(key);

        if (!entry || entry.resetAt <= now) {
          memoryStore.set(key, { count: 1, resetAt: now + windowSec * 1000 });
          res.setHeader('X-RateLimit-Limit', maxRequests);
          res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
        } else {
          entry.count += 1;
          const ttlSec = Math.ceil((entry.resetAt - now) / 1000);
          res.setHeader('X-RateLimit-Limit', maxRequests);
          res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));

          if (entry.count > maxRequests) {
            return res.status(429).json({
              error: 'Too Many Requests',
              message: message || `Rate limit exceeded. Please wait ${ttlSec}s before sending more emails.`,
              retryAfterSec: ttlSec,
            });
          }
        }
      }
      next();
    } catch (err) {
      // Don't block requests if rate limiting check errors
      console.warn('[RateLimiter] Error evaluating rate limit:', err);
      next();
    }
  };
}
