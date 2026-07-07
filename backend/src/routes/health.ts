import { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { redis } from "../cache/redis.js";

interface HealthResponse {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  version: string;
  checks: {
    database: "healthy" | "unhealthy";
    redis: "healthy" | "unavailable" | "unhealthy";
  };
}

export async function healthRoutes(app: FastifyInstance) {
  app.get<{ Reply: HealthResponse }>("/health", async (_request, reply) => {
    const checks: HealthResponse["checks"] = {
      database: "unhealthy",
      redis: "unavailable",
    };
    let status: HealthResponse["status"] = "ok";

    // Check database
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = "healthy";
    } catch {
      checks.database = "unhealthy";
      status = "error";
    }

    // Check Redis
    if (redis) {
      try {
        await redis.ping();
        checks.redis = "healthy";
      } catch {
        checks.redis = "unhealthy";
        if (status !== "error") status = "degraded";
      }
    }

    return reply.status(status === "error" ? 503 : 200).send({
      status,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      checks,
    });
  });
}
