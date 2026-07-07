import Redis from "ioredis";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

let redis: Redis | null = null;

if (config.REDIS_URL) {
  redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) {
        logger.error("Redis connection failed after 3 retries — running without cache");
        return null; // Stop retrying
      }
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  redis.on("error", (err) => {
    logger.error({ err }, "Redis connection error");
  });

  redis.on("connect", () => {
    logger.info("Redis connected");
  });

  // Attempt connection (non-blocking)
  redis.connect().catch((err) => {
    logger.warn({ err }, "Redis connection failed — running without cache");
    redis = null;
  });
} else {
  logger.warn("REDIS_URL not set — running without cache");
}

export { redis };
