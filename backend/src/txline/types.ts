/**
 * TxLINE API type definitions.
 *
 * Based on TxLINE World Cup Free Tier (Service Level 12).
 * These are approximate — adjust field names after connecting to the actual API.
 */

export interface TxlineFixture {
  id: number;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  venue: string;
  startTime: string; // ISO 8601
  status: "SCHEDULED" | "LIVE" | "PAUSED" | "FINISHED" | "ABANDONED";
  homeScore: number;
  awayScore: number;
  minute: number;
  fixtureHash?: string; // For on-chain verification
}

export interface TxlineFixturesResponse {
  fixtures: TxlineFixture[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TxlineEvent {
  id: number;
  matchId: number;
  eventType: string; // e.g., "GOAL", "CORNER", "CARD", "SUBSTITUTION"
  team: "home" | "away";
  player?: string;
  minute: number;
  timestamp: string; // ISO 8601
  fixtureHash?: string;
}

export interface TxlineMatchDetail {
  fixture: TxlineFixture;
  events: TxlineEvent[];
  markets?: TxlineMarket[];
}

export interface TxlineMarket {
  id: number;
  fixtureId: number;
  marketType: string;
  status: "OPEN" | "LOCKED" | "SETTLED" | "CANCELLED";
  outcomes: TxlineOutcome[];
  lockTime: string;
  winningOutcome?: number;
}

export interface TxlineOutcome {
  index: number;
  label: string;
  oddsDecimal: number;
  oddsAmerican: string;
  impliedProbability: number;
}

/**
 * TxLINE WebSocket message types.
 */
export type TxlineWsMessage =
  | { type: "MATCH_UPDATE"; payload: TxlineMatchUpdatePayload; timestamp: number }
  | { type: "EVENT"; payload: TxlineEvent; timestamp: number }
  | { type: "MARKET_UPDATE"; payload: Record<string, unknown>; timestamp: number }
  | { type: "ODDS_CHANGE"; payload: Record<string, unknown>; timestamp: number };

export interface TxlineMatchUpdatePayload {
  matchId: number;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
}
