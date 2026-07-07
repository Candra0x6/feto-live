import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak_256 } from "@noble/hashes/sha3";
import { logger } from "../utils/logger.js";
import { keeperConfig } from "./config.js";
import type { OnChainMarket, SettlementResult } from "./types.js";
import type { ProofData } from "./proof-fetcher.js";

// ── IDL loading ─────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFactoryIdl(): Record<string, unknown> {
  const idlPath = resolve(
    __dirname,
    "../../../../feto/target/idl/feto_factory.json",
  );
  try {
    return JSON.parse(readFileSync(idlPath, "utf-8")) as Record<
      string,
      unknown
    >;
  } catch (err) {
    logger.error({ err, idlPath }, "Failed to load factory IDL");
    throw err;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Compute the 8-byte Anchor discriminator for an instruction.
 * SHA256("global:<ix_name>")[..8]
 */
function anchorDiscriminator(ixName: string): Buffer {
  const hash = keccak_256(Buffer.from(`global:${ixName}`));
  return Buffer.from(hash.slice(0, 8));
}

/**
 * Borsh-serialize a TxlineProof struct.
 *
 * Layout (matching Anchor/Borsh for the Rust struct):
 *   root:        [u8; 32]  (fixed)
 *   proof_path:  Vec<[u8; 32]>  (u32 length prefix, then N×32 bytes)
 *   leaf:        [u8; 32]
 *   signature:   [u8; 64]
 *   fixture_id:  u64 (LE)
 *   event_type:  u8
 *   event_team:  u8
 *   timestamp:   i64 (LE)
 */
function serializeProof(proof: {
  root: Uint8Array;
  proofPath: Uint8Array[];
  leaf: Uint8Array;
  signature: Uint8Array;
  fixtureId: bigint;
  eventType: number;
  eventTeam: number;
  timestamp: bigint;
}): Buffer {
  // Calculate size
  // root(32) + path_len(4) + path_data(N*32) + leaf(32) + signature(64) + fixture_id(8) + type(1) + team(1) + timestamp(8)
  const pathDataSize = proof.proofPath.reduce((s, p) => s + p.length, 0);
  const totalSize = 32 + 4 + pathDataSize + 32 + 64 + 8 + 1 + 1 + 8;
  const buf = Buffer.alloc(totalSize);
  let offset = 0;

  // root [u8; 32]
  buf.set(proof.root, offset);
  offset += 32;

  // proof_path Vec<[u8; 32]> — Borsh uses u32 LE length
  buf.writeUInt32LE(proof.proofPath.length, offset);
  offset += 4;
  for (const p of proof.proofPath) {
    buf.set(p, offset);
    offset += p.length;
  }

  // leaf [u8; 32]
  buf.set(proof.leaf, offset);
  offset += 32;

  // signature [u8; 64]
  buf.set(proof.signature, offset);
  offset += 64;

  // fixture_id u64 LE
  buf.writeBigUInt64LE(proof.fixtureId, offset);
  offset += 8;

  // event_type u8
  buf.writeUInt8(proof.eventType, offset);
  offset += 1;

  // event_team u8
  buf.writeUInt8(proof.eventTeam, offset);
  offset += 1;

  // timestamp i64 LE
  buf.writeBigInt64LE(proof.timestamp, offset);
  offset += 8;

  return buf;
}

// ── Settlement Service ───────────────────────────────────────────────

export class SettlementService {
  private connection: Connection;
  private factoryId: PublicKey;
  private keeper: Keypair;
  private ready = false;

  constructor() {
    this.connection = new Connection(keeperConfig.rpcEndpoint, "confirmed");
    this.factoryId = new PublicKey(keeperConfig.factoryProgramId);
    this.keeper = this.loadKeeper();
  }

  isReady(): boolean {
    return this.ready;
  }

  getKeeperPubkey(): string {
    return this.keeper.publicKey.toBase58();
  }

  /**
   * Submit a `settle_market` transaction.
   */
  async settleMarket(
    market: OnChainMarket,
    proof: ProofData,
  ): Promise<SettlementResult> {
    const start = Date.now();

    try {
      if (!this.ready) {
        return {
          marketId: market.chainMarketId,
          eventType: market.marketType,
          winningOutcome: proof.predictedOutcome,
          success: false,
          error: "Keeper not initialized — no private key configured",
          durationMs: Date.now() - start,
        };
      }

      if (market.status !== "locked") {
        return {
          marketId: market.chainMarketId,
          eventType: market.marketType,
          winningOutcome: proof.predictedOutcome,
          success: false,
          error: `Market status is "${market.status}", expected "locked"`,
          durationMs: Date.now() - start,
        };
      }

      // ── Derive PDAs ─────────────────────────────────────────────

      const marketIdLE = Buffer.alloc(8);
      marketIdLE.writeBigUInt64LE(BigInt(market.chainMarketId));

      const matchIdLE = Buffer.alloc(8);
      matchIdLE.writeBigUInt64LE(BigInt(market.matchId));

      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        this.factoryId,
      );

      const [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), marketIdLE],
        this.factoryId,
      );

      const [matchPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), matchIdLE],
        this.factoryId,
      );

      // ── Build instruction data ──────────────────────────────────

      const discriminator = anchorDiscriminator("settle_market");

      const proofRoot = Buffer.from(proof.root, "hex");
      const proofLeaf = Buffer.from(proof.leaf, "hex");
      const proofPath = proof.proofPath.map((s) => Buffer.from(s, "hex"));

      const txlineProof = serializeProof({
        root: proofRoot,
        proofPath,
        leaf: proofLeaf,
        // For MVP: zeroed signature (TxLINE sig verification not enabled)
        signature: Buffer.alloc(64),
        fixtureId: BigInt(market.matchId),
        eventType: marketTypeToEventCode(market.marketType),
        eventTeam: outcomeToTeam(proof.predictedOutcome),
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
      });

      // Final data: discriminator(8) + winning_outcome(1) + proof(Variable)
      const dataBuffer = Buffer.concat([
        discriminator,
        Buffer.from([proof.predictedOutcome]),
        txlineProof,
      ]);

      // ── Build and send transaction ──────────────────────────────

      const ix = {
        programId: this.factoryId,
        keys: [
          { pubkey: this.keeper.publicKey, isSigner: true, isWritable: true },
          { pubkey: configPda, isSigner: false, isWritable: false },
          { pubkey: marketPda, isSigner: false, isWritable: true },
          { pubkey: matchPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: dataBuffer,
      };

      const tx = new Transaction().add({
        programId: ix.programId,
        keys: ix.keys,
        data: ix.data,
      });

      tx.feePayer = this.keeper.publicKey;

      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.keeper],
        { commitment: "confirmed", maxRetries: 3 },
      );

      logger.info(
        {
          marketId: market.chainMarketId,
          outcome: proof.predictedOutcome,
          signature,
        },
        "✅ Market settled successfully",
      );

      return {
        marketId: market.chainMarketId,
        eventType: market.marketType,
        winningOutcome: proof.predictedOutcome,
        signature,
        success: true,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, marketId: market.chainMarketId },
        "❌ Settlement failed",
      );

      return {
        marketId: market.chainMarketId,
        eventType: market.marketType,
        winningOutcome: proof.predictedOutcome,
        success: false,
        error: msg,
        durationMs: Date.now() - start,
      };
    }
  }

  private loadKeeper(): Keypair {
    if (keeperConfig.keeperPrivateKey) {
      try {
        const secret = Uint8Array.from(
          JSON.parse(keeperConfig.keeperPrivateKey),
        );
        const kp = Keypair.fromSecretKey(secret);
        logger.info({ pubkey: kp.publicKey.toBase58() }, "Keeper keypair loaded");
        this.ready = true;
        return kp;
      } catch (err) {
        logger.error(err, "Failed to parse keeper private key");
      }
    }

    const kp = Keypair.generate();
    logger.warn(
      { pubkey: kp.publicKey.toBase58() },
      "No KEEPER_PRIVATE_KEY in env — using ephemeral keypair (tx will fail)",
    );
    return kp;
  }
}

// ── Mapping helpers ─────────────────────────────────────────────────

function marketTypeToEventCode(marketType: string): number {
  const map: Record<string, number> = {
    goal: 1,
    corner: 2,
    yellow_card: 3,
    red_card: 4,
    substitution: 5,
    match_result: 6,
    total_goals: 7,
  };
  return map[marketType.toLowerCase()] ?? 0;
}

function outcomeToTeam(outcomeIndex: number): number {
  // Convention: 0 = home, 1 = away, 2 = draw
  if (outcomeIndex === 2) return 2;
  return outcomeIndex <= 0 ? 0 : 1;
}
