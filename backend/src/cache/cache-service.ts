import { redis } from "./redis.js";
import { logger } from "../utils/logger.js";

export class CacheService {
  /**
   * Cache-aside pattern: read from cache, miss → fetch from source, write to cache.
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<T> {
    if (!redis) {
      return fetcher();
    }

    try {
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch (err) {
      logger.warn({ err, key }, "Cache read failed — fetching from source");
    }

    const value = await fetcher();

    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      logger.warn({ err, key }, "Cache write failed");
    }

    return value;
  }

  /**
   * Invalidate all keys matching a pattern.
   */
  async invalidate(pattern: string): Promise<void> {
    if (!redis) return;

    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.debug({ pattern, count: keys.length }, "Cache invalidated");
      }
    } catch (err) {
      logger.warn({ err, pattern }, "Cache invalidation failed");
    }
  }
}

export const cacheService = new CacheService();
