# EPIC-06: Testing & QA

**Goal:** Achieve 48+ tests across all layers with comprehensive coverage of smart contract logic, API behavior, frontend flows, and edge cases.

**Owner:** QA Engineer (with contributions from all agents)  
**Duration:** Days 4-13 (Sprint 1 through Sprint 3)  
**Dependencies:** EPIC-01, EPIC-02, EPIC-03, EPIC-04  
**Deliverables:** Test suite → CI passing → Load test baseline → Demo-ready

---

## Test Strategy Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        TEST PYRAMID                              │
│                                                                  │
│                         ╱╲                                       │
│                        ╱  ╲                                     │
│                       ╱ E2E ╲           6.3, 6.5                │
│                      ╱   (5)  ╲          (Playwright)            │
│                     ╱──────────╲                                 │
│                    ╱ Integration╲       6.2, 6.4                 │
│                   ╯   (12-15)   ╰       (Anchor TS + k6)         │
│                  ╱──────────────╲                                │
│                 ╱   Unit Tests   ╲     6.1, 6.3, 6.5             │
│                ╰    (30-35)       ╰    (Anchor TS + Jest)        │
│               ╱────────────────────╲                             │
│                                                                  │
│  Coverage Targets:                                               │
│  • Smart Contracts: Unit 90%+ / Integration 80%+ / E2E 60%+     │
│  • API Services: Unit 70%+ / Integration 60%+                   │
│  • Frontend: Component 50%+ / E2E 30%+                          │
│  • Keeper Bot: Unit 60%+                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Test Categories

| Layer | Tool | Tests | Target Coverage |
|-------|------|-------|-----------------|
| Smart Contracts | Anchor TypeScript | 30-35 unit + 8-10 integration | 90%+ unit |
| API Services | Jest + Supertest | 15-20 unit + 8-10 integration | 70%+ unit |
| Frontend | Jest + React Testing Library + Playwright | 10-15 component + 5 E2E | 50%+ component |
| Keeper Bot | Jest | 8-10 unit + 5 integration | 60%+ unit |
| Load Testing | k6 + Artillery | 5-7 scenarios | Baseline established |

---

## Story 6.1: Smart Contract Unit Tests

**ID:** FETO-601  
**Days:** 4-12 | **Effort:** 2 days | **Priority:** P0

### Acceptance Criteria
- [ ] **Config tests** (Story 1.2):
  - TC-01: Initialize with valid params → Config created
  - TC-02: Initialize with fee > 500 bps → Rejected
  - TC-03: Initialize with min_bet >= max_bet → Rejected
  - TC-04: Double initialization → Rejected

- [ ] **Match tests** (Story 1.3):
  - TC-05: Create match with valid params → Match created
  - TC-06: Create match with name > 32 bytes → Rejected
  - TC-07: Create duplicate match_id → Rejected
  - TC-08: Update match state (Scheduled → Live → Finished)
  - TC-09: Unauthorized caller → Rejected

- [ ] **Market tests** (Story 1.4):
  - TC-10: Create market with valid params → Market created, counter incremented
  - TC-11: Create market for non-live match → Rejected
  - TC-12: Create market with 1 outcome → Rejected
  - TC-13: Create market with 6 outcomes → Rejected
  - TC-14: Create market with max_leverage > 5 → Rejected
  - TC-15: Create market in past lock_time → Rejected

- [ ] **Betting tests** (Story 1.5):
  - TC-16: Place bet with valid params → Position created, USDC transferred
  - TC-17: Place bet on closed market → Rejected
  - TC-18: Place bet with invalid outcome → Rejected
  - TC-19: Place bet below minimum → Rejected
  - TC-20: Cancel bet before lock → Refunded
  - TC-21: Cancel bet after lock → Rejected
  - TC-22: Multiple bets on same market → Multiple positions

- [ ] **Settlement tests** (Story 1.7):
  - TC-28: Settle market with valid TxLINE proof → Settled
  - TC-29: Settle market with invalid proof → Rejected
  - TC-30: Settle market with wrong fixture_id → Rejected
  - TC-31: Settle already settled market → Rejected
  - TC-32: Settle open (not locked) market → Rejected
  - TC-33: Event type mapping for all market types

- [ ] **Leverage tests** (Story 1.8):
  - TC-34: Liquidate position with adverse odds movement
  - TC-35: Attempt to liquidate non-leveraged position → Rejected
  - TC-36: Attempt to liquidate already liquidated → Rejected
  - TC-37: Odds update triggers multiple liquidations
  - TC-38: Position not liquidated if odds move favorably

