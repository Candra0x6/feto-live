-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'PAUSED', 'FINISHED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "MarketType" AS ENUM ('NEXT_CORNER', 'NEXT_CARD', 'NEXT_SUBSTITUTION', 'NEXT_GOAL_SCORER', 'GOAL_IN_5_MIN', 'ANY_GOAL');

-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('OPEN', 'LOCKED', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('ACTIVE', 'LOCKED', 'WON', 'LOST', 'LIQUIDATED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "username" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActive" TIMESTAMP(3) NOT NULL,
    "totalBets" INTEGER NOT NULL DEFAULT 0,
    "totalWins" INTEGER NOT NULL DEFAULT 0,
    "totalVolume" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "totalPnl" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "streakBest" INTEGER NOT NULL DEFAULT 0,
    "streakCurrent" INTEGER NOT NULL DEFAULT 0,
    "badges" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "txlineMatchId" BIGINT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "competition" TEXT,
    "venue" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "currentMinute" INTEGER,
    "txlineFixtureHash" TEXT,
    "chainMatchPda" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "chainMarketId" BIGINT NOT NULL,
    "matchId" TEXT NOT NULL,
    "marketType" "MarketType" NOT NULL,
    "status" "MarketStatus" NOT NULL DEFAULT 'OPEN',
    "outcomes" JSONB NOT NULL DEFAULT '[]',
    "totalPool" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "winningOutcome" INTEGER,
    "lockTime" TIMESTAMP(3),
    "settlementTime" TIMESTAMP(3),
    "protocolFeeBps" INTEGER,
    "leverageEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxLeverage" INTEGER NOT NULL DEFAULT 1,
    "chainMarketPda" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "chainPositionId" BIGINT NOT NULL,
    "marketId" TEXT NOT NULL,
    "userId" TEXT,
    "walletAddress" TEXT NOT NULL,
    "outcomeIndex" INTEGER NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "collateral" DECIMAL(20,6) NOT NULL,
    "potentialPayout" DECIMAL(20,6),
    "oddsAtEntry" DECIMAL(10,4),
    "status" "PositionStatus" NOT NULL DEFAULT 'ACTIVE',
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "payoutAmount" DECIMAL(20,6),
    "chainPositionPda" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "txlineEventId" TEXT,
    "eventType" TEXT NOT NULL,
    "team" TEXT,
    "player" TEXT,
    "minute" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "merkleProof" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Match_txlineMatchId_key" ON "Match"("txlineMatchId");

-- CreateIndex
CREATE INDEX "Market_matchId_idx" ON "Market"("matchId");

-- CreateIndex
CREATE INDEX "Market_chainMarketId_idx" ON "Market"("chainMarketId");

-- CreateIndex
CREATE INDEX "Market_status_idx" ON "Market"("status");

-- CreateIndex
CREATE INDEX "Position_walletAddress_idx" ON "Position"("walletAddress");

-- CreateIndex
CREATE INDEX "Position_marketId_idx" ON "Position"("marketId");

-- CreateIndex
CREATE INDEX "Position_status_idx" ON "Position"("status");

-- CreateIndex
CREATE INDEX "Event_matchId_idx" ON "Event"("matchId");

-- CreateIndex
CREATE INDEX "Event_eventType_idx" ON "Event"("eventType");

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

