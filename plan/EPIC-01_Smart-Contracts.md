# EPIC-01: Smart Contract Development (Anchor / Rust)

**Goal:** Develop and deploy 3 production-ready Anchor programs to Solana devnet with TxLINE CPI settlement.

**Owner:** Smart Contract Engineer  
**Duration:** Days 1-10 (Sprint 1 + partial Sprint 2)  
**Dependencies:** None (foundational epic)  
**Deliverables:** 3 Anchor programs → IDL → devnet deployment → 48+ tests

---

## Program Architecture

```
feto_factory (Market Factory)
  PDA Seeds: [b"feto_config"], [b"match", id], [b"market", id]
  Instructions: initialize, create_match, create_market, update_match_state,
                cancel_market, pause

feto_escrow (Escrow + Position Manager)
  PDA Seeds: [b"position", market, user, nonce], [b"market_vault", market]
  Instructions: place_bet, cancel_bet, claim_payout, liquidate_position

feto_settle (Settlement Contract)
  CPI Target: TxLINE validate_stat
  Instructions: settle_market, verify_proof, distribute, refund
```

---

## Story 1.1: Project Scaffold + Anchor Init

**ID:** FETO-101  
**Day:** 1 | **Effort:** 0.5 day | **Priority:** P0

### Acceptance Criteria
- [ ] `anchor init feto` with workspace containing 3 programs
- [ ] Programs compile with `anchor build`
- [ ] IDL generated for all programs
- [ ] `Anchor.toml` configured for devnet
- [ ] TypeScript client generated with `anchor generate`
- [ ] Git repo initialized with `.gitignore` for Anchor project

### Technical Notes
```bash
anchor init feto
cd feto && anchor build
# Verify all 3 programs compile
```

- Use Anchor 0.32+ with Solana 2.x
- Set `[programs.devnet]` in Anchor.toml
- Add `@project-serum/anchor` for TS client
- Configure `wallet` path in Anchor.toml

### Files to Create
```
programs/
├── feto-factory/src/lib.rs
├── feto-escrow/src/lib.rs
├── feto-settle/src/lib.rs
├── feto-factory/Cargo.toml
├── feto-escrow/Cargo.toml
└── feto-settle/Cargo.toml
tests/
└── feto.ts
Anchor.toml
```

### Dependencies
- None

---

## Story 1.2: Config Account + Initialize Instruction

**ID:** FETO-102  
**Day:** 1-2 | **Effort:** 0.5 day | **Priority:** P0

### Acceptance Criteria
- [ ] `Config` account struct defined with all fields (authority, fee_recipient, txline_program, treasury_vault, min_bet, max_bet, protocol_fee_bps, market_counter, paused, bump)
- [ ] PDA seed `b"feto_config"` derived correctly
- [ ] `initialize` instruction validates:
  - `protocol_fee_bps <= 500` (max 5%)
  - `min_bet < max_bet`
  - `min_bet >= 1_000_000` (1 USDC)
- [ ] Config account created on-chain via initialize
- [ ] `Config::SEED` constant defined
- [ ] `InitSpace` derive macro used for rent calculation

### Technical Notes
```rust
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,
    pub txline_program: Pubkey,
    pub treasury_vault: Pubkey,
    pub min_bet: u64,
    pub max_bet: u64,
    pub protocol_fee_bps: u16,
    pub market_counter: u64,
    pub paused: bool,
    pub bump: u8,
}
```

- Use `init_space` for accurate rent exemption
- Derive treasury vault PDA with seed `[b"treasury_vault", config.key().as_ref()]`
- Authority is the deployer wallet initially

### Test Cases
- TC-01: Initialize with valid params → Config created
- TC-02: Initialize with fee > 500 bps → Rejected
- TC-03: Initialize with min_bet >= max_bet → Rejected
- TC-04: Double initialization → Rejected

### Dependencies
- Story 1.1

---

## Story 1.3: Match Account + Create Match Instruction

**ID:** FETO-103  
**Day:** 2 | **Effort:** 0.5 day | **Priority:** P0