- [ ] **Payout tests** (Story 1.9):
  - TC-39: Claim winning payout → Correct amount received
  - TC-40: Claim losing payout → 0 received
  - TC-41: Claim cancelled market → Full refund
  - TC-42: Double claim → Rejected
  - TC-43: Cancel market → All positions refundable
  - TC-44: Match abandoned → All markets auto-cancelled
  - TC-45: Market lock_time extended during injury time

### Test Infrastructure
```typescript
// tests/helpers/setup.ts
import { Program, AnchorProvider } from '@project-serum/anchor';

export async function setupTest() {
  const provider = AnchorProvider.local();
  const program = await Program.at(FETO_PROGRAM_ID, provider);

  // Create test tokens (mock USDC)
  const usdcMint = await createMint(provider);
  const alice = await createUser(provider, usdcMint, 10_000); // 10,000 USDC
  const bob = await createUser(provider, usdcMint, 10_000);
  const keeper = await createUser(provider, usdcMint, 1_000);

  return { provider, program, usdcMint, alice, bob, keeper };
}

// Helper: USDC amount (6 decimals)
export const usdc = (amount: number) => amount * 1_000_000;

// Mock TxLINE proof for testing
export function createMockProof(
  fixtureId: number,
  eventType: string,
  team: string,
): TxlineProof {
  // Generate valid proof structure for test
  return {
    root: Buffer.alloc(32, fixtureId),
    proof_path: [Buffer.alloc(32, 1)],
    leaf: Buffer.from(`${fixtureId}:${eventType}:${team}`),
    signature: Buffer.alloc(64),
  };
}
```

### Dependencies
- Stories 1.2 → 1.9 (incremental)

---

## Story 6.2: Integration Tests

**ID:** FETO-602  
**Days:** 12 | **Effort:** 1 day | **Priority:** P1

### Acceptance Criteria
- [ ] **Full lifecycle test:**
  ```typescript
  it('should complete full bet → settle → claim flow', async () => {
    // 1. Initialize config
    await initialize(feeRecipient, txlineProgram, 1_000_000, 1_000_000_000, 200);
    // 2. Create match
    const matchId = await createMatch(fixtureData);
    // 3. Create market
    const marketId = await createMarket(matchId, 'next_corner', ['Home', 'Away', 'Neither']);
    // 4. Place bets
    await placeBet(alice, marketId, 0, usdc(100), 1); // $100 on Home
    await placeBet(bob, marketId, 1, usdc(50), 1);    // $50 on Away
    // 5. Lock market
    await lockMarket(marketId);
    // 6. Settle with proof
    const proof = createMockProof(matchId, 'corner', 'home');
    await settleMarket(keeper, marketId, 0, proof);
    // 7. Claim
    const payout = await claimPayout(alice, marketId);
    expect(payout).to.equal(usdc(147)); // $100 + ($100/$100)*$50 - 2%fee = $147
    // 8. Loser gets nothing
    const lost = await claimPayout(bob, marketId);
    expect(lost).to.equal(0);
  });
  ```

- [ ] **Leverage lifecycle test:**
  ```typescript
  it('should handle leveraged position through entire lifecycle', async () => {
    const marketId = await createMarket(matchId, 'next_corner', ['Home', 'Away']);
    await placeBet(alice, marketId, 0, usdc(300), 3); // 3x = $900 position, $300 collateral
    await lockMarket(marketId);
    const proof = createMockProof(matchId, 'corner', 'home');
    await settleMarket(keeper, marketId, 0, proof);
    // Alice wins: payout = collateral + leveraged profit
    const payout = await claimPayout(alice, marketId);
    expect(payout).to.be.greaterThan(usdc(300));
  });
  ```

- [ ] **Multi-user concurrent bets test:**
  ```typescript
  it('should handle 10 concurrent bets on same market', async () => {
    const marketId = await createMarket(matchId, 'goal_5min', ['Yes', 'No']);
    const promises = users.map(user => placeBet(user, marketId, 0, usdc(10), 1));
    const results = await Promise.all(promises);
    results.forEach(tx => expect(tx).to.have.property('signature'));
  });
  ```

- [ ] **Edge case tests:**
  - Match abandoned → all markets cancelled, all refunded
  - Market lock_time reached → no more bets
  - Odds slippage > 5% → bet rejected
  - Invalid keeper → settlement rejected
  - Double claim → second attempt rejected

### Test Data
```typescript
const fixtureData = {
  matchId: 1,
  homeTeam: 'Brazil',
  awayTeam: 'Argentina',
  startTime: Math.floor(Date.now() / 1000) - 1800, // 30 min ago
  txlineFixtureHash: Buffer.alloc(32, 42),
};
```

