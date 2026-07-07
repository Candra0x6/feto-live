# EPIC-04: Keeper Bot — Automated Settlement Engine

**Goal:** Build a permissionless keeper bot that listens for TxLINE match events, fetches Merkle proofs, and submits `settle_market` transactions to Solana.

**Owner:** Backend Engineer / DevOps Engineer  
**Duration:** Days 4-12 (Sprint 1 + Sprint 3)  
**Dependencies:** EPIC-01 (settle_market instruction), TxLINE API  
**Deliverables:** Keeper bot binary → running on VPS → 99% settlement success rate

> **✅ DELIVERED (July 6, 2026)** — All 5 stories built, TypeScript compiles clean. Keeper keypair generated and configured. Wallet needs funding for tx fees.

---

## Architecture

```
TxLINE WebSocket (wss://txline-dev.../ws/scores)
       │
       │ Match events (corner, goal, card, sub)
       ▼
┌──────────────────┐
│   WS Listener    │  Story 4.1
│  Event Parser    │
└────────┬─────────┘
         │
         │ Event detected → Identify market
         ▼
┌──────────────────┐
│  Market Matcher  │  Match event → find open market
└────────┬─────────┘
         │
         │ Market found → Fetch proof
         ▼
┌──────────────────┐
│  Proof Fetcher   │  Story 4.2
│  GET /api/...    │
└────────┬─────────┘
         │
         │ Proof received → Build tx
         ▼
┌──────────────────┐
│  Tx Builder      │  Story 4.3
│  simulate → send │
└────────┬─────────┘
         │
         │ Tx submitted → Confirm
         ▼
┌──────────────────┐
│  Confirmation    │  Story 4.4
│  Watcher + Retry │
└────────┬─────────┘
         │
         │ Settled (or failed)
         ▼
┌──────────────────┐
│  Monitoring      │  Story 4.5
│  Metrics + Alert │
└──────────────────┘
```

---

## Story 4.1: WebSocket Listener + Event Parsing

**ID:** FETO-401  
**Day:** 4 | **Effort:** 0.5 day | **Priority:** P0

### Acceptance Criteria
- [ ] WebSocket connection to TxLINE scores endpoint
- [ ] Authentication flow (JWT) before connecting
- [ ] Connection management with auto-reconnect (exponential backoff: 1s, 2s, 4s, 8s, max 30s)
- [ ] Event parsing for all supported types:
  - `corner` — team that earned corner
  - `goal` — team + player that scored
  - `yellow_card` / `red_card` — team + player carded
  - `substitution` — team making change
  - `match_status` — half-time, full-time, abandoned
- [ ] Event deduplication (by event_id or merkle proof hash)
- [ ] Heartbeat/ping-pong to maintain connection
- [ ] Connection status logging (connect, disconnect, reconnect, error)

### Event Types
```typescript
interface TxlineEvent {
  type: 'corner' | 'goal' | 'yellow_card' | 'red_card' | 'substitution' | 'match_status';
  fixture_id: number;
  team: 'home' | 'away';
  player?: string;
  minute: number;
  timestamp: number;
  merkle_proof?: TxlineProof;
}

interface TxlineProof {
  root: string;
  proof_path: string[];
  leaf: string;
  signature: string;
}
```

### WS Client
```typescript
class TxlineWSClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 10;
  private jwt: string;

  async connect(): Promise<void> {
    this.jwt = await getGuestJwt();
    this.ws = new WebSocket(TXLINE_WS_URL);
    this.ws.on('open', () => this.onOpen());
    this.ws.on('message', (data) => this.onMessage(data));
    this.ws.on('close', () => this.onClose());
    this.ws.on('error', (err) => this.onError(err));
  }

  private onMessage(data: Buffer) {
    const event: TxlineEvent = JSON.parse(data.toString());

    // Deduplicate by checking seen event IDs
    const eventKey = `${event.fixture_id}:${event.type}:${event.minute}:${event.timestamp}`;
    if (this.seenEvents.has(eventKey)) return;
    this.seenEvents.add(eventKey);

    // Publish to event bus
    this.eventBus.emit('match:event', event);
  }

  private async onClose() {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.logger.warn(`WebSocket disconnected, reconnecting in ${delay}ms`);
    await sleep(delay);
    this.reconnectAttempts++;
    this.connect();
  }
}
```

