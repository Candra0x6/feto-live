import { logger } from "../utils/logger.js";
import { config } from "../config.js";

/**
 * Initialize Sentry for the backend API.
 *
 * Sentry DSN should be set in SENTRY_DSN env var.
 * If not configured, Sentry is disabled.
 */
export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.info("Sentry not configured — skipping (set SENTRY_DSN to enable)");
    return;
  }

  try {
    const Sentry = await import("@sentry/node");

    Sentry.init({
      dsn,
      environment: config.NODE_ENV,
      tracesSampleRate: config.NODE_ENV === "production" ? 0.1 : 1.0,
      profilesSampleRate: config.NODE_ENV === "production" ? 0.1 : 1.0,
      integrations: [],
      beforeSend(event) {
        // Don't send 4xx errors to Sentry (too noisy)
        if (event.exception?.values?.[0]?.type === "HttpError") {
          return null;
        }
        return event;
      },
    });

    logger.info("Sentry initialized for backend");
  } catch (err) {
    logger.warn({ err }, "Failed to initialize Sentry");
  }
}