### Dependencies
- Story 6.1

---

## Story 6.3: Frontend Tests

**ID:** FETO-603  
**Days:** 12 | **Effort:** 0.5 day | **Priority:** P2

### Acceptance Criteria
- [ ] **Component tests (Jest + React Testing Library):**
  - TC-F01: Match list renders with mock data
  - TC-F02: Filter tabs switch correctly
  - TC-F03: Market cards render with correct odds
  - TC-F04: Bet modal opens with correct market info
  - TC-F05: Amount input updates payout in real-time
  - TC-F06: Leverage toggle updates collateral display
  - TC-F07: Wallet connection button shows correct state
  - TC-F08: Dashboard shows active bets
  - TC-F09: P&L chart renders with data
  - TC-F10: Empty states render correctly

- [ ] **E2E tests (Playwright):**
  - TC-F11: Full flow: connect wallet → browse matches → select market → place bet → confirm
  - TC-F12: Error state: API unavailable → retry
  - TC-F13: Error state: insufficient balance → warning
  - TC-F14: Mobile responsive: 375px viewport renders correctly
  - TC-F15: Wallet disconnect → UI resets correctly

### Playwright E2E Test
```typescript
// tests/e2e/bet-flow.spec.ts
import { test, expect } from '@playwright/test';

test('full betting flow', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Connect wallet (mock)
  await page.click('[data-testid="connect-wallet"]');
  await page.click('[data-testid="wallet-phantom"]');

  // Select match
  await page.click('[data-testid="match-card-1"]');

  // View markets
  await expect(page.locator('[data-testid="market-card"]')).toBeVisible();

  // Click outcome
  await page.click('[data-testid="outcome-home"]');

  // Bet modal opens
  await expect(page.locator('[data-testid="bet-modal"]')).toBeVisible();

  // Enter amount
  await page.fill('[data-testid="amount-input"]', '10');

  // Check payout updates
  await expect(page.locator('[data-testid="payout-display"]')).toContainText('25.00');

  // Select leverage
  await page.click('[data-testid="leverage-3x"]');

  // Place bet
  await page.click('[data-testid="place-bet"]');

  // Confirm in wallet (mock)
  await page.click('[data-testid="confirm-tx"]');

  // Success toast
  await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
});
```

### Dependencies
- EPIC-02 (frontend features)

---

## Story 6.4: Load Testing

**ID:** FETO-604  
**Days:** 12 | **Effort:** 0.5 day | **Priority:** P2

### Acceptance Criteria
- [ ] **API load test (k6):**
  ```javascript
  // tests/load/api-load.js
  import http from 'k6/http';

  export const options = {
    stages: [
      { duration: '1m', target: 50 },   // Ramp up to 50 users
      { duration: '3m', target: 100 },   // Stay at 100 users
      { duration: '1m', target: 0 },     // Ramp down
    ],
    thresholds: {
      http_req_duration: ['p(95)<200'],  // 95% under 200ms
      http_req_failed: ['rate<0.01'],     // <1% failure
    },
  };

  export default function () {
    const BASE_URL = __ENV.API_URL || 'http://localhost:3001';
    http.get(`${BASE_URL}/api/matches`);
    http.get(`${BASE_URL}/api/matches/1/markets`);
  }
  ```

- [ ] **Settlement load test (custom script):**
  - Simulate 10 events per minute
  - Measure settlement latency (event → on-chain confirmation)
  - Target: < 30s p95

- [ ] **Frontend performance (Lighthouse):**
  - Mobile: Performance > 70, Accessibility > 90
  - Desktop: Performance > 85, Accessibility > 90
  - LCP < 2.5s, FID < 100ms, CLS < 0.1

- [ ] **Concurrent bet placement (Artillery):**
  ```yaml
  # tests/load/bet-placement.yml
  config:
    target: "http://localhost:3001"
    phases:
      - duration: 60
        arrivalRate: 10
        name: "Warm up"
      - duration: 120
        arrivalRate: 50
        name: "Peak load"
  ```

### Baseline Targets
| Scenario | Target | Measured |
|----------|--------|----------|
| 50 concurrent match list req/s | p95 < 200ms | TBD |
| 10 markets settling simultaneously | 0 failures | TBD |
| 50 concurrent bet placements | All succeed in < 5s | TBD |
| Frontend Lighthouse (mobile) | > 70 perf | TBD |

### Dependencies
- Story 3.10 (rate limiting), Story 4.5 (keeper reliability)

