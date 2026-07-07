# EPIC-02: Frontend Application (Next.js 14 + TypeScript)

**Goal:** Build a mobile-first, swipe-to-bet dApp with real-time market updates, wallet integration, and responsive design.

**Owner:** Frontend Engineer  
**Duration:** Days 6-13 (Sprint 2 + Sprint 3)  
**Dependencies:** EPIC-01 (contract addresses/IDL), EPIC-03 (API endpoints)  
**Deliverables:** Next.js app → dev.feto.live → demo-ready

---

## Component Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        App Shell                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Layout (Header + Nav + Wallet Button)                  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │  Match   │ │ Market   │ │   Bet    │ │Dashboard │  │  │
│  │  │ Browser  │ │ Cards    │ │  Modal   │ │   Page   │  │  │
│  │  │  Page    │ │  View    │ │ (Overlay)│ │          │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │  │
│  │                                                         │  │
│  │  ┌────────────────────────────────────────────────┐     │  │
│  │  │  Shared Components                              │     │  │
│  │  │  OddsDisplay | Countdown | OutcomeBtn | Toast   │     │  │
│  │  └────────────────────────────────────────────────┘     │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**State Management:**
- Zustand: global state (wallet, current match, active bets)
- React Query (TanStack Query): server state (matches, markets, odds, history)
- Native WebSocket: real-time updates (no additional library)

**Route Design:**
```
/                    → Landing / Match Browser (live matches)
/matches/:id         → Match Detail (markets, scoreboard)
/matches/:id/market/:marketId  → Market detail (deep link)
/dashboard           → User portfolio, history, positions
/leaderboard         → Global rankings
```

---

## Story 2.1: Next.js Scaffold + Wallet Connect

**ID:** FETO-201  
**Day:** 6 | **Effort:** 0.5 day | **Priority:** P0

### Acceptance Criteria
- [ ] Next.js 14 project with App Router initialized
- [ ] Tailwind CSS + shadcn/ui configured
- [ ] `@solana/wallet-adapter-react` integrated with Phantom, Solflare, Backpack
- [ ] Wallet connection button in header (disconnect, address display, balance)
- [ ] Zustand store setup for global state (wallet, UI preferences)
- [ ] React Query client configured
- [ ] TypeScript strict mode enabled
- [ ] Base layout with responsive header/nav
- [ ] Dark theme as default (sportsbook aesthetic)
- [ ] shadcn/ui button, card, dialog, toast components installed

### Tech Stack
```json
{
  "dependencies": {
    "next": "^14.x",
    "react": "^18.x",
    "@solana/wallet-adapter-react": "^0.x",
    "@solana/wallet-adapter-phantom": "^0.x",
    "@solana/wallet-adapter-solflare": "^0.x",
    "@solana/wallet-adapter-backpack": "^0.x",
    "@solana/web3.js": "^2.x",
    "zustand": "^5.x",
    "@tanstack/react-query": "^5.x",
    "tailwindcss": "^3.x",
    "framer-motion": "^11.x",
    "recharts": "^2.x",
    "lucide-react": "^0.x",
    "class-variance-authority": "^0.x",
    "clsx": "^2.x"
  }
}
```

### Files to Create
```
src/
├── app/
│   ├── layout.tsx           # Root layout with providers
│   ├── page.tsx             # Match browser (home)
│   └── globals.css          # Tailwind imports + theme
├── components/
│   ├── ui/                  # shadcn/ui components
│   ├── layout/
│   │   ├── header.tsx
│   │   ├── nav.tsx
│   │   └── wallet-button.tsx
│   └── providers/
│       ├── wallet-provider.tsx
│       └── query-provider.tsx
├── store/
│   └── use-store.ts         # Zustand store
├── hooks/
│   └── use-wallet.ts        # Wallet convenience hooks
└── lib/
    ├── utils.ts             # cn() helper
    └── constants.ts         # Program IDs, endpoints
```

