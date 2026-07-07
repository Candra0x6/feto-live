import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../utils/logger.js";

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  logger.error({ err: error, url: _request.url }, "Request error");

  // Zod validation errors
  if (error.validation) {
    return reply.status(400).send({
      error: "Validation Error",
      message: "Invalid request parameters",
      details: error.validation,
    });
  }

  // Rate limit
  if (error.statusCode === 429) {
    return reply.status(429).send({
      error: "Rate Limit Exceeded",
      message: "Too many requests, please try again later",
    });
  }

  // Known HTTP errors
  const statusCode = error.statusCode || 500;
  return reply.status(statusCode).send({
    error: error.name || "Internal Server Error",
    message: statusCode === 500 ? "An unexpected error occurred" : error.message,
  });
}
