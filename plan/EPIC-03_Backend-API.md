# EPIC-03: Backend API Services (Fastify + Prisma + Supabase)

**Goal:** Build the API layer connecting frontend to blockchain and databases — market data, bet building, user history, real-time events.

**Owner:** Backend Engineer  
**Duration:** Days 1-10 (Sprint 1 + Sprint 2)  
**Dependencies:** TxLINE API (external), EPIC-01 (contract IDs for tx building)  
**Deliverables:** Fastify server → dev deployment → REST + WebSocket endpoints

---

## Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Fastify Server (Node.js 20+)                  │
│                                                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │    Match    │ │   Market    │ │   Betting   │ │   User    │ │
│  │   Service   │ │   Service   │ │   Service   │ │  Service  │ │
│  │             │ │             │ │             │ │           │ │
│  │ • Fixtures  │ │ • CRUD      │ │ • Tx build  │ │ • Profile │ │
│  │ • TxLINE    │ │ • Odds      │ │ • Simulate  │ │ • History │ │
│  │ • WebSocket │ │ • Auto-gen  │ │ • Validate  │ │ • P&L     │ │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └─────┬─────┘ │
│         └───────────────┼───────────────┼───────────────┘       │
│                         │               │                       │
│              ┌──────────▼───────────────▼──────┐                │
│              │         Redis Cache             │                │
│              │  • odds:{id} → 10s TTL          │                │
│              │  • market:{id} → match duration  │                │
│              │  • user:{wallet}:pos → 1h TTL   │                │
│              │  • rate:{wallet}:{action} → 1m  │                │
│              └─────────────────────────────────┘                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         WebSocket Server (uWebSockets / Fastify WS)       │   │
│  │  Broadcasts: match:update, market:created, market:settled│   │
│  │             odds:update, position:liquidated              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Supabase (Managed PostgreSQL)                 │   │
│  │  • Prisma as ORM with connection pooling                  │   │
│  │  • Supabase Realtime (optional — channel-based WS)       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Supabase-Specific Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Database** | Supabase PostgreSQL (free tier: 500MB) | Managed PG, auto-backup, built-in auth, free tier for hackathon |
| **Connection pooling** | PgBouncer (transaction mode) via Supabase pool URL | Required by Prisma for serverless/connection-limited envs |
| **Migrations** | Prisma `directUrl` bypasses PgBouncer | Prisma schema migrations need direct DB access (DDL) |
| **Realtime** | Fastify WS (primary) / Supabase Realtime (optional) | Fastify WS gives us full control; Supabase Realtime can supplement for push notifications |
| **ORMs** | Prisma Client JS | Type-safe, auto-generated, excellent migrations |

### Supabase Connection Strategy

Prisma requires **two** connection strings when using PgBouncer:

```
# .env
DATABASE_URL="postgresql://project.ref.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5"   # Pooled (transaction mode)
DIRECT_URL="postgresql://project.ref.supabase.com:5432/postgres"                                        # Direct (for migrations)
```

- Port **6543** → Supabase's PgBouncer (transaction pooling)
- Port **5432** → Direct PostgreSQL (used only by Prisma Migrate)

---

## Story 3.1: Server Scaffold + Supabase Setup

**ID:** FETO-301  
**Day:** 1-3 | **Effort:** 1 day | **Priority:** P0

### Acceptance Criteria
- [ ] Fastify server initialized with TypeScript
- [ ] Project structure: `src/routes/`, `src/services/`, `src/db/`, `src/txline/`, `src/ws/`
- [ ] Prisma schema defined with Supabase PostgreSQL connection
- [ ] `DATABASE_URL` (pooled via PgBouncer) + `DIRECT_URL` (migrations) configured
- [ ] Initial migration run against Supabase PG
- [ ] Health check endpoint: `GET /health` → `{ status: "ok", timestamp }`
- [ ] CORS configured for frontend domains
- [ ] Environment variables via dotenv (`.env.example` committed)
- [ ] Error handler middleware
- [ ] Request logging with Pino
- [ ] Redis client initialized (Upstash)

