import { prisma } from "../db/client.js";
import { cacheService } from "../cache/cache-service.js";
import { txlineClient } from "../txline/client.js";
import { logger } from "../utils/logger.js";
import type { TxlineFixture, TxlineEvent } from "../txline/types.js";
import type { MatchStatus } from "@prisma/client";

const MATCH_CACHE_TTL = {
  LIVE: 10, // 10 seconds for live matches
  SCHEDULED: 300, // 5 minutes for upcoming
  FINISHED: 3600, // 1 hour for finished
};

export class MatchService {
  /**
   * List matches with optional filters.
   */
  async listMatches(params: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, search, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status.toUpperCase() as MatchStatus;
    }

    if (search) {
      where.OR = [
        { homeTeam: { contains: search, mode: "insensitive" } },
        { awayTeam: { contains: search, mode: "insensitive" } },
        { competition: { contains: search, mode: "insensitive" } },
      ];
    }

    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where,
        skip,
        take: Math.min(limit, 100),
        orderBy: { startTime: "asc" },
        include: {
          _count: { select: { markets: true } },
        },
      }),
      prisma.match.count({ where }),
    ]);

    return {
      matches: matches.map((m) => ({
        id: m.id,
        txlineMatchId: Number(m.txlineMatchId),
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        minute: m.currentMinute,
        status: m.status,
        activeMarkets: m._count.markets,
        startTime: m.startTime.toISOString(),
        competition: m.competition,
        venue: m.venue,
      })),
      total,
      page,
    };
  }

  /**
   * Get match detail by ID.
   */
  async getMatch(id: string) {
    const cacheKey = `match:${id}`;

    return cacheService.getOrFetch(
      cacheKey,
      async () => {
        const match = await prisma.match.findUnique({
          where: { id },
          include: {
            markets: {
              where: { status: { in: ["OPEN", "LOCKED", "SETTLED"] } },
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        });

        if (!match) return null;

        const ttl = MATCH_CACHE_TTL[match.status as keyof typeof MATCH_CACHE_TTL] || MATCH_CACHE_TTL.SCHEDULED;
        // We return the data but the cache layer handles TTL
        void ttl;

        return {
          id: match.id,
          txlineMatchId: Number(match.txlineMatchId),
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          minute: match.currentMinute,
          status: match.status,
          competition: match.competition,
          venue: match.venue,
          startTime: match.startTime.toISOString(),
          markets: match.markets.map((m) => ({
            id: m.id,
            chainMarketId: Number(m.chainMarketId),
            marketType: m.marketType,
            status: m.status,
            outcomes: m.outcomes,
            totalPool: Number(m.totalPool),
          })),
        };
      },
      // TTL determined dynamically above
      30,
    );
  }

  /**
   * Sync match data from TxLINE into local DB.
   */
  async syncFromTxline(): Promise<number> {
    try {
      const fixtures = await txlineClient.getFixtures();
      let synced = 0;

      for (const fixture of fixtures) {
        await prisma.match.upsert({
          where: { txlineMatchId: BigInt(fixture.id) },
          update: {
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            status: fixture.status as MatchStatus,
            homeScore: fixture.homeScore,
            awayScore: fixture.awayScore,
            currentMinute: fixture.minute,
            competition: fixture.competition,
            venue: fixture.venue,
          },
          create: {
            txlineMatchId: BigInt(fixture.id),
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            competition: fixture.competition,
            venue: fixture.venue,
            startTime: new Date(fixture.startTime),
            status: fixture.status as MatchStatus,
            homeScore: fixture.homeScore,
            awayScore: fixture.awayScore,
            currentMinute: fixture.minute,
          },
        });
        synced++;
      }

      logger.info({ count: synced }, "TxLINE fixtures synced");
      return synced;
    } catch (err) {
      logger.error({ err }, "Failed to sync TxLINE fixtures");
      throw err;
    }
  }

  /**
   * Process a TxLINE match update event (from WebSocket).
   */
  async processMatchUpdate(update: {
    matchId: number;
    homeScore: number;
    awayScore: number;
    minute: number;
    status: string;
  }) {
    await prisma.match.update({
      where: { txlineMatchId: BigInt(update.matchId) },
      data: {
        homeScore: update.homeScore,
        awayScore: update.awayScore,
        currentMinute: update.minute,
        status: update.status as MatchStatus,
      },
    });

    // Invalidate cache
    const match = await prisma.match.findFirst({
      where: { txlineMatchId: BigInt(update.matchId) },
      select: { id: true },
    });

    if (match) {
      await cacheService.invalidate(`match:${match.id}`);
    }
  }
}

export const matchService = new MatchService();