### Acceptance Criteria
- [ ] `Match` account struct defined with match_id, home_team, away_team, status (enum), scores, current_minute, txline_fixture_hash, start_time, end_time, active_markets, bump
- [ ] `MatchStatus` enum: Scheduled, Live, Paused, Finished, Abandoned
- [ ] `create_match` instruction:
  - Validates team names ≤ 32 bytes
  - Validates start_time > current_time
  - Validates match_id not in use (PDA uniqueness)
  - Validates caller is config authority
- [ ] Match PDA derived with `[b"match", match_id.to_le_bytes()]`
- [ ] `update_match_state` instruction for score/time/status changes

### Technical Notes
```rust
#[account]
#[derive(InitSpace)]
pub struct Match {
    pub match_id: u64,
    pub home_team: [u8; 32],
    pub away_team: [u8; 32],
    pub status: MatchStatus,
    pub home_score: u8,
    pub away_score: u8,
    pub current_minute: u16,
    pub txline_fixture_hash: [u8; 32],
    pub start_time: i64,
    pub end_time: i64,
    pub active_markets: u8,
    pub bump: u8,
}
```

- Store team names as fixed-size byte arrays for deterministic account sizing
- Free-form validation of UTF-8 on input, store as bytes

### Test Cases
- TC-05: Create match with valid params → Match created
- TC-06: Create match with name > 32 bytes → Rejected
- TC-07: Create duplicate match_id → Rejected
- TC-08: Update match state (Scheduled → Live → Finished)
- TC-09: Unauthorized caller → Rejected

### Dependencies
- Story 1.2

---

## Story 1.4: Market Account + Create Market Instruction

**ID:** FETO-104  
**Day:** 2-3 | **Effort:** 1 day | **Priority:** P0

### Acceptance Criteria
- [ ] `Market` account struct defined with market_id, match_id, market_type (enum), status (enum), outcomes (Vec), total_pool, creation_time, lock_time, settlement_time, winning_outcome, protocol_fee_bps, leverage_enabled, max_leverage, bump
- [ ] `MarketType` enum: NextCorner, NextCard, NextSubstitution, NextGoalScorer, GoalInNextNMinutes, AnyGoal
- [ ] `MarketStatus` enum: Open, Locked, Settled, Cancelled
- [ ] `Outcome` struct: label, total_bets, odds_decimal, num_bettors
- [ ] `create_market` instruction:
  - Validates match status == Live
  - Validates lock_time > current_time
  - Validates 2 ≤ outcomes.len() ≤ 5
  - Validates max_leverage ≤ 5
  - Increments match.active_markets
- [ ] Market PDA derived with `[b"market", market_id.to_le_bytes()]`
- [ ] Market counter incremented in Config

### Technical Notes
```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Outcome {
    pub label: [u8; 32],
    pub total_bets: u64,
    pub odds_decimal: u64,  // x10000 format: 2.50 = 25000
    pub num_bettors: u32,
}
```

- `odds_decimal` stored as fixed-point number (x10000) to avoid float on-chain
- Market ID auto-incremented from config counter
- `outcomes` Vec limited to 5 via Anchor `Vec` type constraints

### Test Cases
- TC-10: Create market with valid params → Market created, counter incremented
- TC-11: Create market for non-live match → Rejected
- TC-12: Create market with 1 outcome → Rejected
- TC-13: Create market with 6 outcomes → Rejected
- TC-14: Create market with max_leverage > 5 → Rejected
- TC-15: Create market in past lock_time → Rejected

### Dependencies
- Story 1.3

---

## Story 1.5: Place Bet + Position Management

**ID:** FETO-105  
**Day:** 3 | **Effort:** 1 day | **Priority:** P0

### Acceptance Criteria
- [ ] `Position` account struct: position_id, market_id, user, outcome_index, amount, leverage, collateral, potential_payout, liquidation_price, status (enum), created_at, settled_at, claimed, bump
- [ ] `PositionStatus` enum: Active, Locked, Won, Lost, Liquidated, Cancelled
- [ ] `place_bet` instruction:
  - Validates Market status == Open
  - Validates current_time < lock_time
  - Validates outcome_index is valid for market
  - Validates min_bet ≤ amount ≤ max_bet
  - Validates 1 ≤ leverage ≤ market.max_leverage
  - Calculates collateral = amount / leverage
  - Calculates potential_payout = amount * odds_decimal / 10000
  - Calculates liquidation_price (if leverage > 1)
  - Transfers USDC from user to market vault
