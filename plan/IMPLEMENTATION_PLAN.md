# Feto Live — Engineering Implementation Plan

**Product:** Feto Live — Real-time Micro-Event Prediction Markets on Solana  
**Version:** 1.0 | **Date:** 2026-07-06 | **Status:** Approved  
**Hackathon:** TxODDS World Cup Track ($18k pool)  
**Total Duration:** 14 days (4 sprints)

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [System Architecture](#2-system-architecture)
3. [Epic Breakdown](#3-epic-breakdown)
4. [Sprint Timeline](#4-sprint-timeline)
5. [Dependency Graph](#5-dependency-graph)
6. [Key Technical Decisions](#6-key-technical-decisions)
7. [Resource Allocation](#7-resource-allocation)
8. [Deliverable Checklist](#8-deliverable-checklist)
9. [Risk Register & Contingency](#9-risk-register--contingency)

---

## 1. Purpose & Scope

### 1.1 Purpose

This document translates the Feto Live PRD v2.0 into executable engineering work. It defines:

- **6 epics** covering all product components
- **40+ user stories** with acceptance criteria, effort estimates, and technical notes
- **4 sprint plan** aligned to the 14-day hackathon timeline
- **Dependency graph** identifying cross-agent blocking relationships
- **Deliverable checklist** for gate reviews at each sprint boundary

### 1.2 In Scope (MVP — Must Ship)

| Area | Deliverable |
|------|-------------|
| Smart Contracts | 3 Anchor programs (Market Factory, Escrow Manager, Settlement) deployed to devnet |
| TxLINE Integration | Subscription, WebSocket listener, Merkle proof CPI settlement |
| Frontend | Next.js dApp with match browser, market cards, bet modal, dashboard |
| Backend API | Node.js services for markets, bets, users, leaderboard |
| Keeper Bot | Permissionless settlement automation with proof fetching |
| Testing | 48+ tests (unit, integration, e2e), load test baseline |

### 1.3 Out of Scope (Post-Hackathon)

- $MBET token and staking
- Governance DAO
- Multi-oracle support
- Mobile native apps
- KYC/AML integration
- Insurance pool smart contract

---

## 2. System Architecture

### 2.1 High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Next.js 14 (App Router) + Tailwind + shadcn/ui           │  │
│  │  Zustand (global) + React Query (server) + Framer Motion  │  │
│  │  @solana/wallet-adapter-react (Phantom/Solflare/Backpack) │  │
│  │  Native WebSocket client for real-time events             │  │
│  └────────────────────┬──────────────────────────────────────┘  │
│                       │ HTTP/WSS                               │
├───────────────────────┼─────────────────────────────────────────┤
│              API LAYER (Node.js / Fastify)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Market   │ │ Betting  │ │Settlement│ │  User    │          │
│  │ Service  │ │ Service  │ │ Service  │ │ Service  │          │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │
│       └────────────┼────────────┼────────────┘                 │
│                    │            │                              │
│              ┌─────▼────────────▼──────┐                      │
│              │    Redis Cache Layer    │                      │
│              │ (odds, markets, rate    │                      │
│              │  limiting, sessions)    │                      │
│              └─────┬───────────────────┘                      │
├────────────────────┼──────────────────────────────────────────┤
│          BLOCKCHAIN LAYER (Solana Devnet)                      │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐     │
│  │ Market Factory │ │ Escrow Manager │ │  Settlement   │     │
│  │ (feto_factory) │ │ (feto_escrow)  │ │ (feto_settle) │     │
│  └───────┬────────┘ └───────┬────────┘ └───────┬────────┘     │
│          │                  │                  │              │
│          └──────────────────┼──────────────────┘              │
│                             │ CPI                             │
│                    ┌────────▼────────┐                        │
│                    │  TxLINE Oracle  │                        │
│                    │ (validate_stat) │                        │
│                    └─────────────────┘                        │
├───────────────────────────────────────────────────────────────┤
│                      DATA LAYER                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐   │
│  │  PostgreSQL   │ │   TxLINE     │ │   Helius RPC/Geyser │   │
│  │ (metadata,    │ │  WebSocket   │ │   (on-chain events) │   │
│  │  analytics)   │ │  + REST API  │ │                     │   │
│  └──────────────┘ └──────────────┘ └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Ownership

| Component | Tech Stack | Agent Owner | Stories |
|-----------|-----------|-------------|---------|
| Smart Contracts | Rust + Anchor 0.32+ | Smart Contract Engineer | EPIC-01 |
| Frontend | Next.js 14 + TypeScript + Tailwind | Frontend Engineer | EPIC-02 |
| Backend API | Node.js + Fastify + Prisma | Backend Engineer | EPIC-03 |
| Keeper Bot | Node.js + Typescript | Backend / DevOps | EPIC-04 |
| Infrastructure | Vercel + Railway + Helius + Supabase | DevOps Engineer | EPIC-05 |
| Testing | Anchor TS + Jest + Playwright + k6 | QA Engineer / All | EPIC-06 |

---

## 3. Epic Breakdown

| ID | Epic | Stories | Effort (days) | Sprint | Dependencies |
|----|------|---------|---------------|--------|-------------|
| **EPIC-01** | Smart Contracts (Anchor/Rust) | 10 | 10 | S1, S2 | None (foundation) |
| **EPIC-02** | Frontend (Next.js) | 8 | 8 | S2, S3 | EPIC-01 (contract addresses) |
| **EPIC-03** | Backend API Services | 8 | 7 | S1, S2 | None (can start early) |
| **EPIC-04** | Keeper Bot | 5 | 4 | S1, S3 | EPIC-01 (settlement ix) | ✅ Delivered
| **EPIC-05** | Infrastructure & Deployment | 5 | 3 | S1, S3 | EPIC-01, EPIC-02, EPIC-03 | ✅ Delivered
| **EPIC-06** | Testing & QA | 6 | 4 | S1, S2, S3 | All other epics |
| **Total** | | **42** | **36** | **14 days** | |

---

## 4. Sprint Timeline

### 4.1 Sprint Overview

```
Sprint 1 (Days 1-5): FOUNDATION
┌─────────────────────────────────────────────────────────────┐
│ EPIC-01: Smart Contracts (Days 1-5)                         │
│   Story 1.1-1.10 (see EPIC-01)                              │
│ EPIC-03: Backend API - Scaffold + DB (Days 1-3)              │
│   Story 3.1, 3.7, 3.8                                       │
│ EPIC-04: Keeper Bot - Research + Scaffold (Days 4-5)        │
│   Story 4.1, 4.2 ✅                                          │
│ EPIC-05: Infrastructure - Devnet Deploy (Day 5)              │
│   Story 5.1 ✅ (programs deployed)                           │
│ EPIC-06: Testing - Contract Unit Tests (Days 4-5)           │
│   Story 6.1                                                  │
├─────────────────────────────────────────────────────────────┤
│ GATE: Contracts deployed to devnet, TxLINE connection live   │
│       Basic bet→settle→claim flow working in Anchor tests    │
└─────────────────────────────────────────────────────────────┘

Sprint 2 (Days 6-10): FRONTEND + LEVERAGE
┌─────────────────────────────────────────────────────────────┐
│ EPIC-02: Frontend - All stories (Days 6-10)                  │
│   Story 2.1-2.9 ✅                                           │
│ EPIC-03: Backend API - Complete (Days 6-10)                  │
│   Story 3.2-3.6, 3.9, 3.10 ✅                                │
│ EPIC-04: Keeper Bot - Settlement Logic (Days 8-10)          │
│   Story 4.3, 4.4 ✅                                          │
│ EPIC-05: Infrastructure - Staging Deploy (Day 10)            │
│   Story 5.2 ✅ (Vercel frontend live)                        │
│   Story 5.3 🚧 (configs ready, deploy via Railway dashboard) │
│ EPIC-06: Testing - Integration + Frontend (Days 9-10)       │
│   Story 6.2, 6.3                                             │
├─────────────────────────────────────────────────────────────┤
│ GATE: Full frontend functional, end-to-end bet flow working  │
│       Leverage positions tested, settlement automated        │
└─────────────────────────────────────────────────────────────┘

Sprint 3 (Days 11-13): POLISH + TESTING
┌─────────────────────────────────────────────────────────────┐
│ EPIC-02: Frontend - Polish (Day 11)                         │
│   Story 2.8, 2.9                                            │
│ EPIC-04: Keeper Bot - Hardening (Day 11-12)                  │
│   Story 4.5 ✅                                               │
│ EPIC-05: Infrastructure - Monitoring (Day 12)                │
│   Story 5.4 ✅ (Sentry configs, uptime monitoring script)    │
│   Story 5.5 🚧 (demo readiness script, verify flow)          │
│ EPIC-06: Testing - All remaining (Days 11-13)                │
│   Story 6.3-6.6                                              │
├─────────────────────────────────────────────────────────────┤
│ GATE: 48+ tests passing, demo video recorded,                │
│       README + architecture diagrams complete                │
└─────────────────────────────────────────────────────────────┘

Sprint 4 (Day 14): SUBMISSION
┌─────────────────────────────────────────────────────────────┐
│ Morning:  Final bug fixes, devnet deployment verification    │
│ Afternoon: Submit to hackathon platform                      │
│ Evening:  Social media announcement                          │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Daily Cadence

| Time | Activity |
|------|----------|
| 09:00 | Async standup (Linear comments): What I did yesterday, what I'm doing today, blockers |
| 09:15 | Core team sync (if blockers exist) |
| 12:00 | Mid-day check-in: Progress against sprint goal |
| 17:00 | End-of-day commit + push |
| 17:30 | Daily demo (if feature completed) |

### 4.3 Sprint Ceremonies

- **Sprint Planning:** Day 1, Day 6, Day 11 (30min each)
- **Mid-Sprint Review:** Day 3, Day 8, Day 12 (15min async)
- **Sprint Retrospective:** Day 5, Day 10, Day 13 (20min)
- **Demo Day:** Day 5, Day 10, Day 13 (15min recorded)

---

## 5. Dependency Graph

### 5.1 Story-Level Dependencies

```
EPIC-01 (Smart Contracts)
├── 1.1 Project Scaffold ───────────────────── No deps
├── 1.2 Config Account ─────────────────────── Depends on: 1.1
├── 1.3 Match Account ──────────────────────── Depends on: 1.2
├── 1.4 Market Account ─────────────────────── Depends on: 1.3
├── 1.5 Place Bet + Position ───────────────── Depends on: 1.4
├── 1.6 TxLINE Integration ─────────────────── Depends on: 1.1 (independent scaffold)
├── 1.7 Settlement CPI ─────────────────────── Depends on: 1.5, 1.6
├── 1.8 Leverage Logic ─────────────────────── Depends on: 1.5
├── 1.9 Claim/Cancel/Edge Cases ────────────── Depends on: 1.7
└── 1.10 Contract Tests ────────────────────── Depends on: 1.9 (can start 1.5)

EPIC-02 (Frontend)
├── 2.1 Next.js Scaffold ───────────────────── No deps (parallel to EPIC-01)
├── 2.2 Match Browser ──────────────────────── Depends on: 2.1, 3.2
├── 2.3 Market Cards ───────────────────────── Depends on: 2.2, 3.3
├── 2.4 Bet Modal ──────────────────────────── Depends on: 2.3
├── 2.5 Leverage Toggle ────────────────────── Depends on: 2.4
├── 2.6 Dashboard ──────────────────────────── Depends on: 2.4, 3.5
├── 2.7 WebSocket Integration ──────────────── Depends on: 2.3, 3.9
├── 2.8 UI Polish ──────────────────────────── Depends on: 2.6, 2.7
└── 2.9 Error States ───────────────────────── Depends on: 2.6

EPIC-03 (Backend API)
├── 3.1 Server Scaffold ────────────────────── No deps (parallel to EPIC-01)
├── 3.2 Match Service ──────────────────────── Depends on: 3.1, TxLINE API
├── 3.3 Market Service ─────────────────────── Depends on: 3.2
├── 3.4 Betting Service ────────────────────── Depends on: 3.3, EPIC-01 (contract IDs)
├── 3.5 User Service ───────────────────────── Depends on: 3.1
├── 3.6 Leaderboard ────────────────────────── Depends on: 3.5
├── 3.7 Redis Cache ────────────────────────── Depends on: 3.1
├── 3.8 PostgreSQL Schema ──────────────────── Depends on: 3.1
├── 3.9 WebSocket Broadcasting ─────────────── Depends on: 3.2, 3.7
└── 3.10 Rate Limiting ─────────────────────── Depends on: 3.1, 3.7

EPIC-04 (Keeper Bot)
├── 4.1 WS Listener ────────────────────────── Depends on: TxLINE API
├── 4.2 Proof Fetching ─────────────────────── Depends on: 4.1
├── 4.3 Settlement Tx Build ────────────────── Depends on: 4.2, EPIC-01 (settle ix)
├── 4.4 Race Handling ──────────────────────── Depends on: 4.3
└── 4.5 Retry + Monitoring ─────────────────── Depends on: 4.4

EPIC-05 (Infra)
├── 5.1 Devnet Deploy ──────────────────────── Depends on: 1.10
├── 5.2 Frontend Hosting ───────────────────── Depends on: EPIC-02
├── 5.3 API Deploy ─────────────────────────── Depends on: EPIC-03
├── 5.4 Monitoring ─────────────────────────── Depends on: 5.2, 5.3
└── 5.5 Demo Env ───────────────────────────── Depends on: 5.4

EPIC-06 (Testing) — runs in parallel to all epics
├── 6.1 Contract Unit Tests ────────────────── Depends on: 1.5+
├── 6.2 Integration Tests ──────────────────── Depends on: 1.9, 4.4
├── 6.3 Frontend Tests ─────────────────────── Depends on: 2.6
├── 6.4 Load Tests ─────────────────────────── Depends on: 3.10, 4.5
├── 6.5 Edge Case Tests ────────────────────── Depends on: 1.9, 2.9
└── 6.6 Demo Script + Recording ────────────── Depends on: 5.5
```

### 5.2 Critical Path

The **critical path** for the hackathon is:

```
1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.7 → 1.9 → 1.10 (contract readiness)
                                 ↓
                          4.3 → 4.4 (keeper settlement)
                                 ↓
                          6.2 (integration tests passing)
                                 ↓
                          5.1 (devnet deploy)
                                 ↓
                          6.6 (demo recording)
```

**Parallel tracks that can proceed independently:**
- Frontend (EPIC-02) can build against mocked API data until EPIC-03 is ready
- Backend API (EPIC-03) can build against simulated contract responses until EPIC-01 is deployed
- Contract tests (6.1) can begin as soon as Story 1.5 compiles

---

## 6. Key Technical Decisions

### 6.1 Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Program separation** | 3 programs (Factory, Escrow, Settlement) | Modularity, upgrade isolation, audit scope separation |
| **Settlement model** | CPI to TxLINE `validate_stat` + Merkle proof | Trustless, no admin keys, cryptographically verifiable |
| **Leverage model** | Fixed liquidation threshold based on entry odds | Deterministic, simple to verify on-chain |
| **Oracle fallback** | Manual keeper trigger for demo | Hackathon timeline: TxLINE free tier may have latency |
| **Frontend state** | Zustand (global) + React Query (server) | Lightweight, no boilerplate, excellent cache invalidation |
| **API framework** | Fastify over Express | Better perf, built-in validation, TS-native |
| **Database** | Supabase (managed PostgreSQL) + Prisma + Redis (Upstash) | Supabase free tier for managed PG; Prisma for type-safe ORM; two connection URLs (pooled via PgBouncer, direct for migrations) |
| **RPC provider** | Helius Enhanced | Geyser for real-time event streaming, reliable for hackathon |
| **Hosting** | Vercel (frontend) + Railway (API) | Free tier available, quick deploys, built-in SSL |
| **Testing** | Anchor TS tests + Jest + Playwright | Covers all layers with familiar tooling |

### 6.2 Phased Feature Delivery

```
Day 1-3:  Core contracts (create match, market, place bet)
Day 4-5:   TxLINE settlement flow (the "magic")
Day 6-8:   Frontend with contract integration
Day 9-10:  Leverage + dashboard
Day 11-13: Polish, tests, docs
Day 14:    Submit
```

### 6.3 TxLINE Integration Strategy

For the hackathon, we target the **TxLINE World Cup Free Tier**:
- **Service Level 12** (real-time, no TxL purchase required)
- World Cup 2026 matches only
- Authentication via guest JWT + signed message API token

**Fallback Strategy:**
If TxLINE API is unavailable during demo, pre-record a demo video using cached match data and a local Solana validator with mock TxLINE program.

---

## 7. Resource Allocation

### 7.1 Agent Responsibilities

| Agent | Primary Epics | % Time | Key Deliverables |
|-------|--------------|--------|-----------------|
| **Smart Contract Engineer** | EPIC-01 | 60% | 3 Anchor programs, CPI integration |
| **Frontend Engineer** | EPIC-02 | 50% | Next.js dApp, wallet integration, UI |
| **Backend Engineer** | EPIC-03, EPIC-04 | 40% | API services, keeper bot, DB schema |
| **DevOps Engineer** | EPIC-05 | 20% | Deployment, monitoring, CI/CD |
| **QA Engineer** | EPIC-06 | 30% | Test suite, load testing, demo |
| **Product Manager (you)** | All oversight | 40% | Specs, coordination, sprint management, governance |

### 7.2 Shared Resources

| Resource | Purpose | Cost |
|----------|---------|------|
| Helius Enhanced RPC | Solana access + Geyser streaming | $49/mo (free tier for hackathon) |
| Vercel Pro | Frontend hosting | $20/mo (hobby tier free) |
| Railway | API hosting | ~$25/mo (starter) |
| Supabase | Managed PostgreSQL | Free tier (500MB) |
| Upstash Redis | Caching | $10/mo (free tier) |
| Sentry | Error tracking | Free tier |
| **Total** | | **~$0 (all free tiers for hackathon)** |

---

## 8. Deliverable Checklist

### 8.1 End of Sprint 1 (Day 5)

- [ ] Anchor scaffold with 3 programs compiling
- [ ] Config PDA initialized on devnet
- [ ] Match accounts creatable on-chain
- [ ] Markets creatable with outcomes
- [ ] Bets placable (binary, multi-outcome)
- [ ] TxLINE WebSocket connected and parsing events
- [ ] `settle_market` instruction with CPI to TxLINE
- [ ] Keeper bot scaffold — WebSocket listener + proof fetcher
- [ ] PostgreSQL schema migrated (users, matches, markets, positions)
- [ ] Basic unit tests passing for core instructions
- [ ] Programs deployed to devnet (`anchor deploy`)

### 8.2 End of Sprint 2 (Day 10)

- [ ] Full frontend: match browser, market cards, bet modal
- [ ] Wallet connect (Phantom, Solflare, Backpack)
- [ ] Bet placement flow: select → amount → confirm → tx
- [ ] Leverage toggle (2x, 3x, 5x) with liquidation threshold display
- [ ] Real-time odds display via WebSocket
- [ ] Position dashboard with active bets + history
- [ ] P&L chart (7d, 30d, all-time)
- [x] Keeper bot: automated settle_market tx building and submission
- [x] Backend API: all REST endpoints operational
- [ ] Integration tests covering full bet → settle → claim flow

### 8.3 End of Sprint 3 (Day 13)

- [ ] UI polish: loading states, animations, error handling
- [ ] All edge cases handled (market closed, VAR, slippage, etc.)
- [ ] 48+ tests passing (unit + integration + e2e)
- [ ] Load test baseline (100 req/min API, 50 concurrent bets)
- [ ] Monitoring dashboards live (Sentry, uptime, contract balances)
- [ ] Demo video recorded (3 min)
- [ ] README + architecture diagrams complete
- [x] Frontend deployed to Vercel (https://frontend-nine-mocha-22.vercel.app)
- [x] Deployment configs: vercel.json, Dockerfile, railway.json, docker-compose.yml
- [x] Sentry monitoring wired for frontend + backend
- [x] Demo readiness script: 17/19 checks pass
- [ ] Devnet deployment verified end-to-end

### 8.4 Submission Day (Day 14)

- [ ] Final devnet deploy with verified program IDs
- [ ] Frontend build passes (`next build`)
- [ ] Keeper bot running against devnet
- [x] Environment variables documented in `.env.example` (frontend + backend)
- [ ] All code pushed to GitHub
- [ ] Hackathon submission uploaded (video, repo, deck)
- [ ] Social media announcement live

---

## 9. Risk Register & Contingency

### 9.1 Top Risks

| Risk | Probability | Impact | Mitigation | Owner |
|------|-------------|--------|------------|-------|
| TxLINE API down during demo | Medium | Critical | Pre-recorded backup video; local validator with mock TxLINE | Backend |
| Smart contract compile error | Low | Critical | Continuous compilation checks; `anchor build` in CI | SC Engineer |
| Bet→settle CPI fails on devnet | Medium | High | Mock TxLINE program for local testing; extensive unit tests | SC Engineer |
| WebSocket disconnections | High | Low | Auto-reconnect with backoff; REST fallback | Frontend |
| Scope creep (V2 features) | High | Medium | Strict MVP definition; "parking lot" for non-critical ideas | PM |
| Team member unavailable | Low | Medium | Cross-train on critical paths; async-first communication | PM |
| Frontend/contract integration delays | Medium | High | Mock contract responses in API for parallel frontend dev | All |

### 9.2 Contingency Plan

If we fall behind schedule:

1. **Day 8 checkpoint:** If contracts aren't deployed, frontend uses mock API + simulated contract responses
2. **Day 10 checkpoint:** If leverage isn't working, ship without leverage (mark as V2)
3. **Day 12 checkpoint:** If keeper bot unreliable, use manual settlement via admin key (document as MVP limitation)
4. **Day 13 checkpoint:** If live demo unstable, use pre-recorded video as primary submission

### 9.3 MVP Bare Minimum

If everything goes wrong, the absolute minimum shippable product:

1. Smart contracts: create_market, place_bet, settle (manual/keeper), claim
2. Frontend: match browser, market list, bet placement, basic history
3. Backend: match/market/bet APIs
4. Working end-to-end demo on devnet with 1 match, 3 markets, 2 users

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-06 | Product Manager | Initial implementation plan from PRD v2.0 |

---

**Next Steps:** Each agent should read their assigned EPIC file for detailed story breakdowns and begin Sprint 1 work.