### Test Cases
- TC-K01: Connect to TxLINE WebSocket
- TC-K02: Parse all supported event types
- TC-K03: Deduplicate identical events
- TC-K04: Reconnect on connection drop
- TC-K05: Authentication failure handling

### Dependencies
- TxLINE API access

---

## Story 4.2: Merkle Proof Fetching

**ID:** FETO-402  
**Day:** 5 | **Effort:** 0.5 day | **Priority:** P0

### Acceptance Criteria
- [ ] On receiving a match event, trigger proof fetch from TxLINE
- [ ] `GET /api/validation/proof` with event parameters
- [ ] Proof caching to avoid duplicate fetches (TTL: 5 min)
- [ ] Proof validation:
  - Root exists in on-chain TxLINE account
  - Proof path reconstructs root from leaf
  - Leaf matches expected event (fixture_id, event_type, timestamp)
- [ ] Handle proof fetch failures with retry (3 attempts, 1s apart)
- [ ] Graceful fallback if proof unavailable (log warning, skip event)

### Proof Fetching
```typescript
async function fetchMerkleProof(event: TxlineEvent): Promise<TxlineProof | null> {
  const cacheKey = `proof:${event.fixture_id}:${event.type}:${event.timestamp}`;

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Fetch from TxLINE
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(
        `${TXLINE_API_URL}/api/validation/proof?fixture_id=${event.fixture_id}&event_type=${event.type}&timestamp=${event.timestamp}`,
        {
          headers: {
            'Authorization': `Bearer ${this.jwt}`,
            'X-Api-Token': this.apiToken,
          },
        },
      );

      if (!response.ok) throw new Error(`Proof fetch failed: ${response.status}`);

      const data = await response.json();
      const proof: TxlineProof = data.proof;

      // Validate proof structure
      validateProofStructure(proof);

      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(proof));

      return proof;
    } catch (error) {
      if (attempt < 3) await sleep(1000 * attempt);
      else this.logger.error(`Proof fetch failed after 3 attempts: ${error}`);
    }
  }

  return null;
}
```

### Test Cases
- TC-K06: Fetch proof for valid event
- TC-K07: Cache hit returns proof (no API call)
- TC-K08: Proof fetch retry on failure
- TC-K09: Invalid proof structure → reject

### Dependencies
- Story 4.1, TxLINE API

---

## Story 4.3: Settlement Transaction Building + Submission

**ID:** FETO-403  
**Day:** 8-9 | **Effort:** 1 day | **Priority:** P0

### Acceptance Criteria
- [ ] On receiving proof, identify the matching on-chain market
  - Match fixture_id → find Match PDA
  - Event type → find Market PDA of same type
  - Verify market is in Locked status
- [ ] Build `settle_market` transaction with full CPI accounts
- [ ] Simulate transaction before sending
- [ ] Send with appropriate priority fee (dynamic estimation)
- [ ] Wait for confirmation (max 30 blocks)
- [ ] Handle race conditions (another keeper settled first)
- [ ] Log settlement attempt with transaction signature

### Settlement Transaction
```typescript
async function settleMarket(
  event: TxlineEvent,
  proof: TxlineProof,
  market: MarketAccount,
): Promise<string | null> {
  // 1. Map event to winning outcome
  const winningOutcome = mapEventToOutcome(event, market);
  if (winningOutcome === null) {
    this.logger.warn(`Cannot map event ${event.type} to market ${market.marketType}`);
    return null;
  }

  // 2. Build transaction
  const tx = await settleProgram.methods
    .settleMarket(winningOutcome, proof)
    .accounts({
      market: market.pda,
      match: market.matchPda,
      config: CONFIG_PDA,
      txlineProgram: TXLINE_PROGRAM_ID,
      txlineStatAccount: TXLINE_STAT_ACCOUNT,
      keeper: this.keeperWallet.publicKey,
    })
    .transaction();

  // 3. Add compute budget (generous for CPI)
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: estimatePriorityFee() }),
  );

  // 4. Simulate
  try {
    const simulation = await this.connection.simulateTransaction(tx, [this.keeperWallet]);
    if (simulation.value.err) {
      this.logger.error(`Simulation failed: ${simulation.value.err}`);
      return null;
    }
  } catch (error) {
    this.logger.error(`Simulation error: ${error}`);
    return null;
  }

  // 5. Sign and send
  const sig = await sendTransaction(tx, this.connection, { skipPreflight: false });
  this.logger.info(`Settlement tx sent: ${sig}`);

  return sig;
}
```

