import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { logger } from "../utils/logger.js";
import { keeperConfig } from "./config.js";
import type { KeeperMetrics } from "./types.js";

/**
 * Simple HTTP health/metrics server for the keeper bot.
 *
 * Endpoints:
 *   GET /health  — 200 OK if running
 *   GET /metrics — JSON metrics snapshot
 *   POST /trigger — (demo mode only) manually inject an event
 */
export class MetricsServer {
  private server: Server;
  private getMetrics: () => KeeperMetrics;
  private manualTrigger?: (event: Record<string, unknown>) => void;

  constructor(getMetrics: () => KeeperMetrics) {
    this.getMetrics = getMetrics;
    this.server = createServer((req, res) => this.handle(req, res));
  }

  /**
   * Register a manual trigger handler (for demo mode).
   */
  onManualTrigger(handler: (event: Record<string, unknown>) => void): void {
    this.manualTrigger = handler;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(keeperConfig.healthPort, () => {
        logger.info(
          { port: keeperConfig.healthPort },
          "Keeper metrics server listening",
        );
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    try {
      switch (url.pathname) {
        case "/health":
          this.handleHealth(res);
          break;
        case "/metrics":
          this.handleMetrics(res);
          break;
        case "/trigger":
          this.handleTrigger(req, res);
          break;
        default:
          res.writeHead(404);
          res.end(JSON.stringify({ error: "not found" }));
      }
    } catch (err) {
      logger.error({ err }, "Metrics server error");
      res.writeHead(500);
      res.end(JSON.stringify({ error: "internal error" }));
    }
  }

  private handleHealth(res: ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
  }

  private handleMetrics(res: ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(this.getMetrics(), null, 2));
  }

  private handleTrigger(req: IncomingMessage, res: ServerResponse): void {
    if (!keeperConfig.demoMode) {
      res.writeHead(403);
      res.end(JSON.stringify({ error: "demo mode not enabled" }));
      return;
    }

    if (!this.manualTrigger) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "no trigger handler registered" }));
      return;
    }

    let body = "";
    req.on("data", (chunk: string) => (body += chunk));
    req.on("end", () => {
      try {
        const event = JSON.parse(body);
        this.manualTrigger!(event);
        res.writeHead(202);
        res.end(JSON.stringify({ status: "accepted" }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "invalid JSON" }));
      }
    });
  }
}