### Environment Variables
```bash
# .env.example
PORT=3001
# Supabase: pooled via PgBouncer (transaction mode)
DATABASE_URL="postgresql://<user>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5"
# Supabase: direct connection for Prisma Migrate
DIRECT_URL="postgresql://<user>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
REDIS_URL="redis://..."
TXLINE_API_URL="https://txline-dev.txodds.com"
TXLINE_WS_URL="wss://txline-dev.txodds.com/ws/scores"
SOLANA_RPC_URL="https://api.devnet.solana.com"
PROGRAM_FACTORY_ID="..."
PROGRAM_ESCROW_ID="..."
PROGRAM_SETTLE_ID="..."
JWT_SECRET="..."
```

### Project Structure
```
src/
├── index.ts                 # Server entry point
├── config.ts               # Environment config
├── routes/
│   ├── health.ts           # Health check
│   ├── matches.ts          # Match endpoints
│   ├── markets.ts          # Market endpoints
│   ├── bets.ts             # Bet endpoints
│   ├── users.ts            # User endpoints
│   └── leaderboard.ts      # Leaderboard endpoints
├── services/
│   ├── match.service.ts
│   ├── market.service.ts
│   ├── betting.service.ts
│   ├── user.service.ts
│   └── leaderboard.service.ts
├── db/
│   ├── prisma/
│   │   └── schema.prisma
│   └── client.ts
├── txline/
│   ├── client.ts
│   ├── auth.ts
│   └── types.ts
├── ws/
│   ├── server.ts           # WebSocket server
│   ├── handlers.ts         # Event handlers
│   └── clients.ts          # Client connection manager
├── cache/
│   └── redis.ts
├── middleware/
│   ├── auth.ts
│   ├── rate-limit.ts
│   └── error-handler.ts
└── utils/
    ├── logger.ts
    └── constants.ts
```

### Dependencies
- None (parallel to EPIC-01)

---

## Story 3.2: Prisma Schema (Supabase PostgreSQL)

**ID:** FETO-308  
**Day:** 1-3 | **Effort:** 0.5 day | **Priority:** P0

### Acceptance Criteria
- [ ] Prisma schema with all models: User, Match, Market, Position, Event
- [ ] Migrations generated and applied against Supabase
- [ ] Indexes on frequently queried columns
- [ ] Enum types for status fields
- [ ] `directUrl` configured for migrations

### Prisma Schema
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")   // Supabase direct connection for migrations
}

enum MatchStatus {
  SCHEDULED
  LIVE
  PAUSED
  FINISHED
  ABANDONED
}

enum MarketType {
  NEXT_CORNER
  NEXT_CARD
  NEXT_SUBSTITUTION
  NEXT_GOAL_SCORER
  GOAL_IN_5_MIN
  ANY_GOAL
}

enum MarketStatus {
  OPEN
  LOCKED
  SETTLED
  CANCELLED
}

enum PositionStatus {
  ACTIVE
  LOCKED
  WON
  LOST
  LIQUIDATED
  CANCELLED
}

model User {
  id            String     @id @default(uuid())
  walletAddress String     @unique
  username      String?
  avatarUrl     String?
  createdAt     DateTime   @default(now())
  lastActive    DateTime   @updatedAt
  totalBets     Int        @default(0)
  totalWins     Int        @default(0)
  totalVolume   Decimal    @default(0) @db.Decimal(20, 6)
  totalPnl      Decimal    @default(0) @db.Decimal(20, 6)
  streakBest    Int        @default(0)
  streakCurrent Int        @default(0)
  badges        Json       @default("[]")
  positions     Position[]
}

model Match {
  id                String      @id @default(uuid())
  txlineMatchId     BigInt      @unique
  homeTeam          String
  awayTeam          String
  competition       String?
  venue             String?
  startTime         DateTime
  status            MatchStatus @default(SCHEDULED)
  homeScore         Int         @default(0)
  awayScore         Int         @default(0)
  currentMinute     Int?
  txlineFixtureHash String?
  chainMatchPda     String?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  markets           Market[]
}

model Market {
  id               String       @id @default(uuid())
  chainMarketId    BigInt
  matchId          String
  match            Match        @relation(fields: [matchId], references: [id])
  marketType       MarketType
  status           MarketStatus @default(OPEN)
  outcomes         Json         @default("[]")
  totalPool        Decimal      @default(0) @db.Decimal(20, 6)
  winningOutcome   Int?
  lockTime         DateTime?
  settlementTime   DateTime?
  protocolFeeBps   Int?
  leverageEnabled  Boolean      @default(false)
  maxLeverage      Int          @default(1)
  chainMarketPda   String?
  createdAt        DateTime     @default(now())
  positions        Position[]

  @@index([matchId])
  @@index([chainMarketId])
  @@index([status])
}

