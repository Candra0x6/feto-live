import { FastifyRequest, FastifyReply } from "fastify";
import { redis } from "../cache/redis.js";
import { RATE_LIMITS } from "../utils/constants.js";
import { logger } from "../utils/logger.js";

interface RateLimitConfig {
  limit: number;
  window: number;
}

/**
 * Generic rate limiter using Redis.
 * Falls back to in-memory counting if Redis is unavailable.
 */
export function createRateLimiter(config: RateLimitConfig) {
  const inMemory = new Map<string, { count: number; resetAt: number }>();

  return async function rateLimit(request: FastifyRequest, reply: FastifyReply) {
    const wallet = (request as any).wallet || request.ip;
    const key = `rate:${wallet}:${request.url}`;

    try {
      if (redis) {
        // Redis-based rate limiting
        const current = await redis.incr(key);
        if (current === 1) await redis.expire(key, config.window);

        const ttl = await redis.ttl(key);

        reply.headers({
          "X-RateLimit-Limit": config.limit,
          "X-RateLimit-Remaining": Math.max(0, config.limit - current),
          "X-RateLimit-Reset": Math.max(0, ttl),
        });

        if (current > config.limit) {
          return reply.status(429).send({
            error: "Rate Limit Exceeded",
            message: `Max ${config.limit} requests per ${config.window}s. Try again in ${ttl}s.`,
          });
        }
      } else {
        // In-memory fallback
        const now = Date.now();
        let entry = inMemory.get(key);

        if (!entry || entry.resetAt < now) {
          entry = { count: 0, resetAt: now + config.window * 1000 };
          inMemory.set(key, entry);
        }

        entry.count++;
        reply.headers({
          "X-RateLimit-Limit": config.limit,
          "X-RateLimit-Remaining": Math.max(0, config.limit - entry.count),
          "X-RateLimit-Reset": Math.max(0, Math.ceil((entry.resetAt - now) / 1000)),
        });

        if (entry.count > config.limit) {
          return reply.status(429).send({
            error: "Rate Limit Exceeded",
            message: `Max ${config.limit} requests per ${config.window}s.`,
          });
        }
      }
    } catch {
      // If Redis is down, allow the request through
      logger.warn("Rate limiter unavailable — allowing request");
    }
  };
}
