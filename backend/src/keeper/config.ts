import "dotenv/config";

export const keeperConfig = {
  // Solana
  rpcEndpoint: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  factoryProgramId: process.env.PROGRAM_FACTORY_ID || "",
  escrowProgramId: process.env.PROGRAM_ESCROW_ID || "",
  keeperPrivateKey: process.env.KEEPER_PRIVATE_KEY || "",

  // TxLINE
  txlineApiUrl: process.env.TXLINE_API_URL || "https://txline-dev.txodds.com",
  txlineWsUrl: process.env.TXLINE_WS_URL || "",
  txlineApiKey: process.env.TXLINE_API_KEY || "",

  // Behavior
  pollIntervalMs: Number(process.env.KEEPER_POLL_INTERVAL) || 5_000,
  maxRetries: Number(process.env.KEEPER_MAX_RETRIES) || 3,
  retryDelayMs: Number(process.env.KEEPER_RETRY_DELAY) || 2_000,
  maxSettlementsPerBlock: Number(process.env.KEEPER_MAX_PER_BLOCK) || 3,

  // HTTP
  healthPort: Number(process.env.KEEPER_HEALTH_PORT) || 9090,

  // Fallback: poll REST API when WS is unavailable
  restPollEnabled: process.env.KEEPER_REST_POLL === "true" || false,

  // Demo mode: accept manual settlement triggers via HTTP
  demoMode: process.env.KEEPER_DEMO_MODE === "true" || false,
};
