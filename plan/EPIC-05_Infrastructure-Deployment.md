# EPIC-05: Infrastructure & Deployment

**Goal:** Deploy all components to devnet, set up monitoring, and ensure demo readiness.

**Owner:** DevOps Engineer  
**Duration:** Days 5-13 (Sprint 1 + Sprint 3)  
**Dependencies:** EPIC-01 (contracts), EPIC-02 (frontend build), EPIC-03 (API deploy)  
**Deliverables:** dev.feto.live → monitoring → demo environment

> **✅ DELIVERED (July 6, 2026)** — Frontend deployed to Vercel, all deployment configs created, Sentry monitoring wired, demo readiness verified (17/19 checks pass).

---

## Infrastructure Diagram

```
                     ┌──────────────────┐
                     │   Cloudflare DNS  │
                     │  dev.feto.live    │
                     └────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │                                │
        ┌─────▼──────┐                 ┌──────▼──────┐
        │  Vercel    │                 │   Railway   │
        │ Frontend   │                 │  API + DB   │
        │ Next.js    │                 │  Fastify    │
        └────────────┘                 │  PostgreSQL │
                                       │  Redis      │
                                       └──────┬──────┘
                                              │
                        ┌─────────────────────┼─────────┐
                        │                     │         │
                  ┌─────▼──────┐       ┌──────▼──────┐  │
                  │  Helius    │       │   TxLINE    │  │
                  │  RPC/Geyser│       │   API/WS    │  │
                  └─────┬──────┘       └─────────────┘  │
                        │                               │
                  ┌─────▼──────┐                ┌───────▼─────┐
                  │  Solana    │                │ VPS         │
                  │  Devnet    │                │ Keeper Bot  │
                  └────────────┘                └─────────────┘
```

---

## Story 5.1: Devnet Deployment + Scripts

**ID:** FETO-501  
**Day:** 5 | **Effort:** 0.5 day | **Priority:** P0

### Acceptance Criteria
- [ ] All 3 programs deployed to Solana devnet
- [ ] `Anchor.toml` configured with correct devnet cluster and wallet
- [ ] Deployment scripts:
  ```bash
  # deploy-all.sh
  anchor build
  anchor deploy --program-name feto_factory --provider.cluster devnet
  anchor deploy --program-name feto_escrow --provider.cluster devnet
  anchor deploy --program-name feto_settle --provider.cluster devnet
  anchor run init-config --provider.cluster devnet
  ```
- [ ] `init-config` script that:
  - Creates Config PDA with authority, fee_recipient, txline_program
  - Sets min_bet = 1 USDC, max_bet = 1,000 USDC
  - Sets protocol_fee = 200 bps (2%)
- [ ] Program IDs logged after deployment
- [ ] Verify deployment with `anchor idl parse`
- [ ] IDL files generated and committed to repo
- [ ] TypeScript types generated from IDL
- [ ] `.env.example` with all program IDs

### Deployment Script Directory
```
scripts/
├── deploy-all.sh            # Full deployment
├── init-config.ts           # Initialize config
├── create-test-match.ts     # Create test match + markets
├── verify-deployment.ts     # Verify all programs deployed
└── helpers/
    ├── connection.ts        # Solana connection helper
    └── constants.ts         # Program IDs, PDA seeds
```

### Verify Deployment
```bash
# Check programs on devnet
solana program show <FACTORY_PROGRAM_ID> --url devnet
solana program show <ESCROW_PROGRAM_ID> --url devnet
solana program show <SETTLE_PROGRAM_ID> --url devnet

# Check config account
anchor account feto_factory.Config --provider.cluster devnet
```

### Dependencies
- Story 1.10 (contracts tested)

---

## Story 5.2: Frontend Hosting Setup

**ID:** FETO-502  
**Day:** 10 | **Effort:** 0.5 day | **Priority:** P1