model Position {
  id               String         @id @default(uuid())
  chainPositionId  BigInt
  marketId         String
  market           Market         @relation(fields: [marketId], references: [id])
  userId           String?
  user             User?          @relation(fields: [userId], references: [id])
  walletAddress    String
  outcomeIndex     Int
  amount           Decimal        @db.Decimal(20, 6)
  leverage         Int            @default(1)
  collateral       Decimal        @db.Decimal(20, 6)
  potentialPayout  Decimal?       @db.Decimal(20, 6)
  oddsAtEntry      Decimal?       @db.Decimal(10, 4)
  status           PositionStatus @default(ACTIVE)
  claimed          Boolean        @default(false)
  payoutAmount     Decimal?       @db.Decimal(20, 6)
  chainPositionPda String?
  createdAt        DateTime       @default(now())
  settledAt        DateTime?

  @@index([walletAddress])
  @@index([marketId])
  @@index([status])
}

model Event {
  id            String   @id @default(uuid())
  matchId       String
  txlineEventId String?
  eventType     String
  team          String?
  player        String?
  minute        Int
  timestamp     DateTime
  merkleProof   Json?
  createdAt     DateTime @default(now())

  @@index([matchId])
  @@index([eventType])
}
```

### Dependencies
- Story 3.1

---

## Story 3.3: Redis Caching Layer

**ID:** FETO-307  
**Day:** 1-3 | **Effort:** 0.5 day | **Priority:** P0

### Acceptance Criteria
- [ ] Redis client configured with Upstash (or local for dev)
- [ ] Cache keys and TTLs defined:
  ```
  match:{id} → JSON (TTL: 10s for live, 5m for upcoming, 1h for finished)
  match:{id}:markets → JSON (TTL: match duration)
  market:{id} → JSON (TTL: market duration)
  odds:{marketId}:{outcomeIndex} → String (TTL: 10s)
  user:{wallet}:positions → JSON (TTL: 1m)
  leaderboard:{category}:{period} → Sorted Set (TTL: 5m)
  rate:{wallet}:{action} → Counter (TTL: 1m)
  ```
- [ ] Cache-aside pattern: read from cache, miss → fetch from DB, write to cache
- [ ] Cache invalidation on WebSocket events (odds change → flush odds cache)
- [ ] Rate limiting implemented via Redis

### Cache Utility
```typescript
class CacheService {
  private client: Redis;

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number,
  ): Promise<T> {
    const cached = await this.client.get(key);
    if (cached) return JSON.parse(cached);

    const value = await fetcher();
    await this.client.setex(key, ttl, JSON.stringify(value));
    return value;
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) await this.client.del(...keys);
  }
}
```

### Dependencies
- Story 3.1

---

## Story 3.4: Match Service + TxLINE Proxy

**ID:** FETO-302  
**Day:** 7 | **Effort:** 1 day | **Priority:** P0

### Acceptance Criteria
- [ ] `GET /api/matches` — List all matches with filters (live, upcoming, finished)
- [ ] `GET /api/matches/:id` — Match detail with scores, time, status
- [ ] TxLINE client for fixture fetching
- [ ] Match data cached in Redis (10s TTL for live matches)
- [ ] WebSocket event `match:update` broadcast on score/time changes
- [ ] Match status sync from TxLINE (auto-update score, minute)
- [ ] Historical match data available (finished matches)

### Endpoints
```typescript
// GET /api/matches
// Query: ?status=live&search=Brazil&page=1&limit=10
Response: {
  matches: Array<{
    id: string;
    txlineMatchId: number;
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    minute: number;
    status: 'scheduled' | 'live' | 'finished' | 'abandoned';
    activeMarkets: number;
    startTime: string;
    competition: string;
    venue: string;
  }>;
  total: number;
  page: number;
}

// GET /api/matches/:id
Response: {
  match: { ...matchDetail };
  events: TxLineEvent[];  // Recent match events
}
```

### Data Flow
```
TxLINE WebSocket → Match Service → Redis Cache → REST Response
                                     ↓
                               WebSocket Broadcast (match:update)
