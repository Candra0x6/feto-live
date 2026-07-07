import { FastifyInstance } from "fastify";
import { marketService } from "../services/market.service.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { RATE_LIMITS } from "../utils/constants.js";

interface MatchMarketsQuery {
  type?: string;
  status?: string;
}

interface MarketParams {
  id: string;
}

export async function marketRoutes(app: FastifyInstance) {
  const rateLimit = createRateLimiter(RATE_LIMITS.api);

  /**
   * GET /api/matches/:matchId/markets
   * All active markets for a match.
   */
  app.get<{ Params: { matchId: string }; Querystring: MatchMarketsQuery }>(
    "/api/matches/:matchId/markets",
    { preHandler: [rateLimit] },
    async (request, reply) => {
      const { matchId } = request.params;
      const { type, status } = request.query;

      const markets = await marketService.getMatchMarkets(matchId, { type, status });
      return reply.send({ markets });
    },
  );

  /**
   * GET /api/markets/:id
   * Single market detail.
   */
  app.get<{ Params: MarketParams }>(
    "/api/markets/:id",
    { preHandler: [rateLimit] },
    async (request, reply) => {
      const { id } = request.params;

      const market = await marketService.getMarket(id);

      if (!market) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Market ${id} not found`,
        });
      }

      return reply.send({ market });
    },
  );

  /**
   * POST /api/matches/:matchId/markets/auto-generate
   * Admin: trigger auto-generation of markets for a match.
   */
  app.post<{ Params: { matchId: string } }>(
    "/api/matches/:matchId/markets/auto-generate",
    { preHandler: [rateLimit] },
    async (request, reply) => {
      const { matchId } = request.params;
      const count = await marketService.autoGenerateMarkets(matchId);
      return reply.send({ generated: count });
    },
  );

  /**
   * PATCH /api/markets/:id/status
   * Admin: update market status (lock, settle, cancel).
   */
  app.patch<{ Params: MarketParams; Body: { status: string; winningOutcome?: number } }>(
    "/api/markets/:id/status",
    { preHandler: [rateLimit] },
    async (request, reply) => {
      const { id } = request.params;
      const { status, winningOutcome } = request.body;

      const validStatuses = ["LOCKED", "SETTLED", "CANCELLED"];
      if (!validStatuses.includes(status.toUpperCase())) {
        return reply.status(400).send({
          error: "Invalid Status",
          message: `Status must be one of: ${validStatuses.join(", ")}`,
        });
      }

      const market = await marketService.updateMarketStatus(
        id,
        status.toUpperCase() as any,
        winningOutcome,
      );

      return reply.send({ market });
    },
  );
}
