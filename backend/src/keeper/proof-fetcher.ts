import { logger } from "../utils/logger.js";
import { keeperConfig } from "./config.js";
import { keccak_256 } from "@noble/hashes/sha3";

export interface ProofData {
  /** Merkle root hash (40 hex chars, from TxLINE) */
  root: string;
  /** Hex proof path */
  proofPath: string[];
  /** Leaf hash */
  leaf: string;
  /** Probability weight (0-10000 basis points) */
  probabilityBps: number;
  /** Outcome index that this proof validates */
  predictedOutcome: number;
}

/**
 * TxLINE proof fetcher.
 *
 * For a given match event (e.g. "goal at minute 73"),
 * fetch the corresponding Merkle proof from TxLINE's API.
 *
 * The proof proves that the event was committed to TxLINE's
 * oracle tree, enabling trustless settlement on-chain.
 */
export class ProofFetcher {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = keeperConfig.txlineApiUrl;
    this.apiKey = keeperConfig.txlineApiKey;
  }

  /**
   * Fetch a Merkle proof for a specific match event.
   *
   * @param fixtureId - TxLINE fixture ID
   * @param eventType - event type string (goal, corner, yellow_card, etc.)
   * @param minute - match minute the event occurred
   * @returns ProofData if found, null if not yet available
   */
  async fetchProof(
    fixtureId: number,
    eventType: string,
    minute: number,
  ): Promise<ProofData | null> {
    try {
      const url = `${this.baseUrl}/fixtures/${fixtureId}/events/${eventType}/${minute}/proof`;

      const resp = await fetch(url, {
        headers: this.apiKey
          ? { Authorization: `Bearer ${this.apiKey}` }
          : undefined,
      });

      if (resp.status === 404) {
        logger.debug(
          { fixtureId, eventType, minute },
          "Proof not yet available (404)",
        );
        return null;
      }

      if (!resp.ok) {
        logger.warn(
          { status: resp.status, fixtureId, eventType, minute },
          "Proof fetch failed",
        );
        return null;
      }

      const json = (await resp.json()) as {
        root: string;
        proof_path: string[];
        leaf: string;
        probability_bps?: number;
        predicted_outcome?: number;
      };

      return {
        root: json.root,
        proofPath: json.proof_path,
        leaf: json.leaf,
        probabilityBps: json.probability_bps ?? 0,
        predictedOutcome: json.predicted_outcome ?? 0,
      };
    } catch (err) {
      logger.error({ err, fixtureId, eventType, minute }, "Proof fetch error");
      return null;
    }
  }

  /**
   * Compute the expected leaf hash from event data.
   * Used to verify the proof locally before submitting on-chain.
   *
   * @param fixtureId - fixture ID as string
   * @param eventType - event type string
   * @param minute - match minute
   * @returns 32-byte hex-encoded leaf hash
   */
  computeLeafHash(
    fixtureId: string,
    eventType: string,
    minute: number,
  ): string {
    const data = new TextEncoder().encode(
      `${fixtureId}:${eventType}:${minute}`,
    );
    const hash = keccak_256(data);
    return Buffer.from(hash).toString("hex");
  }

  /**
   * Compute the Merkle root from a leaf and proof path.
   * Used for local verification before on-chain submission.
   *
   * @param leaf - hex leaf hash
   * @param proofPath - sorted hex proof path siblings
   * @returns calculated root (hex)
   */
  computeRoot(leaf: string, proofPath: string[]): string {
    let current = Buffer.from(leaf, "hex");

    for (const siblingHex of proofPath) {
      const sibling = Buffer.from(siblingHex, "hex");
      // Sort: smaller first (standard Merkle tree convention)
      const left = Buffer.compare(current, sibling) < 0 ? current : sibling;
      const right = left === current ? sibling : current;
      current = Buffer.from(keccak_256(Buffer.concat([left, right])));
    }

    return current.toString("hex");
  }
}
