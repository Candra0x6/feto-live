import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

/**
 * Solana connection and program helper.
 * Provides on-chain data reads for odds, market status, etc.
 */
export class SolanaService {
  public connection: Connection;
  public factoryProgramId: PublicKey;
  public escrowProgramId: PublicKey;
  public settlementProgramId: PublicKey;

  constructor() {
    this.connection = new Connection(config.SOLANA_RPC_URL, "confirmed");
    this.factoryProgramId = new PublicKey(config.PROGRAM_FACTORY_ID || "11111111111111111111111111111111");
    this.escrowProgramId = new PublicKey(config.PROGRAM_ESCROW_ID || "11111111111111111111111111111111");
    this.settlementProgramId = new PublicKey(config.PROGRAM_SETTLE_ID || "11111111111111111111111111111111");
  }

  /**
   * Get on-chain odds for a market.
   * Reads the Market account from the factory program.
   */
  async getMarketOdds(chainMarketId: number): Promise<{ outcomes: { oddsDecimal: number }[] } | null> {
    try {
      // Derive market PDA
      const [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(new Uint8Array(new Uint32Array([chainMarketId]).buffer))],
        this.factoryProgramId,
      );

      const accountInfo = await this.connection.getAccountInfo(marketPda);
      if (!accountInfo) return null;

      // Parse the account data (Anchor IDL format)
      // Skip 8-byte discriminator, then AnchorDeserialize
      const data = accountInfo.data.slice(8);
      const outcomes = this.parseOutcomes(data);

      return { outcomes };
    } catch (err) {
      logger.error({ err, chainMarketId }, "Failed to fetch on-chain odds");
      return null;
    }
  }

  /**
   * Get the config PDA address (shared across programs).
   */
  getConfigPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      this.factoryProgramId,
    );
    return pda;
  }

  /**
   * Get market vault PDA.
   */
  getMarketVaultPda(chainMarketId: number): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("market_vault"),
        Buffer.from(new Uint8Array(new Uint32Array([chainMarketId]).buffer)),
      ],
      this.escrowProgramId,
    );
    return pda;
  }

  /**
   * Get position PDA for a user + market.
   */
  getPositionPda(chainMarketId: number, userPubkey: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        Buffer.from(new Uint8Array(new Uint32Array([chainMarketId]).buffer)),
        userPubkey.toBuffer(),
      ],
      this.escrowProgramId,
    );
    return pda;
  }

  /**
   * Parse outcomes from market account data.
   * This is a simplified parser — in production, use Anchor's TS client.
   */
  private parseOutcomes(data: Buffer): { oddsDecimal: number }[] {
    // Market account layout (simplified):
    // chain_market_id: u64 (8 bytes)
    // match_id: u64 (8 bytes)
    // market_type: u8 (1 byte)
    // status: u8 (1 byte)
    // num_outcomes: u8 (1 byte)
    // Then for each outcome:
    //   odds: u64 (8 bytes) — stored as scaled integer (e.g., 150 = 1.50)

    if (data.length < 19) return [];

    const numOutcomes = data[18]; // offset for outcome count
    const outcomes: { oddsDecimal: number }[] = [];

    let offset = 19;
    for (let i = 0; i < numOutcomes; i++) {
      if (offset + 8 > data.length) break;
      const rawOdds = Number(data.readBigUInt64LE(offset));
      outcomes.push({ oddsDecimal: rawOdds / 100 });
      offset += 8;
    }

    return outcomes;
  }

  /**
   * Check if program IDs are configured (not placeholder).
   */
  get isConfigured(): boolean {
    return (
      config.PROGRAM_FACTORY_ID !== "" &&
      config.PROGRAM_FACTORY_ID !== "11111111111111111111111111111111"
    );
  }
}

export const solanaService = new SolanaService();