### Dependencies
- None (parallel to EPIC-01)

---

## Story 2.2: Match Browser with Live Data

**ID:** FETO-202  
**Day:** 7 | **Effort:** 1 day | **Priority:** P0

### Acceptance Criteria
- [ ] Match list page showing all live World Cup matches
- [ ] Each match card displays: team names, score, minute, status, market count
- [ ] Auto-refresh every 5 seconds
- [ ] Filter tabs: Live, Upcoming, Finished
- [ ] Skeleton loading state while fetching
- [ ] Error state with retry button
- [ ] Empty state ("No live matches right now")
- [ ] Pull-to-refresh on mobile
- [ ] Search/filter by team name
- [ ] Match card tap navigates to match detail

### UX Mock
```
┌─────────────────────────────┐
│  ⚽ Live Matches    🔍     │
│  [Live] [Upcoming] [Done]  │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ Brazil 2 - 1 Argentina  │ │
│ │ 78' LIVE   12 markets  │ │
│ │                     ›  │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ France 0 - 0 Germany    │ │
│ │ 34' LIVE   8 markets   │ │
│ │                     ›  │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### Data Flow
1. React Query fetches `GET /api/matches` every 5s
2. WebSocket receives `match:update` events → optimistic UI update
3. WebSocket auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
4. REST fallback if WebSocket disconnected

### Components
```
components/
└── match/
    ├── match-list.tsx         # Grid/list of match cards
    ├── match-card.tsx         # Individual match display
    ├── match-filters.tsx      # Live/Upcoming/Finished tabs
    ├── score-display.tsx      # Team scores with animation
    └── match-skeleton.tsx     # Loading skeleton
```

### Test Cases
- TC-F01: Match list renders with mock data
- TC-F02: Filter tabs switch correctly
- TC-F03: Tap match card → navigates to detail
- TC-F04: Empty state shown when no matches
- TC-F05: Skeleton shown during loading
- TC-F06: Error state with retry on API failure

### Dependencies
- Story 2.1, Backend API (match endpoints)

---

## Story 2.3: Market Cards + Odds Display

**ID:** FETO-203  
**Day:** 7 | **Effort:** 1 day | **Priority:** P0

### Acceptance Criteria
- [ ] Market cards displayed in match detail view under "Markets" tab
- [ ] Each market card shows:
  - Market type label (Next Corner, Goal in 5 min, etc.)
  - Countdown to market lock
  - All outcomes with odds (American + Decimal + Implied %)
  - Bet buttons for each outcome
  - Pool size indicator
- [ ] Odds update in real-time (WebSocket `odds:update` event)
- [ ] Animate odds changes (flash green for improvement, red for worsening)
- [ ] Market closed state (bet buttons disabled, "Locked" badge)
- [ ] Market settled state (winning outcome highlighted green, losing gray)
- [ ] Market cancelled state (badge + refund info)
- [ ] Market tabs: Markets, Stats (TxLINE data), Chat (placeholder)
- [ ] Scoreboard at top of match detail (scores, time, status)

### UX Mock
```
┌──────────────────────────────┐
│ ← Brazil vs Argentina        │
├──────────────────────────────┤
│    2 - 1   78' LIVE          │
│  ⚽ 34' Neymar  ⚽ 67' Messi  │
├──────────────────────────────┤
│ [Markets] [Stats] [Chat]     │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ Next Corner  ⏱ closes 79'│ │
│ │ Home +150   Away +200    │ │
│ │            Neither +300  │ │
│ │ [▲Home ] [▲Away] [△Neither]│
│ │ Pool: $2,450              │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Goal in 5 min? ⏱ 78'    │ │
│ │ Yes -110    No +130      │ │
│ │ [▲Yes ] [△No ]           │ │
│ │ Pool: $1,200              │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### Components
```
components/
└── market/
    ├── market-card.tsx         # Market card container
    ├── market-list.tsx         # Scrollable market list
    ├── outcome-button.tsx      # Single outcome bet button
    ├── odds-display.tsx        # Odds in American/Decimal/%
    ├── countdown-timer.tsx     # Time until market lock
    ├── scoreboard.tsx          # Match score + events
    ├── market-tabs.tsx         # Tab navigation
    └── pool-size.tsx           # Total pool indicator
```

