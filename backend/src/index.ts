import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { initSentry } from "./monitoring/sentry.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRoutes } from "./routes/health.js";
import { matchRoutes } from "./routes/matches.js";
import { marketRoutes } from "./routes/markets.js";
import { betRoutes } from "./routes/bets.js";
import { userRoutes } from "./routes/users.js";
import { demoRoutes } from "./routes/demo.js";
import websocket from "@fastify/websocket";
import { wsServer } from "./ws/server.js";

async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
      transport:
        config.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
          : undefined,
    },
    bodyLimit: 1_048_576, // 1MB
  });

  // ── Plugins ──
  await app.register(cors, {
    origin: true, // Configure in production
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // Disabled for API
  });

  // ── WebSocket ──
  await (app as any).register(websocket);
  wsServer.register(app as any);

  // ── Error Handler ──
  app.setErrorHandler(errorHandler);

  // ── Routes ──
  await app.register(healthRoutes);
  await app.register(matchRoutes);
  await app.register(marketRoutes);
  await app.register(betRoutes);
  await app.register(userRoutes);

  // Demo routes (conditional — requires KEEPER_DEMO_MODE=true)
  if (process.env.KEEPER_DEMO_MODE === "true") {
    await app.register(demoRoutes);
    logger.info("🧪 Demo mode enabled — /api/demo/* routes active");
  }

  // ── Graceful Shutdown ──
  const signals = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down...`);
      wsServer.cleanup();
      await app.close();
      process.exit(0);
    });
  }

  return app;
}

async function main() {
  // Initialize Sentry (if configured)
  await initSentry();

  const app = await buildApp();

  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    logger.info(`🚀 Server running on http://localhost:${config.PORT}`);
  } catch (err) {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  }
}

main();