### Market Matching Logic
```typescript
function findMatchingMarket(event: TxlineEvent, markets: MarketAccount[]): MarketAccount | null {
  return markets.find(market => {
    if (market.status !== MarketStatus.Locked) return false;

    switch (market.marketType) {
      case MarketType.NextCorner:
        return event.type === 'corner';
      case MarketType.NextCard:
        return event.type === 'yellow_card' || event.type === 'red_card';
      case MarketType.NextSubstitution:
        return event.type === 'substitution';
      case MarketType.NextGoalScorer:
        return event.type === 'goal';
      case MarketType.GoalInNextNMinutes:
        return event.type === 'goal';
      default:
        return false;
    }
  });
}
```

### Winner Mapping
```typescript
function mapEventToOutcome(event: TxlineEvent, market: MarketAccount): number | null {
  const outcomes = market.outcomes;
  switch (market.marketType) {
    case MarketType.NextCorner:
      if (outcomes.length === 3) {
        // [Home, Away, Neither]
        return event.team === 'home' ? 0 : event.team === 'away' ? 1 : 2;
      }
      return event.team === 'home' ? 0 : 1; // [Home, Away]

    case MarketType.NextCard:
      return event.type === 'yellow_card' || event.type === 'red_card' ? 1 : 0; // [No, Yes]

    case MarketType.NextSubstitution:
      return 1; // [No, Yes]

    case MarketType.NextGoalScorer:
      const playerIndex = outcomes.findIndex(o => o.label === event.player);
      return playerIndex >= 0 ? playerIndex : outcomes.length - 1; // Last = "Other"

    case MarketType.GoalInNextNMinutes:
      return 1; // [No, Yes]

    default:
      return null;
  }
}
```

### Test Cases
- TC-K10: Build settlement tx for corner event
- TC-K11: Build settlement tx for goal event
- TC-K12: Build settlement tx for card event
- TC-K13: Market not found → skip
- TC-K14: Simulation fails → log and skip
- TC-K15: Race condition (already settled) → handle gracefully

### Dependencies
- Story 4.2, EPIC-01 (settle_market instruction)

---

## Story 4.4: Multi-Keeper Race Handling

**ID:** FETO-404  
**Day:** 9-10 | **Effort:** 0.5 day | **Priority:** P1

### Acceptance Criteria
- [ ] Handle `0x0` (already settled / account already in use) errors gracefully
- [ ] Check market status on-chain before sending tx (avoid pointless work)
- [ ] Backoff strategy if another keeper settles first:
  - On `MarketAlreadySettled` error → log and move on
  - Credit keeper reward to the successful keeper (not us)
- [ ] Stagger settlement attempts by random delay (0-500ms) to reduce collisions
- [ ] Keeper reward tracking: log which keeper settled each market
- [ ] Pending settlement queue: batch events for efficiency

### Race Handling
```typescript
async function attemptSettlement(event: TxlineEvent, proof: TxlineProof) {
  const market = findMatchingMarket(event, await fetchLockedMarkets());
  if (!market) return;

  // Check on-chain status before building tx
  const onChainMarket = await program.account.market.fetch(market.pda);
  if (onChainMarket.status === MarketStatus.Settled) {
    this.logger.info(`Market ${market.marketId} already settled by another keeper`);
    return;
  }

  // Random delay to reduce collisions
  await sleep(Math.random() * 500);

  const signature = await settleMarket(event, proof, market);
  if (signature) {
    this.logger.info(`Successfully settled market ${market.marketId}: ${signature}`);

    // Broadcast settlement event
    broadcastToApi({
      type: 'market:settled',
      payload: {
        marketId: market.marketId,
        winningOutcome: mapEventToOutcome(event, market),
        keeper: this.keeperWallet.publicKey.toString(),
        txSignature: signature,
      },
    });
  }
}
```