---

## Story 6.5: Edge Case Verification

**ID:** FETO-605  
**Days:** 12-13 | **Effort:** 0.5 day | **Priority:** P2

### Acceptance Criteria
Verify all edge cases from PRD section 7.4:

| Scenario | Test | Status |
|----------|------|--------|
| Market closes before tx confirms | Bet refunded, no state inconsistency | ✅ |
| Odds move >5% during confirmation | User prompted to re-confirm | ✅ |
| Insufficient USDC balance | Clear error message, link to swap | ✅ |
| Wallet not connected | Wallet modal shown | ✅ |
| Tx fails (RPC issue) | Auto-retry 3x, then show error | ✅ |
| Event disputed (VAR) | Market paused, re-check with TxLINE | ✅ |
| Match abandoned | All markets cancelled, refunds processed | ✅ |
| Invalid Merkle proof | Settlement rejected with clear error | ✅ |
| Double claim | Second attempt rejected | ✅ |
| Leverage liquidation during settlement | Position correctly liquidated | ✅ |
| Keeper race condition | Only first settlement counts | ✅ |
| Websocket disconnect (frontend) | Auto-reconnect + REST fallback | ✅ |

### VAR Review Handling
```typescript
it('should handle VAR review correctly', async () => {
  // 1. Goal scored → market locks, keeper starts settlement
  // 2. VAR initiated → market goes to 'paused' state
  await pauseMarket(marketId);
  // 3. Goal disallowed → market cancelled, full refund
  await cancelMarket(marketId);
  const refund = await claimPayout(alice, marketId);
  expect(refund).to.equal(usdc(100)); // Full refund expected
});
```

### Dependencies
- Stories 6.1, 6.2, 6.3

---

## Story 6.6: Demo Script + Video Recording

**ID:** FETO-606  
**Day:** 13 | **Effort:** 0.5 day | **Priority:** P0

### Acceptance Criteria
- [ ] 3-minute demo video recorded
- [ ] Script followed (from PRD Appendix E):
  1. 0:00-0:30 — Introduction + app overview
  2. 0:30-1:00 — Browse matches, view markets
  3. 1:00-1:30 — Place bet with 3x leverage
  4. 1:30-2:00 — Real-time match events from TxLINE
  5. 2:00-2:30 — Settlement triggered
  6. 2:30-3:00 — Payout + trustless verification
- [ ] Video quality: 1080p, clear audio, captions
- [ ] Backup: pre-recorded version if live fails
- [ ] README with architecture diagram
- [ ] Submit to hackathon platform
- [ ] Post on Twitter + Discord

### Dependencies
- All previous stories

---

## Test Execution

### Running Tests
```bash
# Smart contract tests
cd programs/feto
anchor test --skip-deploy  # Skip deploy for faster iteration
anchor test               # Full test with deploy

# API tests
cd services/api
npm test                  # Jest unit + integration tests

# Frontend tests
cd apps/web
npm run test              # Jest component tests
npm run test:e2e          # Playwright E2E tests

# Keeper tests
cd services/keeper
npm test                  # Jest unit tests

# Load tests
cd tests/load
k6 run api-load.js
artillery run bet-placement.yml

# All tests
cd scripts
./run-all-tests.sh        # Sequential test runner
```

### CI Integration
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  anchor-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: ./.github/actions/setup-anchor
      - run: anchor test

  api-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: feto_test
          POSTGRES_PASSWORD: postgres
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm test
        working-directory: services/api

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm test
        working-directory: apps/web
      - run: npx playwright test
        working-directory: apps/web
```

---

## Test Completion Dashboard

| ID | Test Category | Count | Status |
|----|--------------|-------|--------|
| 6.1 | Contract Unit Tests | 35 | ⬜ |
| 6.2 | Integration Tests | 10 | ⬜ |
| 6.3 | Frontend Component Tests | 10 | ⬜ |
| 6.3 | Frontend E2E Tests | 5 | ⬜ |
| 6.4 | Load Test Scenarios | 5 | ⬜ |
| 6.5 | Edge Case Tests | 12 | ⬜ |
| 6.6 | Demo Video | 1 | ⬜ |
| **Total** | | **78** | **0/78** |

---

## Story Completion Checklist

For each story, verify before marking complete:
- [ ] All test cases passing
- [ ] Test coverage meets targets
- [ ] No flaky tests (run 3x consecutively)
- [ ] Load test baseline recorded
- [ ] Edge cases documented and tested
- [ ] Demo video recorded (Story 6.6)
- [ ] Tests integrated into CI
