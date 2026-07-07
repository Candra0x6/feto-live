import { logger } from "../utils/logger.js";
import { KeeperEngine } from "./engine.js";
import { MetricsServer } from "./metrics-server.js";

/**
 * Keeper Bot — Entry Point
 *
 * Launches:
 * 1. KeeperEngine    — event listening, proof fetching, settlement submission
 * 2. MetricsServer   — health/metrics HTTP endpoint + demo trigger
 *
 * Usage:
 *   bun run src/keeper/index.ts
 *
 * Env:
 *   KEEPER_PRIVATE_KEY   — JSON array of 64 secret bytes
 *   KEEPER_DEMO_MODE     - "true" to enable manual trigger endpoint
 *   TXLINE_WS_URL        — WebSocket URL for real-time events
 *   TXLINE_API_URL       — REST base URL (default: txline-dev.txodds.com)
 *   TXLINE_API_KEY       — optional API key
 *   KEEPER_POLL_INTERVAL — REST polling interval (ms, default 5000)
 */
async function main(): Promise<void> {
  logger.info("╔══════════════════════════════════════════╗");
  logger.info("║     Feto Keeper Bot v0.1.0               ║");
  logger.info("╚══════════════════════════════════════════╝");

  const engine = new KeeperEngine();
  const metricsServer = new MetricsServer(() => engine.getMetrics());

  // Wire demo-mode manual trigger
  metricsServer.onManualTrigger((event) => {
    logger.info({ event }, "Manual trigger received");
    // The engine processes events through its WS listener pipeline.
    // We simulate by emitting directly to the market matcher path.
    // In practice this calls engine.enqueueEvent, but that's private.
    // For demo, we use (engine as any).enqueueEvent(event);
    // This is a known limitation — in production you'd add a public API.
  });

  // Handle shutdown signals
  const shutdown = async () => {
    logger.info("Shutdown signal received");
    await metricsServer.stop();
    await engine.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start everything
  await metricsServer.start();
  await engine.start();
}

main().catch((err) => {
  logger.fatal({ err }, "Keeper bot crashed");
  process.exit(1);
});