### Test Cases
- TC-F07: Market cards render with correct odds
- TC-F08: Odds update in real-time via WebSocket
- TC-F09: Countdown reaches 0 → market shows "Locked"
- TC-F10: Settled market highlights winner
- TC-F11: Tab switching works correctly

### Dependencies
- Story 2.2, Backend API (market endpoints + WebSocket)

---

## Story 2.4: Bet Placement Modal

**ID:** FETO-204  
**Day:** 8 | **Effort:** 1 day | **Priority:** P0

### Acceptance Criteria
- [ ] Bet modal opens when user taps outcome button
- [ ] Modal displays:
  - Market description (Next Corner — Home)
  - Match info (Brazil vs Argentina)
  - Current odds + implied probability
  - Amount input field (with quick-select: $5, $10, $25, $100)
  - Potential payout calculation (updates live as amount changes)
  - Leverage toggle row (1x, 2x, 3x, 5x — with collateral breakdown)
  - Slippage tolerance setting (default 5%)
  - "Place Bet" button with total cost (collateral)
- [ ] Amount validation:
  - Minimum: $1 USDC
  - Maximum: $1,000 USDC
  - Insufficient balance warning
- [ ] Leverage display:
  - Toggle between 1x, 2x, 3x, 5x
  - Show: Collateral = Amount / Leverage
  - Show: Liquidation threshold odds
  - Show: Estimated funding rate cost
- [ ] Transaction flow:
  - "Place Bet" → Wallet popup → Sign → Broadcast → Confirmation toast
  - Loading spinner during transaction
  - Success: "Bet Placed!" toast → redirect to active positions
  - Error: descriptive error toast
- [ ] Odds refreshes: if odds change >5% during modal open, show warning + require reconfirmation
- [ ] Market close detection: if market locks while modal is open, show "Market Closed" and disable

### UX Mock
```
┌──────────────────────────────┐
│        Place Bet             │
├──────────────────────────────┤
│ Next Corner - Home           │
│ Brazil vs Argentina          │
│ Odds: +150 (40% implied)     │
│                              │
│ Amount: [  $10          ]    │
│ [$5] [$10] [$25] [$100]     │
│                              │
│ Potential Payout: $25.00     │
│                              │
│ Leverage: [1x] [2x] [3x][5x]│
│ Collateral: $3.33            │
│ Liq. if odds fall below +300 │
│                              │
│ Slippage: 5%                 │
│                              │
│ [      Place Bet ($3.33)   ] │
│                              │
└──────────────────────────────┘
```

### Transaction Building
```typescript
const placeBet = async (
  market: Market,
  outcomeIndex: number,
  amount: number,
  leverage: number,
  maxSlippageBps: number,
): Promise<string> => {
  const { publicKey, signTransaction } = useWallet();

  // 1. Get current odds from market
  const currentOdds = market.outcomes[outcomeIndex].oddsDecimal;

  // 2. Calculate minimum acceptable odds (with slippage)
  const minOdds = currentOdds * (1 - maxSlippageBps / 10000);

  // 3. Build transaction with Anchor
  const tx = await program.methods
    .placeBet(outcomeIndex, amount * 1_000_000, leverage, maxSlippageBps)
    .accounts({
      market: market.pda,
      position: findPositionPDA(market.id, publicKey),
      marketVault: findMarketVaultPDA(market.id),
      user: publicKey,
      // ... other accounts
    })
    .transaction();

  // 4. Send
  const txSig = await sendTransaction(tx, connection);
  return txSig;
};
```

