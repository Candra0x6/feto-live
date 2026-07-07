import { FastifyInstance } from "fastify";
import { userService } from "../services/user.service.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { requireWallet } from "../middleware/auth.js";
import { RATE_LIMITS } from "../utils/constants.js";

interface WalletParams {
  wallet: string;
}

interface HistoryQuery {
  status?: string;
  page?: string;
  limit?: string;
}

interface PnlQuery {
  period?: "7d" | "30d" | "all";
}

export async function userRoutes(app: FastifyInstance) {
  const rateLimit = createRateLimiter(RATE_LIMITS.api);

  /**
   * GET /api/users/:wallet
   * User profile.
   */
  app.get<{ Params: WalletParams }>(
    "/api/users/:wallet",
    { preHandler: [rateLimit] },
    async (request, reply) => {
      const { wallet } = request.params;

      const profile = await userService.getProfile(wallet);
      if (!profile) {
        return reply.status(404).send({
          error: "Not Found",
          message: "User not found",
        });
      }

      return reply.send({ user: profile });
    },
  );

  /**
   * GET /api/users/:wallet/positions
   * Active positions.
   */
  app.get<{ Params: WalletParams; Querystring: { status?: string } }>(
    "/api/users/:wallet/positions",
    { preHandler: [requireWallet, rateLimit] },
    async (request, reply) => {
      const { wallet } = request.params;
      const { status } = request.query;

      const positions = await userService.getPositions(wallet, status);
      return reply.send({ positions });
    },
  );

  /**
   * GET /api/users/:wallet/history
   * Bet history with pagination.
   */
  app.get<{ Params: WalletParams; Querystring: HistoryQuery }>(
    "/api/users/:wallet/history",
    { preHandler: [rateLimit] },
    async (request, reply) => {
      const { wallet } = request.params;
      const { status, page, limit } = request.query;

      const result = await userService.getHistory(wallet, {
        status,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

      return reply.send(result);
    },
  );

  /**
   * GET /api/users/:wallet/stats
   * Aggregated stats.
   */
  app.get<{ Params: WalletParams }>(
    "/api/users/:wallet/stats",
    { preHandler: [rateLimit] },
    async (request, reply) => {
      const { wallet } = request.params;

      const stats = await userService.getStats(wallet);
      if (!stats) {
        return reply.status(404).send({
          error: "Not Found",
          message: "User not found",
        });
      }

      return reply.send(stats);
    },
  );

  /**
   * GET /api/users/:wallet/pnl
   * P&L time series.
   */
  app.get<{ Params: WalletParams; Querystring: PnlQuery }>(
    "/api/users/:wallet/pnl",
    { preHandler: [rateLimit] },
    async (request, reply) => {
      const { wallet } = request.params;
      const { period } = request.query;

      const pnl = await userService.getPnlTimeSeries(wallet, period || "7d");
      return reply.send({ pnl });
    },
  );
}