```

### Dependencies
- Story 3.1, TxLINE API

---

## Story 3.5: Market Service + Auto-Generation

**ID:** FETO-303  
**Day:** 7 | **Effort:** 1 day | **Priority:** P0

### Acceptance Criteria
- [ ] `GET /api/matches/:id/markets` — All active markets for a match
- [ ] `GET /api/markets/:id` — Single market detail with outcomes and odds
- [ ] Market auto-generation based on game state:
  - Next corner market: opens when previous corner resolved
  - Goal in 5 min: opens every 5 minutes
  - Next card: opens when previous card window expires
- [ ] Market lifecycle management:
  - Open → Locked (at lock_time) → Settled (via keeper) → Cancelled
- [ ] Odds calculation from TxODDS feed
- [ ] Market data cached in Redis (match duration TTL)
- [ ] WebSocket event `market:created` when new market auto-generated
- [ ] Max concurrent markets enforcement (3 per type)

### Endpoints
```typescript
// GET /api/matches/:id/markets
// Query: ?type=next_corner&status=open
Response: {
  markets: Array<{
    id: string;
    chainMarketId: number;
    marketType: 'next_corner' | 'next_card' | 'goal_5min' | ...;
    status: 'open' | 'locked' | 'settled' | 'cancelled';
    outcomes: Array<{
      label: string;
      oddsDecimal: number;
      oddsAmerican: string;
      impliedProbability: number;
      totalBets: number;
    }>;
    totalPool: number;
    lockTime: string;
    leverageEnabled: boolean;
    maxLeverage: number;
  }>;
}