### Components
```
components/
└── bet/
    ├── bet-modal.tsx           # Modal container
    ├── amount-input.tsx        # Amount + quick select buttons
    ├── payout-display.tsx      # Potential payout calculation
    ├── leverage-selector.tsx   # Leverage toggle buttons
    ├── slippage-selector.tsx   # Slippage tolerance
    ├── confirm-button.tsx      # Place bet CTA
    ├── odds-warning.tsx        # Odds changed warning
    └── bet-result-toast.tsx    # Success/error toast
```

### Test Cases
- TC-F12: Modal opens with correct market info
- TC-F13: Amount input updates payout in real-time
- TC-F14: Leverage toggle updates collateral display
- TC-F15: Place bet → wallet popup → confirmation
- TC-F16: Insufficient balance shows warning
- TC-F17: Odds change >5% shows re-confirmation
- TC-F18: Market closes during modal → disabled state

### Dependencies
- Story 2.3

---

## Story 2.5: Leverage Toggle UI

**ID:** FETO-205  
**Day:** 9 | **Effort:** 0.5 day | **Priority:** P1

### Acceptance Criteria
- [ ] Leverage selector with 1x, 2x, 3x, 5x options (grayed out if market doesn't support)
- [ ] Dynamic collateral display: collateral = amount / leverage
- [ ] Dynamic liquidation threshold: shows the odds at which position gets liquidated
- [ ] Warning tooltip on high leverage (3x+): "High risk — you may lose your entire position"
- [ ] Funding rate display: "0.01% hourly on borrowed amount"
- [ ] Max leverage per market configurable (from on-chain data)

### Leverage Math Display
```
At 3x leverage on $10 bet:
  Collateral:    $3.33
  Position:      $10.00
  Borrowed:      $6.67
  Liq. threshold: If implied probability rises above 80%
  Funding rate:  $0.00067/hour
```

### Components
- `leverage-selector.tsx` (already created in Story 2.4)
- `liquidation-info.tsx` (new — shows liquidation details)
- `funding-rate-display.tsx` (new)

### Test Cases
- TC-F19: Leverage selector updates collateral correctly
- TC-F20: Liquidation threshold changes with different leverage
- TC-F21: Warning shown at 3x+
- TC-F22: Leverage disabled if market doesn't support it

### Dependencies
- Story 2.4

---

## Story 2.6: User Dashboard + History

**ID:** FETO-206  
**Day:** 10 | **Effort:** 1 day | **Priority:** P1

### Acceptance Criteria
- [ ] Dashboard page accessible from nav
- [ ] Portfolio summary card:
  - Total volume
  - Total P&L (with green/red indicator)
  - Win rate (%)
  - Active bets count
  - Current streak
- [ ] Active bets list:
  - Market description, outcome selected, amount, leverage
  - Current status (Active → Locked → Won/Lost)
  - Countdown to settlement
  - Claim button (if won and not claimed)
- [ ] Bet history:
  - Tab: All, Won, Lost, Liquidated
  - Each row: date, match, market, outcome, amount, odds, payout, net P&L
  - Paginated (20 per page)
- [ ] P&L chart (Recharts):
  - Time range: 7d, 30d, all-time
  - Cumulative P&L line chart
  - Green/Red gradient fill
- [ ] Recent settlements feed (real-time updates)
- [ ] Empty state: "No bets yet — start betting on a live match!"
- [ ] Connect wallet prompt if not connected

### UX Mock
```
┌──────────────────────────────┐
│ Dashboard          ⚙️      │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ Portfolio                │ │
│ │ Volume: $1,240           │ │
│ │ P&L: +$247.50   📈      │ │
│ │ Win Rate: 62% (8-5)      │ │
│ │ Active: 3 bets           │ │
│ │ Streak: 🔥 4 wins        │ │
│ └──────────────────────────┘ │
│                              │
│ Active Bets (3)              │
│ ┌──────────────────────────┐ │
│ │ Brazil vs Arg: Home Corner│ │
│ │ $10 @ +150   3x          │ │
│ │ ⏱ Settling in 45s  [Claim]│ │
│ └──────────────────────────┘ │
│                              │
│ History [All] [Won] [Lost]   │
│ ┌──────────────────────────┐ │
│ │ 07/05 Next Card YES $5 →│ │
│ │            +$7.50  ✅   │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ 07/05 Goal in 5min NO $10│ │
│ │            -$10.00 ❌   │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### Components
```
components/
└── dashboard/
    ├── portfolio-summary.tsx    # Overall stats card
    ├── active-bets.tsx          # Active positions list
    ├── bet-history.tsx          # Historical bets with filters
    ├── pnl-chart.tsx            # P&L over time (Recharts)
    ├── recent-settlements.tsx   # Live settlement feed
    ├── bet-row.tsx              # Single bet row
    ├── pnl-badge.tsx            # Green/red P&L indicator
    └── claim-button.tsx         # Claim payout button
```

### Test Cases
- TC-F23: Dashboard loads with user data
- TC-F24: Active bets display correctly
- TC-F25: Bet history pagination works
- TC-F26: P&L chart renders with correct data
- TC-F27: Claim button triggers payout transaction
- TC-F28: Empty state when no bets

### Dependencies
- Story 2.4, Backend API (user/history endpoints)

---

## Story 2.7: Real-Time WebSocket Integration

**ID:** FETO-207  
**Day:** 7-8 | **Effort:** 0.5 day | **Priority:** P0

### Acceptance Criteria
- [ ] WebSocket client connects to backend on app load
- [ ] Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- [ ] Event handlers for:
  - `match:update` → update match scores, time, status
  - `market:created` → add new market card
  - `market:settled` → update market state, show result
  - `odds:update` → animate odds changes
  - `position:liquidated` → show warning, update dashboard
- [ ] Connection status indicator (green dot = connected, red = disconnected)
- [ ] REST polling fallback when WebSocket disconnected
- [ ] Zustand store updated directly from WebSocket events
- [ ] Optimistic UI updates (show new data before confirmation)

### WebSocket Client
```typescript
class FetoWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  connect() {
    this.ws = new WebSocket(WS_URL);
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      store.setWsConnected(true);
    };
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.handleMessage(msg);
    };
    this.ws.onclose = () => {
      store.setWsConnected(false);
      this.reconnect();
    };
  }

  handleMessage(msg: WsMessage) {
    switch (msg.type) {
      case 'match:update':
        store.updateMatch(msg.payload);
        break;
      case 'market:created':
        store.addMarket(msg.payload);
        break;
      case 'market:settled':
        store.settleMarket(msg.payload);
        break;
      case 'odds:update':
        store.updateOdds(msg.payload);
        break;
      case 'position:liquidated':
        store.liquidatePosition(msg.payload);
        break;
    }
  }
}
```

### Dependencies
- Story 2.3 (market display), Backend API (WebSocket endpoint)

---

## Story 2.8: UI Polish + Animations

**ID:** FETO-208  
**Day:** 11 | **Effort:** 1 day | **Priority:** P2

### Acceptance Criteria
- [ ] Framer Motion animations:
  - Market cards: staggered entrance, swipe-to-dismiss
  - Odds changes: flash green/red with smooth number transition
  - Score updates: animated number flip
  - Bet confirmation: card flies to portfolio
  - Toast notifications: slide-in from top
  - Page transitions: fade + slight scale
- [ ] Loading states:
  - Skeleton screens for match list, market cards, dashboard
  - Spinner for transaction in progress
  - Progress bar for market countdown
- [ ] Empty states:
  - No matches: illustration + "Check back when matches are live"
  - No markets: "Markets coming soon..."
  - No bets: illustration + "Place your first bet!"
- [ ] Error states:
  - API error: "Something went wrong" + retry button
  - Transaction error: descriptive message + "Try again"
  - Wallet error: "Please connect your wallet"
- [ ] Touch feedback:
  - Button press: scale down to 0.95
  - Card tap: subtle lift shadow
  - Long press: haptic feedback (where available)
- [ ] Dark theme consistent across all pages
- [ ] Responsive breakpoints:
  - Mobile: 375px - 767px (primary target)
  - Tablet: 768px - 1023px
  - Desktop: 1024px+

### Animation Implementation
```tsx
// Staggered market cards
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

