// ── Solana ──
export const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Solana mainnet USDC
// Devnet USDC:
// export const USDC_MINT = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr";

// ── Program IDs (placeholder — set via env after devnet deploy) ──
export function getProgramIds() {
  return {
    factory: process.env.PROGRAM_FACTORY_ID || "",
    escrow: process.env.PROGRAM_ESCROW_ID || "",
    settlement: process.env.PROGRAM_SETTLE_ID || "",
  };
}

// ── API ──
export const API_VERSION = "v1";
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ── Betting Limits ──
export const MIN_BET_AMOUNT = 0.01; // USDC
export const MAX_BET_AMOUNT = 10_000; // USDC
export const MAX_LEVERAGE = 10;
export const MAX_SLIPPAGE_BPS = 500; // 5%

// ── Rate Limits ──
export const RATE_LIMITS = {
  bet: { limit: 10, window: 60 }, // 10 bets/min
  api: { limit: 100, window: 60 }, // 100 req/min (unauthenticated)
  apiAuth: { limit: 500, window: 60 }, // 500 req/min (authenticated)
  claim: { limit: 5, window: 60 }, // 5 claims/min
  ws: { limit: 100, window: 1 }, // 100 msg/sec per client
} as const;