- [ ] `cancel_bet` instruction (before lock):
  - Validates market not locked
  - Refunds full collateral
  - Removes position
- [ ] Market vault PDA with seed `[b"market_vault", market_id.to_le_bytes()]`
- [ ] Position PDA with seed `[b"position", market_id, user, nonce]`

### Leverage Liquidation Calculation
```rust
let liquidation_price = if leverage > 1 {
    let entry_odds = market.outcomes[outcome_index as usize].odds_decimal;
    let entry_prob = 1_000_000 / entry_odds;  // Implied probability in x10000
    let adverse = (entry_prob * leverage as u64) / 100;  // Max adverse move
    let threshold = entry_prob + adverse;
    // If implied probability exceeds threshold, liquidate
    threshold
} else {
    u64::MAX  // No leverage = no liquidation
};
```

### Test Cases
- TC-16: Place bet with valid params → Position created, USDC transferred
- TC-17: Place bet on closed market → Rejected
- TC-18: Place bet with invalid outcome → Rejected
- TC-19: Place bet below minimum → Rejected
- TC-20: Cancel bet before lock → Refunded
- TC-21: Cancel bet after lock → Rejected
- TC-22: Multiple bets on same market → Multiple positions created

### Dependencies
- Story 1.4

---

## Story 1.6: TxLINE Integration

**ID:** FETO-106  
**Day:** 4 | **Effort:** 1 day | **Priority:** P0