// GET /api/markets/:id
Response: { market: { ...marketDetail, positions?: Position[] } }
```

### Auto-Generation Rules
```typescript
const autoGenerateMarkets = (match: Match) => {
  const rules = [
    // Next Corner: when previous corner market settles
    { type: 'next_corner', condition: hasResolved('next_corner'), delayMs: 5000 },
    // Goal in 5 min: at start of each 5-min window
    { type: 'goal_5min', condition: isNewWindow(5), delayMs: 0 },
    // Next Card: 3 min after previous card window expires
    { type: 'next_card', condition: hasExpired('next_card'), delayMs: 10000 },
    // Next Substitution: 5 min after previous sub window
    { type: 'next_substitution', condition: hasExpired('next_substitution'), delayMs: 15000 },
  ];

  for (const rule of rules) {
    if (rule.condition && activeCount(rule.type) < 3) {
      createMarket(match, rule.type);
    }
  }
};
```

### Dependencies
- Story 3.4

---

## Story 3.6: Betting Service + Transaction Building

**ID:** FETO-304  
**Day:** 8 | **Effort:** 1 day | **Priority:** P0

### Acceptance Criteria
- [ ] `POST /api/bets` — Build and simulate bet transaction
  - Validates market is open, amount in range, leverage valid
  - Builds Anchor transaction (user signs client-side)
  - Returns serialized transaction + marketId
  - Simulates transaction before returning
- [ ] `GET /api/bets/:id` — Bet status
- [ ] `POST /api/bets/:id/claim` — Claim payout (builds claim tx)
- [ ] Slippage check against current on-chain odds
- [ ] Position creation in local DB after successful on-chain tx
- [ ] Market pool tracking (update total_pool in DB)

### Bet Transaction Building
```typescript
async function buildPlaceBetTx(
  market: Market,
  outcomeIndex: number,
  amount: number, // In USDC (human readable)
  leverage: number,
  maxSlippageBps: number,
  userPubkey: PublicKey,
): Promise<{ tx: Transaction; marketId: number }> {
  // 1. Get current on-chain odds
  const onChainOdds = await getOnChainOdds(market.chainMarketId);
  const currentOdds = onChainOdds.outcomes[outcomeIndex].oddsDecimal;

  // 2. Validate slippage
  const requestedOdds = market.outcomes[outcomeIndex].oddsDecimal;
  const slippage = Math.abs(currentOdds - requestedOdds) / requestedOdds;
  if (slippage > maxSlippageBps / 10000) {
    throw new Error('SlippageExceeded');
  }

  // 3. Build transaction
  const amountLamports = amount * 1_000_000; // USDC has 6 decimals
  const collateral = amountLamports / leverage;

  const tx = await program.methods
    .placeBet(outcomeIndex, amountLamports, leverage, maxSlippageBps)
    .accounts({
      market: findMarketPDA(market.chainMarketId),
      position: findPositionPDA(market.chainMarketId, userPubkey),
      marketVault: findMarketVaultPDA(market.chainMarketId),
      user: userPubkey,
      config: CONFIG_PDA,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  // 4. Add compute budget
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));

  return { tx, marketId: market.chainMarketId };
}
```

### Rate Limiting
```typescript
// Max 10 bets/minute per wallet
const rateLimit = await redis.eval(`
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local ttl = tonumber(ARGV[2])
  local current = redis.call('GET', key) or 0
  if current >= limit then return 0 end
  redis.call('INCR', key)
  if current == 0 then redis.call('EXPIRE', key, ttl) end
  return 1
`, [`rate:${wallet}:bets`], [10, 60]);
```

### Dependencies
- Story 3.5, EPIC-01 (contract IDs)

---

## Story 3.7: User Service + History

**ID:** FETO-305  
**Day:** 10 | **Effort:** 0.5 day | **Priority:** P1

### Acceptance Criteria
- [ ] `GET /api/users/:wallet` — User profile (stats, created_at, etc.)
- [ ] `GET /api/users/:wallet/positions` — Active positions
- [ ] `GET /api/users/:wallet/history` — Bet history with pagination
  - Filter: status (won, lost, liquidated, cancelled)
  - Sort: date (desc), amount (desc), P&L (desc)
  - Pagination: cursor-based
- [ ] `GET /api/users/:wallet/stats` — Aggregated stats
  - Total bets, wins, losses, volume
  - Win rate, average odds, best streak
  - P&L by period (7d, 30d, all)
- [ ] `GET /api/users/:wallet/pnl` — P&L time series for chart (daily buckets)

### P&L Calculation
```typescript
// Historical P&L time series
async function getPnlTimeSeries(wallet: string, period: '7d' | '30d' | 'all') {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 365;
  const since = new Date(Date.now() - days * 86400000);

  const positions = await prisma.position.findMany({
    where: {
      walletAddress: wallet,
      settledAt: { gte: since },
      status: { in: ['won', 'lost', 'liquidated'] },
    },
    orderBy: { settledAt: 'asc' },
  });

  // Daily cumulative P&L
  const dailyPnL: Record<string, number> = {};
  let cumulative = 0;

  for (const pos of positions) {
    const day = pos.settledAt!.toISOString().split('T')[0];
    const pnl = pos.status === 'won'
      ? (pos.payoutAmount! - pos.amount)
      : -pos.amount;
    cumulative += pnl;
    dailyPnL[day] = cumulative;
  }

  return Object.entries(dailyPnL).map(([date, pnl]) => ({ date, pnl }));
}
```

### Dependencies
- Story 3.1 (database)

---

## Story 3.8: Leaderboard Service

**ID:** FETO-306  
**Day:** 10 | **Effort:** 0.5 day | **Priority:** P2

### Acceptance Criteria
- [ ] `GET /api/leaderboard` — Global rankings
- [ ] Categories: P&L (all-time), Weekly ROI, Most bets, Highest streak, Biggest win
- [ ] Redis sorted set for real-time leaderboard updates
- [ ] Refresh every 5 minutes
- [ ] Top 100 users returned
- [ ] Current user's rank included if not in top 100

### Leaderboard Implementation
```typescript
// Update leaderboard on settlement
async function updateLeaderboard(position: Position) {
  const pnl = position.status === 'won'
    ? position.payoutAmount! - position.amount
    : -position.amount;

  const multi = redis.multi();
  multi.zincrby('leaderboard:pnl:all', pnl, position.walletAddress);
  multi.zincrby('leaderboard:bets:count', 1, position.walletAddress);
  await multi.exec();
}

// GET /api/leaderboard?category=pnl&period=7d&limit=50
async function getLeaderboard(category: string, period: string, limit: number) {
  const key = `leaderboard:${category}:${period}`;
  const results = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');

  return results.map(([wallet, score], i) => ({
    rank: i + 1,
    wallet,
    score: Number(score),
  }));
}
```

### Dependencies
- Story 3.7

---

## Story 3.9: WebSocket Event Broadcasting

**ID:** FETO-309  
**Day:** 8 | **Effort:** 0.5 day | **Priority:** P1

### Acceptance Criteria
- [ ] WebSocket server (uWebSockets.js or fastify-websocket) initialized
- [ ] Client connection management: connect, disconnect, heartbeat
- [ ] Subscription channels per match: `match:{id}`
- [ ] Events broadcast to subscribed clients:
  - `match:update` — score, minute, status
  - `market:created` — new market available
  - `market:settled` — market resolved with outcome
  - `odds:update` — odds change
  - `position:liquidated` — user position liquidated
- [ ] Client reconnection handling (idempotent subscriptions)
- [ ] Rate limit: max 100 messages/sec per client
- [ ] Message format: `{ type: string, payload: any, timestamp: number }`

### WebSocket Message Types
```typescript
interface WsMessage {
  type: 'match:update'
     | 'market:created'
     | 'market:settled'
     | 'odds:update'
     | 'position:liquidated';
  payload: Record<string, any>;
  timestamp: number;
}

