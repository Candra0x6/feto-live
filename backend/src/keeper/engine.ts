import { logger } from "../utils/logger.js";
import { keeperConfig } from "./config.js";
import { TxlineWsListener } from "./ws-listener.js";
import { MarketMatcher } from "./market-matcher.js";
import { SettlementService } from "./settlement.js";
import { ProofFetcher } from "./proof-fetcher.js";
import type { ProofData } from "./proof-fetcher.js";
import type { TxlineEvent, OnChainMarket, KeeperMetrics, SettlementResult } from "./types.js";

/**
 * Keeper engine — the core orchestration loop.
 *
 * Responsibilities:
 * 1. Listen for TxLINE events (via WS + REST fallback)
 * 2. Match events to open/locked markets
 * 3. Fetch Merkle proofs
 * 4. Submit settle_market transactions
 * 5. Handle race conditions (first-keeper-wins)
 * 6. Report metrics
 */
export class KeeperEngine {
  private wsListener: TxlineWsListener;
  private marketMatcher: MarketMatcher;
  private settlement: SettlementService;
  private proofFetcher: ProofFetcher;

  // Event queue (backpressure handling)
  private eventQueue: TxlineEvent[] = [];
  private processing = false;

  // In-flight tracking to avoid duplicate work
  private inflightSettlements = new Map<string, Promise<SettlementResult>>();

  // Metrics
  private metrics: KeeperMetrics = {
    eventsReceived: 0,
    eventsProcessed: 0,
    settlementsAttempted: 0,
    settlementsSuccessful: 0,
    settlementsFailed: 0,
    wsConnected: false,
    uptime: 0,
    lastSettlementTime: null,
    lastEventTime: null,
  };
  private startTime = Date.now();
  private shutdownRequested = false;

  constructor() {
    this.wsListener = new TxlineWsListener(keeperConfig.txlineWsUrl);
    this.marketMatcher = new MarketMatcher();
    this.settlement = new SettlementService();
    this.proofFetcher = new ProofFetcher();

    // Wire up WS events
    this.wsListener.onEvent((event) => this.enqueueEvent(event));
  }

  /**
   * Start the keeper engine.
   */
  async start(): Promise<void> {
    logger.info("🚀 Keeper engine starting...");
    logger.info({ config: this.sanitizedConfig() }, "Configuration");

    // Connect to TxLINE WebSocket
    await this.wsListener.connect();

    // Start the event processing loop
    this.startProcessingLoop();

    // Start REST polling (if configured)
    if (keeperConfig.restPollEnabled) {
      this.startRestPolling();
    }

    logger.info("✅ Keeper engine running");
  }

  /**
   * Graceful shutdown.
   */
  async stop(): Promise<void> {
    logger.info("Shutting down keeper engine...");
    this.shutdownRequested = true;
    this.wsListener.disconnect();

    // Wait for any in-flight settlements
    if (this.inflightSettlements.size > 0) {
      logger.info({ pending: this.inflightSettlements.size }, "Waiting for pending settlements...");
      await Promise.allSettled(Array.from(this.inflightSettlements.values()));
    }

    this.updateMetrics();
    logger.info(this.metrics, "Final keeper metrics");
    logger.info("Keeper engine stopped");
  }

  // ── Metrics ──────────────────────────────────────────────────────

  getMetrics(): KeeperMetrics {
    this.metrics.uptime = Math.floor((Date.now() - this.startTime) / 1000);
    this.metrics.wsConnected = this.wsListener.connected;
    return { ...this.metrics };
  }

  // ── Event queue ──────────────────────────────────────────────────

  private enqueueEvent(event: TxlineEvent): void {
    this.metrics.eventsReceived++;
    this.metrics.lastEventTime = new Date().toISOString();
    logger.debug({ fixture: event.fixture_id, type: event.type }, "Event queued");

    this.eventQueue.push(event);

    // Bound the queue
    if (this.eventQueue.length > 500) {
      const dropped = this.eventQueue.shift();
      logger.warn({ droppedEvent: dropped }, "Event queue overflow — dropped oldest");
    }

    // Trigger processing if idle
    if (!this.processing) {
      setImmediate(() => this.processQueue());
    }
  }

  private async startProcessingLoop(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (!this.shutdownRequested) {
      if (this.eventQueue.length > 0 && !this.processing) {
        await this.processQueue();
      }
      // Sleep to avoid busy-looping
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      // Batch: process up to 10 events at a time
      const batch = this.eventQueue.splice(0, 10);
      if (batch.length === 0) return;

      await Promise.allSettled(
        batch.map((event) => this.processEvent(event)),
      );
    } catch (err) {
      logger.error({ err }, "Event processing batch error");
    } finally {
      this.processing = false;
    }
  }

  // ── Event processing ─────────────────────────────────────────────

