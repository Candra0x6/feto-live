import { FastifyInstance } from "fastify";
import { bettingService } from "../services/betting.service.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { requireWallet } from "../middleware/auth.js";
import { RATE_LIMITS } from "../utils/constants.js";

interface BuildBetBody {
  marketId: string;
  outcomeIndex: number;
  amount: number;
  leverage?: number;
  maxSlippageBps?: number;
}

interface BetParams {
  id: string;
}

interface ClaimBody {
  marketId: string;
}

interface RecordPositionBody {
  chainPositionId: number;
  marketId: string;
  walletAddress: string;
  outcomeIndex: number;
  amount: number;
  leverage?: number;
  oddsAtEntry: number;
  chainPositionPda: string;
}

export async function betRoutes(app: FastifyInstance) {
  const betRateLimit = createRateLimiter(RATE_LIMITS.bet);
  const apiRateLimit = createRateLimiter(RATE_LIMITS.api);
  const claimRateLimit = createRateLimiter(RATE_LIMITS.claim);

  /**
   * POST /api/bets
   * Build and simulate a bet transaction.
   */
  app.post<{ Body: BuildBetBody }>(
    "/api/bets",
    { preHandler: [requireWallet, betRateLimit] },
    async (request, reply) => {
      const wallet = (request as any).wallet;
      const { marketId, outcomeIndex, amount, leverage = 1, maxSlippageBps = 100 } = request.body;

      try {
        const result = await bettingService.buildPlaceBetTx({
          marketId,
          outcomeIndex,
          amount,
          leverage,
          maxSlippageBps,
          userPubkey: wallet,
        });

        return reply.send(result);
      } catch (err: any) {
        return reply.status(400).send({
          error: "Bet Build Failed",
          message: err.message,
        });
      }
    },
  );

  /**
   * GET /api/bets/:id
   * Get bet status.
   */
  app.get<{ Params: BetParams }>(
    "/api/bets/:id",
    { preHandler: [requireWallet, apiRateLimit] },
    async (request, reply) => {
      const { id } = request.params;

      const bet = await bettingService.getBet(id);
      if (!bet) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Bet ${id} not found`,
        });
      }

      return reply.send({ bet });
    },
  );

  /**
   * POST /api/bets/claim
   * Build a claim payout transaction.
   */
  app.post<{ Body: ClaimBody }>(
    "/api/bets/claim",
    { preHandler: [requireWallet, claimRateLimit] },
    async (request, reply) => {
      const wallet = (request as any).wallet;
      const { marketId } = request.body;

      try {
        const result = await bettingService.buildClaimTx(marketId, wallet);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(400).send({
          error: "Claim Build Failed",
          message: err.message,
        });
      }
    },
  );

  /**
   * POST /api/bets/record
   * Record a position after successful on-chain tx (called by keeper or webhook).
   */
  app.post<{ Body: RecordPositionBody }>(
    "/api/bets/record",
    { preHandler: [apiRateLimit] },
    async (request, reply) => {
      const {
        chainPositionId,
        marketId,
        walletAddress,
        outcomeIndex,
        amount,
        leverage = 1,
        oddsAtEntry,
        chainPositionPda,
      } = request.body;

      try {
        const position = await bettingService.recordPosition({
          chainPositionId,
          marketId,
          walletAddress,
          outcomeIndex,
          amount,
          leverage: leverage || 1,
          oddsAtEntry,
          chainPositionPda,
        });

        return reply.status(201).send({ position });
      } catch (err: any) {
        return reply.status(400).send({
          error: "Record Failed",
          message: err.message,
        });
      }
    },
  );
}
