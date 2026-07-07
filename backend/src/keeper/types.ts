/**
 * TxLINE match events received via WebSocket.
 */
export interface TxlineEvent {
  fixture_id: number;
  type: "corner" | "goal" | "yellow_card" | "red_card" | "substitution" | "match_status";
  team: "home" | "away";
  player?: string;
  minute: number;
  timestamp: number;
  event_id?: string;
  merkle_proof?: TxlineProof;
}

export interface TxlineProof {
  root: string;
  proof_path: string[];
  leaf: string;
  signature: string;
}

/**
 * On-chain market state (read from factory program).
 */
export interface OnChainMarket {
  pda: string;
  chainMarketId: number;
  matchId: number;
  marketType: string;
  status: "open" | "locked" | "settled" | "cancelled";
  outcomes: Array<{ label: string; oddsDecimal: number }>;
  winningOutcome: number | null;
}

/**
 * Settlement attempt result.
 */
export interface SettlementResult {
  marketId: number;
  eventType: string;
  winningOutcome: number;
  signature?: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

/**
 * Keeper metrics snapshot.
 */
export interface KeeperMetrics {
  eventsReceived: number;
  eventsProcessed: number;
  settlementsAttempted: number;
  settlementsSuccessful: number;
  settlementsFailed: number;
  wsConnected: boolean;
  uptime: number;
  lastSettlementTime: string | null;
  lastEventTime: string | null;
}
