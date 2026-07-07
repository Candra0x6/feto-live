import { FastifyRequest, FastifyReply } from "fastify";

/**
 * Wallet-based authentication middleware.
 * Extracts the wallet address from the `x-wallet` header.
 * In production, this should verify a signed message.
 */
export async function requireWallet(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const wallet = request.headers["x-wallet"] as string | undefined;

  if (!wallet) {
    return reply.status(401).send({
      error: "Unauthorized",
      message: "x-wallet header is required",
    });
  }

  // Basic format validation
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    return reply.status(400).send({
      error: "Invalid Wallet",
      message: "Invalid Solana wallet address format",
    });
  }

  // Attach wallet to request for downstream handlers
  (request as any).wallet = wallet;
}