### Acceptance Criteria
- [ ] TxLINE program ID stored in Config (devnet: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`)
- [ ] Service Level 12 (free World Cup real-time) subscription flow implemented
- [ ] Guest JWT authentication flow: `POST /auth/guest/start`
- [ ] API token activation via signed message: `signature = sign(${txSig}:${leagues}:${jwt})`
- [ ] REST API client for fixtures and odds
- [ ] WebSocket client for live events with auto-reconnect
- [ ] Fixture parsing: map TxLINE fixtures to on-chain Match accounts
- [ ] Event parsing: map TxLINE events to market outcomes
- [ ] Merkle proof fetching from TxLINE validation endpoint

### TxLINE API Flow
```
1. POST /auth/guest/start → { token: "jwt..." }
2. (Skip TxL purchase — free tier for World Cup)
3. Subscribe on-chain: level 12, 1 week
4. Sign message: `${txSig}:world-cup:${jwt}`
5. POST /api/token/activate with signature
6. Use API with Authorization + X-Api-Token headers
```

### TypeScript Module Structure
```
src/txline/
├── client.ts          # REST + WebSocket client
├── auth.ts            # JWT + API token flow
├── fixtures.ts        # Fixture parsing
├── events.ts          # Event parsing + market mapping
├── proofs.ts          # Merkle proof fetching
└── types.ts           # TxLINE type definitions
```

### Test Cases
- TC-23: TxLINE guest auth returns JWT
- TC-24: API token activation succeeds
- TC-25: Fixtures fetch returns parsable match data
- TC-26: WebSocket connects and receives events
- TC-27: Merkle proof endpoint returns valid proof

### Dependencies
- Story 1.2 (Config needs txline_program)

---

## Story 1.7: Trustless Settlement via CPI + Merkle Proof

**ID:** FETO-107  
**Day:** 5 | **Effort:** 1 day | **Priority:** P0

### Acceptance Criteria
- [ ] `settle_market` instruction implemented with CPI to TxLINE `validate_stat`
- [ ] CPI accounts defined correctly (stat_account, proof_data)
- [ ] Validation result checked: `require!(validation.is_valid)`
- [ ] Fixture ID cross-checked: `require!(validation.fixture_id == match.match_id)`
- [ ] Event type mapped to winning outcome index
- [ ] Market status updated to Settled
- [ ] `MarketSettled` event emitted
- [ ] Payout distribution logic:
  - Winning pool = sum of winning outcome bets
  - Losing pool = sum of all other outcome bets
  - Protocol fee deducted from losing pool (protocol_fee_bps)
  - Keeper reward reserved (0.1% of pool)
  - Winner gets: their stake + (their stake / winning pool) * (losing pool - fee)
- [ ] Invalid proof rejection: `FetoError::InvalidTxlineProof`
- [ ] `TxlineProof` struct defined for CPI input

### Settlement Flow
```rust
pub fn settle_market(ctx: Context<SettleMarket>, proof: TxlineProof) -> Result<()> {
    // 1. Validate market is in Locked status
    require!(market.status == MarketStatus::Locked, FetoError::MarketNotLocked);

    // 2. CPI to TxLINE validate_stat
    let cpi_program = ctx.accounts.txline_program.to_account_info();
    let cpi_accounts = txline::cpi::accounts::ValidateStat {
        stat_account: ctx.accounts.txline_stat_account.to_account_info(),
        proof_data: ctx.accounts.proof_account.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    let validation = txline::cpi::validate_stat(cpi_ctx, proof)?;

    // 3. Verify
    require!(validation.is_valid, FetoError::InvalidTxlineProof);
    require!(validation.fixture_id == match_acct.match_id, FetoError::TxlineValidationFailed);

    // 4. Map event to outcome
    let winning_outcome = match validation.event_type {
        TxlineEventType::Corner => map_corner(&validation, &market),
        TxlineEventType::Goal => map_goal(&validation, &market),
        TxlineEventType::YellowCard => 1,  // Yes outcome
        _ => return Err(FetoError::UnsupportedEvent),
    };

    // 5. Settle
    market.status = MarketStatus::Settled;
    market.winning_outcome = winning_outcome;
    market.settlement_time = Clock::get()?.unix_timestamp;

    emit!(MarketSettled {
        market_id: market.market_id,
        winning_outcome,
        proof_hash: hash_proof(&proof),
    });

    Ok(())
}
```

### Winning Outcome Mapping
| TxLINE Event Type | Market Type | Mapping |
|-------------------|-------------|---------|
| Corner (team=home) | NextCorner | 0 (Home) |
| Corner (team=away) | NextCorner | 1 (Away) |
| Goal (team=home) | NextGoalScorer | 0-N (Player index) |
| Goal (team=away) | NextGoalScorer | 0-N (Player index) |
| Yellow Card | NextCard | 1 (Yes) |
| Red Card | NextCard | 1 (Yes) |
| Substitution | NextSubstitution | 1 (Yes) |
| No event in window | Any * | Last outcome (Neither/None) |

### Test Cases
- TC-28: Settle market with valid TxLINE proof → Market settled, payouts computed
- TC-29: Settle market with invalid proof → Rejected
- TC-30: Settle market with wrong fixture_id → Rejected
- TC-31: Settle already settled market → Rejected
- TC-32: Settle open market (not locked) → Rejected
- TC-33: Event type mapping correctness for all market types

### Dependencies
- Story 1.5, Story 1.6

---

## Story 1.8: Leverage Logic + Liquidation

**ID:** FETO-108  
**Day:** 8-9 | **Effort:** 1 day | **Priority:** P1

### Acceptance Criteria
- [ ] `liquidate_position` instruction:
  - Validates position.leverage > 1
  - Validates position.status == Active
  - Validates market odds moved beyond liquidation threshold
  - Returns unused collateral to user
  - Transfers remaining to protocol (liquidation fee)
- [ ] Liquidation threshold calculation (as defined in Story 1.5)
- [ ] Odds update instruction for market (keeper/admin):
  - Updates outcomes[x].odds_decimal
  - Triggers liquidation check loop
- [ ] Position status updated to Liquidated
- [ ] `PositionLiquidated` event emitted

### Liquidation Flow
```rust
pub fn liquidate_position(ctx: Context<LiquidatePosition>) -> Result<()> {
    let position = &mut ctx.accounts.position;
    let market = &ctx.accounts.market;

    require!(position.leverage > 1, FetoError::NotLiquidatable);
    require!(position.status == PositionStatus::Active, FetoError::AlreadyLiquidated);

    let current_odds = market.outcomes[position.outcome_index as usize].odds_decimal;
    let current_prob = 1_000_000 / current_odds;

    require!(current_prob >= position.liquidation_price, FetoError::NotLiquidatable);

    // Liquidate: return remaining collateral
    // Liquidated positions get 0 payout, but 10% of collateral back as "mercy"
    let mercy_amount = position.collateral * 10 / 100;
    // Transfer mercy_amount from vault to user
    // Transfer rest to protocol treasury

    position.status = PositionStatus::Liquidated;

    emit!(PositionLiquidated {
        market_id: market.market_id,
        user: position.user,
        collateral_lost: position.collateral - mercy_amount,
    });

    Ok(())
}
```

### Test Cases
- TC-34: Liquidate position with adverse odds movement
- TC-35: Attempt to liquidate non-leveraged position → Rejected
- TC-36: Attempt to liquidate already liquidated position → Rejected
- TC-37: Odds update triggers multiple liquidations
- TC-38: Position not liquidated if odds move favorably

### Dependencies
- Story 1.5

---

## Story 1.9: Claim Payout + Cancel Market + Edge Cases

**ID:** FETO-109  
**Day:** 5, 9 | **Effort:** 1 day | **Priority:** P0

### Acceptance Criteria
- [ ] `claim_payout` instruction:
  - Validates market status == Settled or Cancelled
  - Validates position not already claimed
  - Calculates payout based on outcome:
    - Won: stake + share of losing pool (minus fee)
    - Lost: 0
    - Cancelled: full refund
  - Transfers from market vault to user
  - Sets position.claimed = true
- [ ] `cancel_market` instruction:
  - For match abandonment, VAR overturn, etc.
  - Sets all positions to Cancelled status
  - Emits `MarketCancelled` event
- [ ] Edge case: market closed during bet confirmation (refund)
- [ ] Edge case: match abandoned (auto-cancel all markets)
- [ ] Edge case: VAR review (market paused → re-check with TxLINE)
- [ ] Edge case: injury time extension (market auto-extends lock_time)

### Payout Calculation
```rust
let payout = if position.outcome_index == market.winning_outcome {
    let winning_pool = market.outcomes[position.outcome_index as usize].total_bets;
    let losing_pool = market.total_pool - winning_pool;
    let protocol_fee = losing_pool * market.protocol_fee_bps as u64 / 10000;
    let keeper_reward = losing_pool * 10 / 10000; // 0.1%
    let distributable = losing_pool - protocol_fee - keeper_reward;

    let share = (position.amount as u128)
        .checked_mul(distributable as u128)?
        .checked_div(winning_pool as u128)?;

    position.amount + share as u64  // Stake + winnings
} else {
    0  // Loser gets nothing
};
```

### Test Cases
- TC-39: Claim winning payout → Correct amount received
- TC-40: Claim losing payout → 0 received
- TC-41: Claim cancelled market → Full refund
- TC-42: Double claim → Rejected
- TC-43: Cancel market → All positions refundable
- TC-44: Match abandoned → All markets auto-cancelled
- TC-45: Market lock_time extended during injury time

### Dependencies
- Story 1.7

---

## Story 1.10: Contract Test Suite

**ID:** FETO-110  
**Days:** 4-10 | **Effort:** 1.5 days | **Priority:** P0

### Acceptance Criteria
- [ ] All test cases from Stories 1.2-1.9 implemented in TypeScript
- [ ] Test structure:
  ```
  tests/
  ├── feto.ts                    # Main test suite
  ├── helpers/
  │   ├── setup.ts               # Test setup, account creation
  │   ├── txline-mock.ts         # Mock TxLINE program for CPI tests
  │   └── asserts.ts             # Custom assertion helpers
  ├── unit/
  │   ├── config.test.ts         # Story 1.2 tests
  │   ├── match.test.ts          # Story 1.3 tests
  │   ├── market.test.ts         # Story 1.4 tests
  │   ├── betting.test.ts        # Story 1.5 tests
  │   ├── settlement.test.ts     # Story 1.7 tests
  │   ├── leverage.test.ts       # Story 1.8 tests
  │   └── payout.test.ts         # Story 1.9 tests
  └── integration/
      └── full-lifecycle.test.ts # End-to-end bet→settle→claim
  ```
- [ ] 48+ total test cases (see full test matrix in EPIC-06)
- [ ] Mock TxLINE program for settlement CPI testing
- [ ] Tests runnable with `anchor test`
- [ ] Coverage report generated

### Key Test: Full Lifecycle
```typescript
describe("Integration: Full Market Lifecycle", () => {
  it("should create market, place bets, settle, and claim", async () => {
    await initialize(feeRecipient, txlineProgram, minBet, maxBet, feeBps);
    const matchId = await createMatch(fixtureData);
    const marketId = await createMarket(matchId, MarketType.NextCorner, outcomes);
    await placeBet(alice, marketId, 0, usdc(100), 1);  // Home corner
    await placeBet(bob, marketId, 1, usdc(50), 1);     // Away corner
    const proof = await getMockTxlineProof(matchId, "corner", "home");
    await settleMarket(keeper, marketId, 0, proof);
    const aliceBefore = await getBalance(alice);
    await claimPayout(alice, marketId);
    const aliceAfter = await getBalance(alice);
    // Alice: 100 stake + (100/100)*50 losing pool - 2% fee = 147
    expect(aliceAfter - aliceBefore).to.equal(usdc(147));
  });
});
```

### Dependencies
- Stories 1.2 → 1.9 (incremental test builds)

---

## Error Code Reference

```rust
#[error_code]
pub enum FetoError {
    #[msg("Market is not open for betting")] MarketNotOpen,
    #[msg("Market is already settled")] MarketAlreadySettled,
    #[msg("Invalid outcome index")] InvalidOutcome,
    #[msg("Bet amount below minimum")] BetTooSmall,
    #[msg("Bet amount above maximum")] BetTooLarge,
    #[msg("Insufficient user balance")] InsufficientBalance,
    #[msg("Market has expired")] MarketExpired,
    #[msg("Slippage tolerance exceeded")] SlippageExceeded,
    #[msg("Invalid leverage multiplier")] InvalidLeverage,
    #[msg("Position already liquidated")] AlreadyLiquidated,
    #[msg("Position not subject to liquidation")] NotLiquidatable,
    #[msg("Payout already claimed")] AlreadyClaimed,
    #[msg("Invalid TxLINE proof")] InvalidTxlineProof,
    #[msg("TxLINE validation failed")] TxlineValidationFailed,
    #[msg("Match is not live")] MatchNotLive,
    #[msg("Unauthorized caller")] UnauthorizedKeeper,
    #[msg("Math overflow")] Overflow,
    #[msg("Protocol is paused")] ProtocolPaused,
    #[msg("Market is not locked")] MarketNotLocked,
    #[msg("Unsupported event type")] UnsupportedEvent,
}
```

---

## PDA Seed Summary

| Account | Seeds | Program |
|---------|-------|---------|
| Config | `[b"feto_config"]` | Factory |
| Match | `[b"match", match_id.to_le_bytes()]` | Factory |
| Market | `[b"market", market_id.to_le_bytes()]` | Factory |
| Position | `[b"position", market_id.to_le_bytes(), user.key().as_ref(), nonce.to_le_bytes()]` | Escrow |
| Market Vault | `[b"market_vault", market_id.to_le_bytes()]` | Escrow |
| Treasury Vault | `[b"treasury_vault", config.key().as_ref()]` | Factory |

---

## Devnet Deployment

```bash
# Build all programs
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Verify deployment
anchor idl parse --program-id <PROGRAM_ID> --file target/idl/feto_factory.json

# Initialize config
anchor run init-config --provider.cluster devnet
```

### Expected Program IDs
| Program | Devnet Address |
|---------|---------------|
| Market Factory | TBD (from deploy) |
| Escrow Manager | TBD (from deploy) |
| Settlement | TBD (from deploy) |

---

## Story Completion Checklist

For each story, verify before marking complete:
- [ ] Compiles without errors (`anchor build`)
- [ ] All acceptance criteria met
- [ ] All test cases passing
- [ ] No clippy warnings
- [ ] Events emitted for state changes
- [ ] Error codes returned for failure cases
- [ ] Documentation comments on public instructions