### Acceptance Criteria
- [ ] Vercel project created linked to GitHub repo
- [ ] Environment variables configured:
  ```
  NEXT_PUBLIC_RPC_URL="https://api.devnet.solana.com"
  NEXT_PUBLIC_FACTORY_PROGRAM_ID="..."
  NEXT_PUBLIC_ESCROW_PROGRAM_ID="..."
  NEXT_PUBLIC_SETTLE_PROGRAM_ID="..."
  NEXT_PUBLIC_API_URL="https://api.dev.feto.live"
  NEXT_PUBLIC_WS_URL="wss://api.dev.feto.live/ws"
  ```
- [ ] `vercel.json` configured for SPA routing
- [ ] Build succeeds: `next build`
- [ ] Auto-deploy from `main` branch
- [ ] Preview deploys for PR branches
- [ ] Custom domain: `dev.feto.live`
- [ ] SSL certificate (auto via Vercel)
- [ ] Analytics: Vercel Analytics or LogRocket

### vercel.json
```json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "env": {
    "NEXT_PUBLIC_RPC_URL": "@rpc-url",
    "NEXT_PUBLIC_API_URL": "@api-url",
    "NEXT_PUBLIC_WS_URL": "@ws-url"
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

### Dependencies
- Story 2.1 (frontend scaffold), Story 5.3 (API URL)

---

## Story 5.3: API Deployment

**ID:** FETO-503  
**Day:** 10 | **Effort:** 0.5 day | **Priority:** P1

### Acceptance Criteria
- [ ] Railway project created (or Render/Heroku)
- [ ] PostgreSQL database provisioned (Railway managed)
- [ ] Redis instance provisioned (Upstash or Railway add-on)
- [ ] Environment variables configured for production:
  ```
  PORT=3001
  DATABASE_URL="postgresql://..."
  REDIS_URL="redis://..."
  TXLINE_API_URL="https://txline-dev.txodds.com"
  TXLINE_WS_URL="wss://txline-dev.txodds.com/ws/scores"
  SOLANA_RPC_URL="https://api.devnet.solana.com"
  PROGRAM_FACTORY_ID="..."
  PROGRAM_ESCROW_ID="..."
  PROGRAM_SETTLE_ID="..."
  CORS_ORIGIN="https://dev.feto.live"
  ```
- [ ] Database migrations run on deploy
- [ ] Health check endpoint confirmed working
- [ ] Auto-deploy from `main` branch
- [ ] Custom domain: `api.dev.feto.live`

### railway.json
```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Dependencies
- Story 3.10 (API complete)

---

## Story 5.4: Monitoring & Alerting

**ID:** FETO-504  
**Day:** 12 | **Effort:** 0.5 day | **Priority:** P2

### Acceptance Criteria
- [ ] Sentry error tracking for frontend and API
- [ ] Uptime monitoring:
  - Frontend: Vercel built-in
  - API: Better Uptime / UptimeRobot → checks `/health` every 60s
  - Keeper bot: UptimeRobot → checks `/health` on keeper VPS
- [ ] Custom monitoring:
  - Settlement latency tracker (event time → tx confirmation time)
  - Keeper settlement success rate dashboard
  - API error rate dashboard
- [ ] Alerts:
  - API error rate > 1% in 5 min → Discord/Telegram notification
  - Settlement latency > 60s → alert
  - Keeper bot down > 2 min → alert
  - High transaction failure rate > 10% → alert
  - Contract balance < 1000 USDC → alert
- [ ] Dashboard (Grafana or simple HTML):
  - Active users
  - Bets placed (last hour)
  - Markets created
  - Settlement latency (p50, p95, p99)
  - API response time (p50, p95)

### Alert Configuration
```typescript
const ALERTS = [
  {
    name: 'settlement-latency',
    metric: 'settlement_duration_seconds',
    threshold: 60,
    window: '5m',
    channel: 'discord',
  },
  {
    name: 'keeper-health',
    metric: 'keeper_ws_connection_status',
    threshold: 0,
    duration: '2m',
    channel: 'telegram',
  },
  {
    name: 'api-error-rate',
    metric: 'api_errors_total / api_requests_total',
    threshold: 0.01,
    window: '5m',
    channel: 'discord',
  },
];
```