<motion.div variants={container} initial="hidden" animate="show">
  {markets.map(market => (
    <motion.div key={market.id} variants={item}>
      <MarketCard market={market} />
    </motion.div>
  ))}
</motion.div>
```

### Dependencies
- Story 2.6 (completed frontend)

---

## Story 2.9: Error States + Edge Case Handling

**ID:** FETO-209  
**Day:** 11-12 | **Effort:** 0.5 day | **Priority:** P2

### Acceptance Criteria

#### Error States
- [ ] API unavailable → "Service temporarily unavailable — retrying..." with auto-retry
- [ ] Wallet not connected → Prompt to connect, disable bet buttons
- [ ] Wrong network → "Please switch to Solana Devnet"
- [ ] Transaction failed → Show reason (blockhash expired, insufficient funds, etc.)
- [ ] Rate limited → "Too many requests — please wait"
- [ ] Market closed mid-bet → "Market just closed — bet cancelled"

#### Edge Cases
- [ ] Match abandoned → "Match abandoned — all bets refunded" banner
- [ ] VAR review → "Under review" badge on market, auto-updates when resolved
- [ ] Injury time → Market auto-extends, countdown updates
- [ ] Multiple wallet connections → Handle account switch gracefully
- [ ] Tab visibility → Pause WebSocket when tab hidden, resume on focus
- [ ] Offline mode → Show cached data, queue actions for retry
- [ ] Disconnected during bet → Show "Transaction submitted — check history"

### Error Handling Architecture
```typescript
// Centralized error handler
export function useErrorHandler() {
  const addToast = useStore(state => state.addToast);

  const handleTxError = (error: any) => {
    if (error.code === 4001) {
      addToast({ type: 'warning', message: 'Transaction was rejected in wallet' });
    } else if (error.message?.includes('blockhash not found')) {
      addToast({ type: 'error', message: 'Network congestion — please retry' });
    } else if (error.message?.includes('insufficient funds')) {
      addToast({ type: 'error', message: 'Insufficient balance for this bet' });
    } else if (error.message?.includes('MarketNotOpen')) {
      addToast({ type: 'warning', message: 'Market just closed — please try another market' });
    } else {
      addToast({ type: 'error', message: `Transaction failed: ${error.message}` });
    }
  };

  return { handleTxError };
}
```

### Dependencies
- Story 2.6 (all frontend features done)

---

## Performance Optimization

| Area | Technique | Target |
|------|-----------|--------|
| Bundle size | Dynamic imports + code splitting | < 300KB initial JS |
| Images | Next.js Image optimization, lazy loading | < 200ms LCP |
| API calls | React Query caching + stale-while-revalidate | Instant cache hits |
| WebSocket | Binary protocol if available, message batching | < 100ms latency |
| Animations | `will-change` hints, GPU-accelerated transforms | 60fps |
| Fonts | Next.js font optimization, subset loading | < 50ms font swap |

---

## Story Completion Checklist

For each story, verify before marking complete:
- [ ] Acceptance criteria met
- [ ] Components render without errors
- [ ] Mobile responsive (375px tested)
- [ ] Dark theme consistent
- [ ] Loading/error states handled
- [ ] Memory leaks checked (WebSocket cleanup, event listeners)
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] Builds successfully (`next build`)
