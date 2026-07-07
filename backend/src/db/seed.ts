import "dotenv/config";
import { prisma } from "./client.js";
import { logger } from "../utils/logger.js";

/**
 * Seed script for local development.
 * Creates mock matches, markets, and a test user.
 *
 * Usage: npm run db:seed
 */
async function main() {
  logger.info("🌱 Seeding database...");

  // ── Create test user ──
  const user = await prisma.user.upsert({
    where: { walletAddress: "FetoTestWallet1111111111111111111111111111111" },
    update: {},
    create: {
      walletAddress: "FetoTestWallet1111111111111111111111111111111",
      username: "test_bettor",
      totalBets: 0,
      totalWins: 0,
    },
  });
  logger.info({ userId: user.id }, "Created test user");

  // ── Create mock match ──
  const match = await prisma.match.create({
    data: {
      txlineMatchId: BigInt(1001),
      homeTeam: "Brazil",
      awayTeam: "Argentina",
      competition: "World Cup 2026",
      venue: "Estádio do Maracanã",
      startTime: new Date("2026-07-10T20:00:00Z"),
      status: "LIVE",
      homeScore: 0,
      awayScore: 0,
      currentMinute: 15,
    },
  });
  logger.info({ matchId: match.id }, "Created mock match");

  // ── Create mock markets ──
  const markets = [
    {
      chainMarketId: BigInt(1),
      marketType: "NEXT_CORNER" as const,
      outcomes: JSON.stringify([
        { label: "Brazil", oddsDecimal: 2.10, oddsAmerican: "+110", impliedProbability: 47.6 },
        { label: "Argentina", oddsDecimal: 1.80, oddsAmerican: "-125", impliedProbability: 55.6 },
        { label: "No Corner (5 min)", oddsDecimal: 15.00, oddsAmerican: "+1400", impliedProbability: 6.7 },
      ]),
      lockTime: new Date(Date.now() + 120_000), // 2 min from now
      leverageEnabled: true,
      maxLeverage: 5,
    },
    {
      chainMarketId: BigInt(2),
      marketType: "GOAL_IN_5_MIN" as const,
      outcomes: JSON.stringify([
        { label: "Yes", oddsDecimal: 3.50, oddsAmerican: "+250", impliedProbability: 28.6 },
        { label: "No", oddsDecimal: 1.29, oddsAmerican: "-345", impliedProbability: 77.5 },
      ]),
      lockTime: new Date(Date.now() + 300_000), // 5 min from now
      leverageEnabled: false,
      maxLeverage: 1,
    },
    {
      chainMarketId: BigInt(3),
      marketType: "NEXT_CARD" as const,
      outcomes: JSON.stringify([
        { label: "Brazil", oddsDecimal: 2.50, oddsAmerican: "+150", impliedProbability: 40.0 },
        { label: "Argentina", oddsDecimal: 1.67, oddsAmerican: "-149", impliedProbability: 60.0 },
        { label: "No Card (5 min)", oddsDecimal: 10.00, oddsAmerican: "+900", impliedProbability: 10.0 },
      ]),
      lockTime: new Date(Date.now() + 300_000),
      leverageEnabled: true,
      maxLeverage: 3,
    },
  ];

  for (const market of markets) {
    await prisma.market.create({
      data: {
        chainMarketId: market.chainMarketId,
        matchId: match.id,
        marketType: market.marketType,
        outcomes: market.outcomes,
        lockTime: market.lockTime,
        leverageEnabled: market.leverageEnabled,
        maxLeverage: market.maxLeverage,
      },
    });
  }
  logger.info({ count: markets.length }, "Created mock markets");

  logger.info("✅ Seed complete");
}

main()
  .catch((e) => {
    logger.error({ err: e }, "Seed failed");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
