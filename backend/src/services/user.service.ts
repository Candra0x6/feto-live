import { prisma } from "../db/client.js";
import { cacheService } from "../cache/cache-service.js";
import { logger } from "../utils/logger.js";

export class UserService {
  /**
   * Get or create a user by wallet address.
   */
  async getOrCreateUser(walletAddress: string) {
    return prisma.user.upsert({
      where: { walletAddress },
      update: { lastActive: new Date() },
      create: { walletAddress },
    });
  }

  /**
   * Get user profile with stats.
   */
  async getProfile(walletAddress: string) {
    const cacheKey = `user:${walletAddress}:profile`;

    return cacheService.getOrFetch(
      cacheKey,
      async () => {
        const user = await prisma.user.findUnique({ where: { walletAddress } });
        if (!user) return null;

        return {
          walletAddress: user.walletAddress,
          username: user.username,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt.toISOString(),
          totalBets: user.totalBets,
          totalWins: user.totalWins,
          totalVolume: Number(user.totalVolume),
          totalPnl: Number(user.totalPnl),
          streakBest: user.streakBest,
          streakCurrent: user.streakCurrent,
          winRate: user.totalBets > 0
            ? Math.round((user.totalWins / user.totalBets) * 100)
            : 0,
        };
      },
      60, // 1 min cache
    );
  }

  /**
   * Get user's positions (active bets).
   */
  async getPositions(walletAddress: string, status?: string) {
    const cacheKey = `user:${walletAddress}:positions`;

    return cacheService.getOrFetch(
      cacheKey,
      async () => {
        const where: any = { walletAddress };
        if (status) {
          where.status = status.toUpperCase();
        }

        const positions = await prisma.position.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            market: {
              select: {
                marketType: true,
                status: true,
                outcomes: true,
                winningOutcome: true,
              },
            },
          },
        });

        return positions.map((p) => ({
          id: p.id,
          marketType: p.market.marketType,
          outcomeIndex: p.outcomeIndex,
          amount: Number(p.amount),
          leverage: p.leverage,
          collateral: Number(p.collateral),
          oddsAtEntry: Number(p.oddsAtEntry),
          potentialPayout: Number(p.potentialPayout),
          status: p.status,
          claimed: p.claimed,
          payoutAmount: Number(p.payoutAmount),
          createdAt: p.createdAt.toISOString(),
          settledAt: p.settledAt?.toISOString() || null,
        }));
      },
      60, // 1 min cache
    );
  }

  /**
   * Get bet history with pagination.
   */
  async getHistory(
    walletAddress: string,
    options: { status?: string; page?: number; limit?: number },
  ) {
    const { status, page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const where: any = { walletAddress };
    if (status) {
      where.status = status.toUpperCase();
    }

    const [positions, total] = await Promise.all([
      prisma.position.findMany({
        where,
        skip,
        take: Math.min(limit, 100),
        orderBy: { createdAt: "desc" },
        include: {
          market: {
            select: { marketType: true, outcomes: true, status: true },
          },
        },
      }),
      prisma.position.count({ where }),
    ]);

    return {
      bets: positions.map((p) => ({
        id: p.id,
        marketType: p.market.marketType,
        outcomeIndex: p.outcomeIndex,
        amount: Number(p.amount),
        leverage: p.leverage,
        oddsAtEntry: Number(p.oddsAtEntry),
        potentialPayout: Number(p.potentialPayout),
        status: p.status,
        payoutAmount: Number(p.payoutAmount),
        pnl: p.status === "WON"
          ? Number(p.payoutAmount) - Number(p.amount)
          : p.status === "LOST" || p.status === "LIQUIDATED"
            ? -Number(p.amount)
            : 0,
        createdAt: p.createdAt.toISOString(),
        settledAt: p.settledAt?.toISOString() || null,
      })),
      total,
      page,
    };
  }

  /**
   * Get user stats.
   */
  async getStats(walletAddress: string) {
    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) return null;

    const positions = await prisma.position.findMany({
      where: { walletAddress, status: { in: ["WON", "LOST", "LIQUIDATED"] } },
    });

    const wins = positions.filter((p) => p.status === "WON");
    const losses = positions.filter((p) => p.status === "LOST" || p.status === "LIQUIDATED");

    const totalPnl = wins.reduce((sum, p) => sum + Number(p.payoutAmount) - Number(p.amount), 0)
      - losses.reduce((sum, p) => sum + Number(p.amount), 0);

    const totalVolume = Number(user.totalVolume);
    const winRate = positions.length > 0
      ? Math.round((wins.length / positions.length) * 100)
      : 0;

    return {
      totalBets: positions.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      totalVolume,
      totalPnl,
      roi: totalVolume > 0
        ? Math.round((totalPnl / totalVolume) * 100)
        : 0,
      streakBest: user.streakBest,
      streakCurrent: user.streakCurrent,
    };
  }

  /**
   * Get P&L time series for chart.
   */
  async getPnlTimeSeries(walletAddress: string, period: "7d" | "30d" | "all" = "7d") {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 365;
    const since = new Date(Date.now() - days * 86_400_000);

    const positions = await prisma.position.findMany({
      where: {
        walletAddress,
        settledAt: { gte: since },
        status: { in: ["WON", "LOST", "LIQUIDATED"] },
      },
      orderBy: { settledAt: "asc" },
    });

    const dailyPnl: Record<string, number> = {};
    let cumulative = 0;

    for (const pos of positions) {
      if (!pos.settledAt) continue;
      const day = pos.settledAt.toISOString().split("T")[0];
      const pnl = pos.status === "WON"
        ? Number(pos.payoutAmount) - Number(pos.amount)
        : -Number(pos.amount);
      cumulative += pnl;
      dailyPnl[day] = cumulative;
    }

    return Object.entries(dailyPnl).map(([date, pnl]) => ({ date, pnl }));
  }

  /**
   * Update user after settlement.
   */
  async afterSettlement(positionId: string) {
    const position = await prisma.position.findUnique({
      where: { id: positionId },
    });

    if (!position || !position.settledAt) return;

    const pnl = position.status === "WON"
      ? Number(position.payoutAmount) - Number(position.amount)
      : -Number(position.amount);

    await prisma.user.update({
      where: { walletAddress: position.walletAddress },
      data: {
        totalPnl: { increment: pnl },
        totalWins: position.status === "WON" ? { increment: 1 } : undefined,
      },
    });

    // Invalidate caches
    await cacheService.invalidate(`user:${position.walletAddress}:*`);
    logger.info({ positionId, pnl }, "User stats updated after settlement");
  }
}

export const userService = new UserService();
