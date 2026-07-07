/**
 * Sentry server-side configuration.
 *
 * Initialize Sentry on the Next.js server. Only active when SENTRY_DSN
 * environment variable is set.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });
}