  private async processEvent(event: TxlineEvent): Promise<void> {
    try {
      this.metrics.eventsProcessed++;

      // 1. Get open/locked markets for this match
      const markets = await this.marketMatcher.getMarketsForMatch(
        event.fixture_id,
      );
      if (markets.length === 0) {
        logger.debug(
          { fixtureId: event.fixture_id },
          "No open markets for match — skipping",
        );
        return;
      }

      // 2. Match event to markets
      const matches = await this.marketMatcher.matchEventToMarkets(
        event,
        markets,
      );
      if (matches.length === 0) return;

      logger.info(
        { fixtureId: event.fixture_id, eventType: event.type, marketCount: matches.length },
        "Found matching markets for settlement",
      );

      // 3. Submit settlements (with race-condition dedup)
      for (const { market, proof } of matches) {
        await this.submitSettlement(market, proof);
      }
    } catch (err) {
      logger.error({ err, event }, "Failed to process event");
    }
  }

  // ── Settlement submission with race handling ─────────────────────

  private async submitSettlement(
    market: OnChainMarket,
    proof: ProofData,
  ): Promise<void> {
    const key = `${market.chainMarketId}`;

    // Check for in-flight settlement to same market
    if (this.inflightSettlements.has(key)) {
      logger.debug({ marketId: market.chainMarketId }, "Settlement already in-flight — skipping");
      return;
    }

    this.metrics.settlementsAttempted++;

    // Create the promise
    const promise = this.settlement
      .settleMarket(market, proof)
      .finally(() => {
        this.inflightSettlements.delete(key);
      });

    this.inflightSettlements.set(key, promise);

    const result = await promise;

    if (result.success) {
      this.metrics.settlementsSuccessful++;
      this.metrics.lastSettlementTime = new Date().toISOString();
    } else {
      this.metrics.settlementsFailed++;

      // Retry logic for transient errors
      if (this.isRetryableError(result.error)) {
        this.scheduleRetry(market, proof, 1);
      }
    }
  }

  // ── Retry logic ──────────────────────────────────────────────────

  private scheduleRetry(
    market: OnChainMarket,
    proof: ProofData,
    attempt: number,
  ): void {
    if (attempt > keeperConfig.maxRetries) {
      logger.warn(
        { marketId: market.chainMarketId, attempt },
        "Max retries reached for market",
      );
      return;
    }

    const delay = keeperConfig.retryDelayMs * 2 ** (attempt - 1);
    logger.info(
      { marketId: market.chainMarketId, attempt, delay },
      "Scheduling settlement retry",
    );

    setTimeout(async () => {
      if (this.shutdownRequested) return;
      this.metrics.settlementsAttempted++;
      const result = await this.settlement.settleMarket(market, proof);

      if (result.success) {
        this.metrics.settlementsSuccessful++;
        this.metrics.lastSettlementTime = new Date().toISOString();
      } else {
        this.metrics.settlementsFailed++;
        if (this.isRetryableError(result.error)) {
          this.scheduleRetry(market, proof, attempt + 1);
        }
      }
    }, delay);
  }

  // ── REST polling fallback ─────────────────────────────────────────

  private startRestPolling(): void {
    const pollInterval = keeperConfig.pollIntervalMs;

    logger.info({ pollInterval }, "Starting REST polling for events");

    const poll = async () => {
      if (this.shutdownRequested) return;

      try {
        // Poll the TxLINE REST API for recent events
        const resp = await fetch(
          `${keeperConfig.txlineApiUrl}/fixtures/live`,
          {
            headers: keeperConfig.txlineApiKey
              ? { Authorization: `Bearer ${keeperConfig.txlineApiKey}` }
              : undefined,
          },
        );

        if (resp.ok) {
          const events = (await resp.json()) as TxlineEvent[];
          for (const event of events) {
            if (!this.wsListener.hasSeenEvent(event)) {
              this.wsListener.markSeen(event);
              this.enqueueEvent(event);
            }
          }
        }
      } catch (err) {
        logger.error({ err }, "REST polling error");
      }

      setTimeout(poll, pollInterval);
    };

    setTimeout(poll, pollInterval);
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private isRetryableError(error?: string): boolean {
    if (!error) return false;
    const retryable = [
      "blockhash",
      "timeout",
      "would exceed",
      "rate limit",
      "429",
      "502",
      "503",
      "node is unhealthy",
    ];
    return retryable.some((s) => error.toLowerCase().includes(s));
  }

  private updateMetrics(): void {
    this.metrics.uptime = Math.floor((Date.now() - this.startTime) / 1000);
    this.metrics.wsConnected = this.wsListener.connected;
  }

  private sanitizedConfig(): Record<string, unknown> {
    return {
      rpcEndpoint: keeperConfig.rpcEndpoint,
      factoryProgramId: keeperConfig.factoryProgramId,
      wsConfigured: !!keeperConfig.txlineWsUrl,
      restPollEnabled: keeperConfig.restPollEnabled,
      demoMode: keeperConfig.demoMode,
      maxRetries: keeperConfig.maxRetries,
    };
  }
}
