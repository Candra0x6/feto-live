import { prisma } from "../db/client.js";
import { cacheService } from "../cache/cache-service.js";
import { logger } from "../utils/logger.js";
import type { MarketType, MarketStatus } from "@prisma/client";

interface MarketOutcome {
  label: string;
  oddsDecimal: number;
  oddsAmerican: string;
  impliedProbability: number;
}

interface CreateMarketInput {
  matchId: string;
  chainMarketId: number;
  marketType: MarketType;
  outcomes: MarketOutcome[];
  lockTime: Date;
  leverageEnabled?: boolean;
  maxLeverage?: number;
}

export class MarketService {
  /**
   * Get all markets for a match.
   */
  async getMatchMarkets(matchId: string, filters?: { type?: string; status?: string }) {
    const cacheKey = `match:${matchId}:markets`;

    return cacheService.getOrFetch(
      cacheKey,
      async () => {
        const where: any = { matchId };

        if (filters?.type) {
          where.marketType = filters.type.toUpperCase();
        }
        if (filters?.status) {
          where.status = filters.status.toUpperCase();
        }

        const markets = await prisma.market.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 50,
        });

        return markets.map((m) => ({
          id: m.id,
          chainMarketId: Number(m.chainMarketId),
          marketType: m.marketType,
          status: m.status,
          outcomes: m.outcomes as unknown as MarketOutcome[],
          totalPool: Number(m.totalPool),
          lockTime: m.lockTime?.toISOString() || null,
          leverageEnabled: m.leverageEnabled,
          maxLeverage: m.maxLeverage,
        }));
      },
      30, // 30s cache
    );
  }

  /**
   * Get a single market by ID.
   */
  async getMarket(id: string) {
    const cacheKey = `market:${id}`;

    return cacheService.getOrFetch(
      cacheKey,
      async () => {
        const market = await prisma.market.findUnique({ where: { id } });
        if (!market) return null;

        return {
          id: market.id,
          chainMarketId: Number(market.chainMarketId),
          matchId: market.matchId,
          marketType: market.marketType,
          status: market.status,
          outcomes: market.outcomes as unknown as MarketOutcome[],
          totalPool: Number(market.totalPool),
          lockTime: market.lockTime?.toISOString() || null,
          settlementTime: market.settlementTime?.toISOString() || null,
          winningOutcome: market.winningOutcome,
          leverageEnabled: market.leverageEnabled,
          maxLeverage: market.maxLeverage,
        };
      },
      15, // 15s cache
    );
  }

  /**
   * Create a new market (on-chain market already exists).
   */
  async createMarket(input: CreateMarketInput) {
    const market = await prisma.market.create({
      data: {
        chainMarketId: BigInt(input.chainMarketId),
        matchId: input.matchId,
        marketType: input.marketType,
        outcomes: JSON.stringify(input.outcomes),
        lockTime: input.lockTime,
        leverageEnabled: input.leverageEnabled ?? false,
        maxLeverage: input.maxLeverage ?? 1,
        status: "OPEN",
      },
    });

    // Invalidate match markets cache
    await cacheService.invalidate(`match:${input.matchId}:markets`);

    logger.info({ marketId: market.id, type: input.marketType }, "Market created");
    return market;
  }

  /**
   * Auto-generate markets based on game state.
   * Called when a match transitions (new period, event occurs, etc.)
   */
  async autoGenerateMarkets(matchId: string): Promise<number> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        markets: {
          where: { status: { not: "CANCELLED" } },
          select: { marketType: true, status: true },
        },
      },
    });

    if (!match) {
      logger.warn({ matchId }, "Cannot auto-generate: match not found");
      return 0;
    }

    const activeMarkets = match.markets.filter(
      (m) => m.status === "OPEN" || m.status === "LOCKED",
    );
    const settledMarkets = match.markets.filter(
      (m) => m.status === "SETTLED" || m.status === "CANCELLED",
    );

    const generated: string[] = [];

    // Rule 1: Next Corner — when previous corner market settles
    const settledCorners = settledMarkets.filter((m) => m.marketType === "NEXT_CORNER");
    const activeCorners = activeMarkets.filter((m) => m.marketType === "NEXT_CORNER");
    if (settledCorners.length > 0 && activeCorners.length === 0) {
      generated.push("NEXT_CORNER");
    }

    // Rule 2: Goal in 5 min — every 5 minutes of match time
    const goalMarkets = activeMarkets.filter((m) => m.marketType === "GOAL_IN_5_MIN");
    if (goalMarkets.length < 2) {
      // Keep at least one active goal market
      const activeGoal = goalMarkets.length;
      const toCreate = Math.max(0, 2 - activeGoal);
      for (let i = 0; i < toCreate; i++) {
        generated.push("GOAL_IN_5_MIN");
      }
    }

    // Rule 3: Next Card — when previous card window expires
    const settledCards = settledMarkets.filter((m) => m.marketType === "NEXT_CARD");
    const activeCards = activeMarkets.filter((m) => m.marketType === "NEXT_CARD");
    if (settledCards.length > 0 && activeCards.length === 0) {
      generated.push("NEXT_CARD");
    }

    // Create the generated markets
    for (const marketType of generated.slice(0, 3)) {
      // Enforce max 3 concurrent per type
      const concurrentOfType = activeMarkets.filter((m) => m.marketType === marketType).length;
      if (concurrentOfType >= 3) {
        logger.debug({ marketType }, "Max concurrent markets reached, skipping");
        continue;
      }

      const outcomes = this.getDefaultOutcomes(marketType as MarketType);
      if (!outcomes) continue;

      await this.createMarket({
        matchId,
        chainMarketId: Date.now() % 100000, // Temporary — real ID comes from on-chain
        marketType: marketType as MarketType,
        outcomes,
        lockTime: new Date(Date.now() + 300_000), // 5 min lock
        leverageEnabled: marketType === "NEXT_CORNER" || marketType === "NEXT_CARD",
        maxLeverage: marketType === "NEXT_CORNER" ? 5 : 3,
      });
    }

    if (generated.length > 0) {
      logger.info({ matchId, generated }, "Auto-generated markets");
    }

    return generated.length;
  }

  /**
   * Get default outcomes for a given market type.
   */
  private getDefaultOutcomes(marketType: MarketType): MarketOutcome[] | null {
    switch (marketType) {
      case "NEXT_CORNER":
        return [
          { label: "Home Team", oddsDecimal: 2.10, oddsAmerican: "+110", impliedProbability: 47.6 },
          { label: "Away Team", oddsDecimal: 1.80, oddsAmerican: "-125", impliedProbability: 55.6 },
          { label: "No Corner (5 min)", oddsDecimal: 15.00, oddsAmerican: "+1400", impliedProbability: 6.7 },
        ];
      case "NEXT_CARD":
        return [
          { label: "Home Team", oddsDecimal: 2.50, oddsAmerican: "+150", impliedProbability: 40.0 },
          { label: "Away Team", oddsDecimal: 1.67, oddsAmerican: "-149", impliedProbability: 60.0 },
          { label: "No Card (5 min)", oddsDecimal: 10.00, oddsAmerican: "+900", impliedProbability: 10.0 },
        ];
      case "GOAL_IN_5_MIN":
        return [
          { label: "Yes", oddsDecimal: 3.50, oddsAmerican: "+250", impliedProbability: 28.6 },
          { label: "No", oddsDecimal: 1.29, oddsAmerican: "-345", impliedProbability: 77.5 },
        ];
      case "NEXT_SUBSTITUTION":
        return [
          { label: "Home Team", oddsDecimal: 2.20, oddsAmerican: "+120", impliedProbability: 45.5 },
          { label: "Away Team", oddsDecimal: 1.70, oddsAmerican: "-143", impliedProbability: 58.8 },
          { label: "No Sub (5 min)", oddsDecimal: 12.00, oddsAmerican: "+1100", impliedProbability: 8.3 },
        ];
      case "NEXT_GOAL_SCORER":
        return [
          { label: "Home Player", oddsDecimal: 5.00, oddsAmerican: "+400", impliedProbability: 20.0 },
          { label: "Away Player", oddsDecimal: 4.50, oddsAmerican: "+350", impliedProbability: 22.2 },
        ];
      case "ANY_GOAL":
        return [
          { label: "Home Goal", oddsDecimal: 2.80, oddsAmerican: "+180", impliedProbability: 35.7 },
          { label: "Away Goal", oddsDecimal: 2.60, oddsAmerican: "+160", impliedProbability: 38.5 },
          { label: "No Goal", oddsDecimal: 3.20, oddsAmerican: "+220", impliedProbability: 31.3 },
        ];
      default:
        return null;
    }
  }

  /**
   * Update market status (lock, settle, cancel).
   */
  async updateMarketStatus(
    id: string,
    status: MarketStatus,
    winningOutcome?: number,
  ) {
    const data: any = { status };

    if (status === "LOCKED") {
      data.lockTime = new Date();
    }

    if (status === "SETTLED") {
      data.winningOutcome = winningOutcome;
      data.settlementTime = new Date();
    }

    const market = await prisma.market.update({
      where: { id },
      data,
    });

    // Invalidate caches
    await cacheService.invalidate(`market:${id}`);
    await cacheService.invalidate(`match:${market.matchId}:markets`);

    logger.info({ marketId: id, status }, "Market status updated");
    return market;
  }
}

export const marketService = new MarketService();
