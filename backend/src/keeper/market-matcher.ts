import { logger } from "../utils/logger.js";
import type { TxlineEvent} from "./types.js";
import type { OnChainMarket } from "./types.js";
import type { ProofData } from "./proof-fetcher.js";
import { ProofFetcher } from "./proof-fetcher.js";

/**
 * Maps TxLINE match events to on-chain markets and fetches proofs.
 *
 * Event-to-market matching rules:
 *   goal        → match_result (who scored next) + total_goals (how many)
 *   corner      → total_corners
 *   yellow_card → total_yellow_cards
 *   match_status → match_result (final whsitle)
 */
export class MarketMatcher {
  private proofFetcher: ProofFetcher;

  constructor() {
    this.proofFetcher = new ProofFetcher();
  }

  /**
   * Fetch all open/locked markets for a given match from the backend API.
   */
  async getMarketsForMatch(matchId: number): Promise<OnChainMarket[]> {
    try {
      const resp = await fetch(
        `http://localhost:3001/api/matches/${matchId}/markets`,
      );
      if (!resp.ok) {
        logger.warn({ matchId, status: resp.status }, "Failed to fetch markets");
        return [];
      }
      const json = (await resp.json()) as { data?: OnChainMarket[] };
      return json.data ?? [];
    } catch (err) {
      logger.error({ err, matchId }, "Error fetching markets");
      return [];
    }
  }

  /**
   * Given a TxLINE event, determine which markets it should settle
   * and fetch proofs for each.
   *
   * Returns a list of {market, proof} pairs ready for settlement.
   */
  async matchEventToMarkets(
    event: TxlineEvent,
    markets: OnChainMarket[],
  ): Promise<Array<{ market: OnChainMarket; proof: ProofData }>> {
    const result: Array<{ market: OnChainMarket; proof: ProofData }> = [];

    for (const market of markets) {
      if (market.status !== "locked") continue;

      const shouldSettle = this.eventMatchesMarket(event, market);
      if (!shouldSettle) continue;

      // Determine the winning outcome from the event
      const winningOutcome = this.eventToOutcome(event, market);
      if (winningOutcome < 0) continue;

      // Fetch the proof from TxLINE
      const proof = await this.proofFetcher.fetchProof(
        event.fixture_id,
        event.type,
        event.minute,
      );

      if (!proof) {
        logger.debug(
          { fixtureId: event.fixture_id, eventType: event.type },
          "Proof not yet available, will retry",
        );
        continue;
      }

      result.push({
        market,
        proof: {
          ...proof,
          predictedOutcome: winningOutcome,
        },
      });
    }

    return result;
  }

  /**
   * Check if a TxLINE event should trigger settlement for a market.
   */
  private eventMatchesMarket(
    event: TxlineEvent,
    market: OnChainMarket,
  ): boolean {
    const mt = market.marketType.toLowerCase();

    switch (event.type) {
      case "goal":
        return mt === "match_result" || mt === "total_goals";
      case "match_status":
        // e.g. "full_time" — finalise match_result
        return mt === "match_result";
      case "corner":
        return mt === "corner" || mt === "total_corners";
      case "yellow_card":
      case "red_card":
        return mt === "yellow_card" || mt === "total_cards";
      default:
        return false;
    }
  }

  /**
   * Map event data to a market outcome index.
   * Returns -1 if no match.
   */
  private eventToOutcome(
    event: TxlineEvent,
    market: OnChainMarket,
  ): number {
    const mt = market.marketType.toLowerCase();

    // Match result markets: home win(0), away win(1), draw(2)
    if (mt === "match_result") {
      if (event.type === "goal") {
        return event.team === "home" ? 0 : 1;
      }
      // match_status could indicate draw
      return 2;
    }

    // Total goals / corners / cards: outcome index = current count
    if (
      mt === "total_goals" ||
      mt === "total_corners" ||
      mt === "yellow_card" ||
      mt === "total_cards"
    ) {
      // For over/under markets, the "winning" outcome is implied by
      // whether the count crossed the line. For simplicity, we
      // find the matching outcome label.
      const total = this.countEventsForMarket(event, mt);
      return this.findOutcomeForTotal(market, total);
    }

    return -1;
  }

  /**
   * Count events of the given type (simplified — requires match state).
   */
  private countEventsForMarket(
    _event: TxlineEvent,
    _marketType: string,
  ): number {
    // In a full implementation, we'd maintain a running counter of events
    // per match. For MVP, we return a placeholder that will be refined.
    // The keeper relies on TxLINE's proof system for the authoritative count.
    return 1;
  }

  /**
   * Find which outcome index matches the observed total.
   * e.g. "Over 2.5 goals" → outcome 0 (over) if total >= 3.
   */
  private findOutcomeForTotal(
    market: OnChainMarket,
    total: number,
  ): number {
    // Parse outcome labels like "Over 2.5" or "Under 2.5"
    for (let i = 0; i < market.outcomes.length; i++) {
      const label = market.outcomes[i].label.toLowerCase();
      if (label.startsWith("over")) {
        const threshold = parseFloat(label.replace("over", "").trim());
        if (!isNaN(threshold) && total > threshold) return i;
      }
      if (label.startsWith("under")) {
        const threshold = parseFloat(label.replace("under", "").trim());
        if (!isNaN(threshold) && total <= threshold) return i;
      }
    }
    return 0; // default to first outcome
  }
}