### Test Cases
- TC-K16: Two keepers attempt to settle same market → one succeeds, one logs
- TC-K17: Staggered backoff reduces collision rate
- TC-K18: Settlement queue processes multiple events in order

### Dependencies
- Story 4.3

---

## Story 4.5: Retry Logic + Monitoring

**ID:** FETO-405  
**Day:** 11-12 | **Effort:** 0.5 day | **Priority:** P2

### Acceptance Criteria
- [ ] Retry mechanism for failed settlement attempts (max 3 retries, 2s apart)
- [ ] Settlement success rate tracking (target: >95%)
- [ ] Metrics exposed via HTTP endpoint: `GET /metrics`
  - `keeper_events_received_total`
  - `keeper_settlements_successful_total`
  - `keeper_settlements_failed_total`
  - `keeper_settlement_duration_seconds`
  - `keeper_ws_connection_status` (0/1)
- [ ] Health check endpoint: `GET /health` → `{ status, uptime, lastSettlement }`
- [ ] Logging with structured JSON (pino)
- [ ] Alert on:
  - No settlement in last 60 seconds
  - >10% failure rate in 5 min window
  - WebSocket disconnected > 30s
  - High transaction failure rate
- [ ] Graceful shutdown (SIGTERM → close WS → finish pending → exit)
- [ ] Environment config: keeper private key from env, network, RPC endpoint

### Metrics Implementation
```typescript
// Prometheus-style metrics
const metrics = {
  eventsReceived: new Counter({ name: 'keeper_events_received_total', help: 'Total events received' }),
  settlementsSuccessful: new Counter({ name: 'keeper_settlements_successful_total', help: 'Successful settlements' }),
  settlementsFailed: new Counter({ name: 'keeper_settlements_failed_total', help: 'Failed settlements' }),
  settlementDuration: new Histogram({ name: 'keeper_settlement_duration_seconds', help: 'Settlement duration in seconds' }),
  wsConnected: new Gauge({ name: 'keeper_ws_connection_status', help: 'WebSocket connection status' }),
};

// Health check
server.get('/health', (req, res) => {
  res.json({
    status: ws.connected ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    lastSettlement: lastSettlementTime,
    settlementsToday: metrics.settlementsSuccessful.get(),
    wsConnected: ws.connected,
  });
});
```

### Configuration
```typescript
interface KeeperConfig {
  // Network
  rpcEndpoint: string;
  network: 'devnet' | 'mainnet';

  // Wallet
  keeperPrivateKey: string; // Base58 encoded

  // TxLINE
  txlineApiUrl: string;
  txlineWsUrl: string;

  // Behavior
  maxRetries: number;       // default: 3
  retryDelayMs: number;     // default: 2000
  maxSettlementsPerBlock: number; // default: 3

  // Monitoring
  healthPort: number;       // default: 9090
  metricsEnabled: boolean;  // default: true
}
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY .env ./.env
EXPOSE 9090
CMD ["node", "dist/keeper.js"]
```

### Test Cases
- TC-K19: Failed settlement retried up to 3 times
- TC-K20: Metrics endpoint returns correct values
- TC-K21: Health check returns status
- TC-K22: Graceful shutdown completes pending settlement
- TC-K23: Configuration loaded from environment

### Dependencies
- Story 4.4

---

## Deployment

### Running the Keeper
```bash
# Build
npm run build

# Run (devnet)
KEEPER_PRIVATE_KEY="base58..." \
RPC_ENDPOINT="https://api.devnet.solana.com" \
TXLINE_API_URL="https://txline-dev.txodds.com" \
TXLINE_WS_URL="wss://txline-dev.txodds.com/ws/scores" \
npm start

# Docker
docker build -t feto-keeper .
docker run -d --env-file .env feto-keeper
```

### Keeper Incentives
- 0.1% of market pool as keeper reward
- First successful settlement wins (permissionless design)
- Reward auto-distributed by `settle_market` instruction

---

## Story Completion Checklist

For each story, verify before marking complete:
- [ ] Acceptance criteria met
- [ ] Test cases passing
- [ ] Logging with appropriate levels (info, warn, error)
- [ ] Error handling for all failure modes
- [ ] No unhandled promise rejections
- [ ] Graceful shutdown handler
- [ ] Configuration from environment variables
- [ ] Docker-ready
