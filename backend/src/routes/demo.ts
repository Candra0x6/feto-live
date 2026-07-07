import type { FastifyInstance } from "fastify";
import { logger } from "../utils/logger.js";

/**
 * Demo routes — only available when KEEPER_DEMO_MODE=true.
 *
 * These endpoints let the frontend manually trigger events
 * for the keeper bot to process during hackathon demos.
 */
export async function demoRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/demo/trigger — simulate a match event
  app.post("/api/demo/trigger", async (req, reply) => {
    if (process.env.KEEPER_DEMO_MODE !== "true") {
      return reply.status(403).send({ error: "Demo mode not enabled" });
    }

    const event = req.body as Record<string, unknown>;

    if (!event.type || !event.fixture_id) {
      return reply.status(400).send({
        error: "Missing required fields: type, fixture_id",
      });
    }

    logger.info({ event }, "Demo trigger: event received");

    // Forward to keeper via HTTP (keeper metrics server)
    const keeperUrl = `http://localhost:${process.env.KEEPER_HEALTH_PORT || 9090}/trigger`;
    try {
      await fetch(keeperUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch (err) {
      logger.warn({ err }, "Keeper not reachable — event not forwarded");
    }

    return reply.status(202).send({
      status: "accepted",
      message: "Event forwarded to keeper",
    });
  });

  // GET /api/demo/keeper-status — show keeper health
  app.get("/api/demo/keeper-status", async (_req, reply) => {
    const keeperUrl = `http://localhost:${process.env.KEEPER_HEALTH_PORT || 9090}/health`;
    try {
      const resp = await fetch(keeperUrl);
      if (resp.ok) {
        const data = (await resp.json()) as Record<string, unknown>;
        return reply.send({ keeper: "connected", ...data });
      }
      return reply.send({ keeper: "unreachable", status: resp.status });
    } catch {
      return reply.send({ keeper: "unreachable" });
    }
  });

  // GET /api/demo/keeper-metrics — show keeper metrics
  app.get("/api/demo/keeper-metrics", async (_req, reply) => {
    const keeperUrl = `http://localhost:${process.env.KEEPER_HEALTH_PORT || 9090}/metrics`;
    try {
      const resp = await fetch(keeperUrl);
      if (resp.ok) {
        return reply.send(await resp.json());
      }
      return reply.status(502).send({ error: "keeper unreachable" });
    } catch {
      return reply.status(502).send({ error: "keeper unreachable" });
    }
  });
}