### Dependencies
- Story 5.2, 5.3

---

## Story 5.5: Demo Environment + Fallback

**ID:** FETO-505  
**Day:** 13 | **Effort:** 0.5 day | **Priority:** P0

### Acceptance Criteria
- [ ] Demo environment verified:
  - Frontend loads on mobile + desktop
  - Wallet connect working (Phantom devnet)
  - Match browser shows test match data
  - End-to-end bet → settle → claim flow working
- [ ] Pre-recorded demo video (3 min) with screen recording:
  1. Browse live matches
  2. Select match, view markets
  3. Place bet with 3x leverage
  4. Keeper settles (or manual trigger)
  5. Claim payout
  6. Show on-chain verification
- [ ] Replay test data: cached TxLINE data for consistent demo
- [ ] Local validator setup for offline demo:
  ```bash
  # Start local validator with mock TxLINE
  solana-test-validator --clone PROGRAM_ID --url devnet
  # Deploy programs to local
  anchor deploy --provider.cluster localnet
  # Run with mock data
  ```
- [ ] Fallback plan documented:
  - If TxLINE API down → use cached replay data
  - If Solana devnet congested → use local validator
  - If frontend fails → show pre-recorded video
  - If keeper fails → manual settlement via admin key

### Demo Script
```
Demo Title: "Feto Live — Trustless Micro-Betting on Solana"
Duration: 3 minutes

1. 0:00-0:30 — Introduction: Show app, explain concept
2. 0:30-1:00 — Browse live World Cup match, show active micro-markets
3. 1:00-1:30 — Place bet on "Next Corner — Home" with 3x leverage
4. 1:30-2:00 — Show real-time match events from TxLINE feed
5. 2:00-2:30 — Corner awarded — keeper triggers settlement
6. 2:30-3:00 — Show on-chain settlement tx, payout received, trustless verification
```

### Dependencies
- Story 5.4, all EPIC-02

---

## Environment Configuration Summary

| Variable | Devnet (MVP) | Mainnet (V2) |
|----------|-------------|--------------|
| RPC URL | `https://api.devnet.solana.com` | `https://api.mainnet-beta.solana.com` |
| TxLINE API | `https://txline-dev.txodds.com` | `https://txline.txodds.com` |
| TxLINE WS | `wss://txline-dev.txodds.com/ws/scores` | `wss://txline.txodds.com/ws/scores` |
| Factory Program | Deployed to devnet | Deployed to mainnet |
| Escrow Program | Deployed to devnet | Deployed to mainnet |
| Settlement Program | Deployed to devnet | Deployed to mainnet |
| Database | Railway PostgreSQL | Managed PostgreSQL |
| Redis | Upstash | Upstash |
| Frontend | Vercel (frontend-nine-mocha-22.vercel.app) | Vercel (feto.live) |
| Keeper | VPS | Permissionless (anyone) |

---

## Infrastructure Costs (Hackathon)

| Component | Provider | Cost | Free Tier? |
|-----------|----------|------|-----------|
| Frontend | Vercel Hobby | $0 | ✅ Yes |
| API | Railway / Docker | $0 (local demo) | ✅ Yes |
| Database | Supabase Free | $0 | ✅ Yes |
| Redis | Upstash | $0 | ✅ Yes |
| RPC | Solana Devnet (free) | $0 | ✅ Yes |
| Monitoring | Sentry Free | $0 | ✅ Yes |
| Keeper | Docker / Local | $0 | ✅ Yes |
| Domain | Vercel auto-generated | $0 | ✅ Yes |
| **Total** | | **$0** | ✅ All free tiers |

---

## Story Completion Checklist

For each story, verify before marking complete:
- [ ] Deployment runs without errors
- [ ] Environment variables correctly configured
- [ ] Health checks passing
- [ ] SSL/TLS working
- [ ] Monitoring dashboards showing data
- [ ] Alert channels configured
- [ ] Documentation updated
- [ ] Fallback plan tested
