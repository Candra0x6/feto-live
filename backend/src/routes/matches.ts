import { FastifyInstance } from "fastify";
import { matchService } from "../services/match.service.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { RATE_LIMITS } from "../utils/constants.js";

interface ListMatchesQuery {
  status?: string;
  search?: string;
  page?: string;
  limit?: string;
}

interface MatchParams {
  id: string;
}

export async function matchRoutes(app: FastifyInstance) {
  const rateLimit = createRateLimiter(RATE_LIMITS.api);

  /**
   * GET /api/matches
   * List all matches with optional filters.
   */
  app.get<{ Querystring: ListMatchesQuery }>(
    "/api/matches",
    { preHandler: [rateLimit] },
    async (request, reply) => {
      const { status, search, page, limit } = request.query;

      const result = await matchService.listMatches({
        status,
        search,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

      return reply.send(result);
    },
  );

  /**
   * GET /api/matches/:id
   * Match detail with active markets.
   */
  app.get<{ Params: MatchParams }>(
    "/api/matches/:id",
    { preHandler: [rateLimit] },
    async (request, reply) => {
      const { id } = request.params;

      const match = await matchService.getMatch(id);

      if (!match) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Match ${id} not found`,
        });
      }

      return reply.send({ match });
    },
  );

  /**
   * POST /api/matches/sync
   * Admin endpoint: force sync fixtures from TxLINE.
   */
  app.post(
    "/api/matches/sync",
    { preHandler: [rateLimit] },
    async (_request, reply) => {
      const count = await matchService.syncFromTxline();
      return reply.send({ synced: count });
    },
  );
}
