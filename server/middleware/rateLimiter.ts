import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const stores: { [bucket: string]: RateLimitStore } = {};

export function createRateLimiter(options: { windowMs: number; max: number; name: string }) {
  const { windowMs, max, name } = options;
  if (!stores[name]) {
    stores[name] = {};
  }
  const store = stores[name];

  // Periodic cleanup of expired entries
  setInterval(() => {
    const now = Date.now();
    for (const key in store) {
      if (store[key].resetTime <= now) {
        delete store[key];
      }
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown-ip';
    const key = `${name}:${ip}`;
    const now = Date.now();

    if (!store[key] || store[key].resetTime <= now) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs,
      };
      return next();
    }

    store[key].count += 1;

    if (store[key].count > max) {
      const retryAfter = Math.ceil((store[key].resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: `Too many requests. Rate limit exceeded for ${name}. Please try again in ${retryAfter} seconds.`,
        status: 429,
        retryAfterSeconds: retryAfter,
      });
    }

    next();
  };
}

export const webhookRateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 100, name: 'webhooks' });
export const publicPortalRateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30, name: 'public_portal' });
export const authRateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 20, name: 'auth' });
export const settlementRateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 15, name: 'settlement' });
