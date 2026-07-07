import WebSocket from "ws";
import { logger } from "../utils/logger.js";
import type { TxlineEvent } from "./types.js";

type EventHandler = (event: TxlineEvent) => void;

/**
 * TxLINE WebSocket listener with auto-reconnect and deduplication.
 *
 * Connects to TxLINE's scores WebSocket, parses match events,
 * and emits them to registered handlers.
 */
export class TxlineWsListener {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnect = 20;
  private readonly url: string;
  private readonly handlers: EventHandler[] = [];
  private seenEvents = new Set<string>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;
  public connected = false;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Register an event handler.
   */
  onEvent(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Connect to TxLINE WebSocket.
   */
  async connect(): Promise<void> {
    if (!this.url) {
      logger.warn("TxLINE WS URL not configured — skipping WS connection");
      return;
    }

    try {
      this.intentionalClose = false;
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => this.onOpen();
      this.ws.onmessage = (msg) => this.onMessage(msg);
      this.ws.onclose = () => this.onClose();
      this.ws.onerror = (err: unknown) => this.onError(err instanceof Error ? err : new Error(String(err)));
    } catch (err) {
      logger.error({ err }, "Failed to create WebSocket connection");
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect intentionally.
   */
  disconnect(): void {
    this.intentionalClose = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.ws?.close();
    this.ws = null;
  }

  /**
   * Check if we've seen this event (dedup).
   */
  hasSeenEvent(event: TxlineEvent): boolean {
    const key = `${event.fixture_id}:${event.type}:${event.minute}:${event.timestamp}`;
    return this.seenEvents.has(key);
  }

  /**
   * Mark event as seen.
   */
  markSeen(event: TxlineEvent): void {
    const key = `${event.fixture_id}:${event.type}:${event.minute}:${event.timestamp}`;
    this.seenEvents.add(key);

    // Prune old entries (keep last 1000)
    if (this.seenEvents.size > 1000) {
      const first = this.seenEvents.values().next().value;
      if (first) this.seenEvents.delete(first);
    }
  }

  private onOpen(): void {
    this.connected = true;
    this.reconnectAttempts = 0;
    logger.info("TxLINE WebSocket connected");

    // Heartbeat every 30s
    this.heartbeatTimer = setInterval(() => {
      this.ws?.ping();
    }, 30_000);
  }

  private onMessage(msg: WebSocket.MessageEvent): void {
    try {
      const data = JSON.parse(msg.data.toString()) as TxlineEvent;

      // Deduplicate
      if (this.hasSeenEvent(data)) return;
      this.markSeen(data);

      logger.debug(
        { fixture: data.fixture_id, type: data.type, minute: data.minute },
        "TxLINE event received",
      );

      // Notify all handlers
      for (const handler of this.handlers) {
        try {
          handler(data);
        } catch (err) {
          logger.error({ err }, "Event handler error");
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed to parse WebSocket message");
    }
  }

  private onClose(): void {
    this.connected = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    if (this.intentionalClose) {
      logger.info("TxLINE WebSocket disconnected (intentional)");
      return;
    }

    logger.warn("TxLINE WebSocket disconnected — reconnecting...");
    this.scheduleReconnect();
  }

  private onError(err: Error): void {
    logger.error({ err }, "TxLINE WebSocket error");
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnect) {
      logger.error("Max reconnect attempts reached — giving up");
      return;
    }

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts++;
    logger.info({ delay, attempt: this.reconnectAttempts }, "Scheduling reconnect");

    setTimeout(() => this.connect(), delay);
  }
}