// Example: odds update
{
  type: 'odds:update',
  payload: {
    marketId: 'abc-123',
    outcomeIndex: 0,
    oddsDecimal: 2.50,
    oddsAmerican: '+150'
  },
  timestamp: 1704387600000
}

// Example: market settled
{
  type: 'market:settled',
  payload: {
    marketId: 'abc-123',
    winningOutcome: 0,
    totalPool: 2450.00,
    settlementTime: 1704387600000
  }
}
```

### Dependencies
- Story 3.4, Story 3.3

---

## Story 3.10: Rate Limiting + Security Middleware

**ID:** FETO-310  
**Day:** 11 | **Effort:** 0.5 day | **Priority:** P2

### Acceptance Criteria
- [ ] Rate limiting per wallet:
  - Bet placement: 10/min
  - API calls: 100/min (unauthenticated), 500/min (authenticated)
  - Claim: 5/min
- [ ] Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- [ ] CORS whitelist for frontend domains
- [ ] Request validation (JSON schema with Fastify schema validation)
- [ ] Helmet security headers
- [ ] Anti-spoof headers (X-Forwarded-For validation)
- [ ] Request size limit: 1MB

### Rate Limit Middleware
```typescript
async function rateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const wallet = request.headers['x-wallet'] as string;
  if (!wallet) {
    return reply.status(401).send({ error: 'Wallet header required' });
  }

  const key = `rate:${wallet}:${request.routeConfig.action || 'api'}`;
  const limit = request.routeConfig.limit || 100;
  const window = request.routeConfig.window || 60;

  const current = await redis.incr(key);
  if (current === 1) await redis.expire(key, window);

  reply.headers({
    'X-RateLimit-Limit': limit,
    'X-RateLimit-Remaining': Math.max(0, limit - current),
    'X-RateLimit-Reset': await redis.ttl(key),
  });

  if (current > limit) {
    return reply.status(429).send({ error: 'Rate limit exceeded' });
  }
}
```

### Dependencies
- Story 3.1, Story 3.3

---

## API Endpoint Summary

| Method | Endpoint | Auth | Rate Limit | Story |
|--------|----------|------|-----------|-------|
| GET | /health | None | 10/min | 3.1 |
| GET | /api/matches | None | 100/min | 3.4 |
| GET | /api/matches/:id | None | 100/min | 3.4 |
| GET | /api/matches/:id/markets | None | 100/min | 3.5 |
| GET | /api/markets/:id | None | 100/min | 3.5 |
| POST | /api/bets | Wallet | 10/min | 3.6 |
| GET | /api/bets/:id | Wallet | 100/min | 3.6 |
| POST | /api/bets/:id/claim | Wallet | 5/min | 3.6 |
| GET | /api/users/:wallet | None | 100/min | 3.7 |
| GET | /api/users/:wallet/positions | Wallet | 100/min | 3.7 |
| GET | /api/users/:wallet/history | None | 100/min | 3.7 |
| GET | /api/users/:wallet/stats | None | 100/min | 3.7 |
| GET | /api/users/:wallet/pnl | None | 100/min | 3.7 |
| GET | /api/leaderboard | None | 100/min | 3.8 |
| WS | /ws | Wallet | 100 msg/s | 3.9 |

---

## Story Completion Checklist

For each story, verify before marking complete:
- [ ] All endpoints return correct responses
- [ ] Input validation present
- [ ] Error responses are descriptive (not stack traces)
- [ ] Rate limiting applied
- [ ] Redis cache hit/miss working
- [ ] WebSocket events broadcast correctly
- [ ] Database migrations run cleanly
- [ ] `npm run build` passes without errors
