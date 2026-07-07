import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { logger } from "../utils/logger.js";

interface WsClient {
  ws: WebSocket;
  subscriptions: Set<string>;
  lastHeartbeat: number;
}

/**
 * WebSocket server for real-time event broadcasting.
 * Clients subscribe to match channels to receive updates.
 */
class WsServer {
  private clients = new Map<string, WsClient>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Register WebSocket route on the Fastify instance.
   */
  register(app: FastifyInstance): void {
    app.get("/ws", { websocket: true }, (socket, request) => {
      const clientId = `${request.ip}:${Date.now()}`;
      const client: WsClient = {
        ws: socket,
        subscriptions: new Set(),
        lastHeartbeat: Date.now(),
      };

      this.clients.set(clientId, client);
      logger.info({ clientId, total: this.clients.size }, "WebSocket client connected");

      // Handle incoming messages
      socket.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());

          switch (message.type) {
            case "subscribe":
              if (message.channel) {
                client.subscriptions.add(message.channel);
                this.send(socket, {
                  type: "subscribed",
                  payload: { channel: message.channel },
                  timestamp: Date.now(),
                });
              }
              break;

            case "unsubscribe":
              if (message.channel) {
                client.subscriptions.delete(message.channel);
              }
              break;

            case "ping":
              client.lastHeartbeat = Date.now();
              this.send(socket, { type: "pong", payload: {}, timestamp: Date.now() });
              break;

            default:
              logger.warn({ type: message.type }, "Unknown WebSocket message type");
          }
        } catch (err) {
          logger.error({ err }, "WebSocket message parse error");
        }
      });

      // Handle disconnect
      socket.on("close", () => {
        this.clients.delete(clientId);
        logger.info({ clientId, total: this.clients.size }, "WebSocket client disconnected");
      });

      // Handle errors
      socket.on("error", (err) => {
        logger.error({ err, clientId }, "WebSocket client error");
        this.clients.delete(clientId);
      });

      // Send initial connection confirmation
      this.send(socket, {
        type: "connected",
        payload: { clientId },
        timestamp: Date.now(),
      });
    });

    // Start heartbeat checker
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, client] of this.clients) {
        if (now - client.lastHeartbeat > 30_000) {
          logger.info({ clientId: id }, "Client heartbeat timeout — closing");
          client.ws.close();
          this.clients.delete(id);
        }
      }
    }, 10_000);
  }

  /**
   * Broadcast an event to all clients subscribed to a channel.
   */
  broadcast(channel: string, type: string, payload: Record<string, unknown>): void {
    const message = JSON.stringify({ type, payload, timestamp: Date.now() });
    let sent = 0;

    for (const [, client] of this.clients) {
      if (client.subscriptions.has(channel) || client.subscriptions.has("*")) {
        try {
          client.ws.send(message);
          sent++;
        } catch (err) {
          logger.error({ err }, "WebSocket send error");
        }
      }
    }

    if (sent > 0) {
      logger.debug({ channel, type, sent }, "WebSocket broadcast");
    }
  }

  /**
   * Send a message to a single WebSocket.
   */
  private send(ws: WebSocket, message: unknown): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      logger.error({ err }, "WebSocket send error");
    }
  }

  /**
   * Clean up on server shutdown.
   */
  cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    for (const [, client] of this.clients) {
      client.ws.close();
    }
    this.clients.clear();
  }
}

export const wsServer = new WsServer();
