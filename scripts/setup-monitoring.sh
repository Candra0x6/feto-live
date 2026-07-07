#!/bin/bash
# ── Setup Monitoring for Feto Live ──
#
# This script configures the monitoring infrastructure.
# Run AFTER frontend and backend are deployed.
#
# Uptime monitoring is configured through UptimeRobot's web dashboard.
# Error tracking is done via Sentry.
#
# Prerequisites:
#   - Sentry account: https://sentry.io
#   - UptimeRobot account: https://uptimerobot.com (free tier: 50 monitors)

echo "=== Feto Live — Monitoring Setup ==="
echo ""

# ── Sentry ────────────────────────────────────────────────────────
echo "1️⃣  SENTRY SETUP"
echo ""
echo "To enable error tracking, follow these steps:"
echo ""
echo "  a. Create a Sentry account at https://sentry.io"
echo "  b. Create a new project for Next.js"
echo "  c. Copy your DSN (https://<key>@<org>.ingest.sentry.io/<project>)"
echo ""
echo "  d. Frontend: Set env var in Vercel dashboard:"
echo "     NEXT_PUBLIC_SENTRY_DSN=<your-dsn>"
echo ""
echo "  e. Backend: Add to .env:"
echo "     SENTRY_DSN=<your-dsn>"
echo ""

# ── UptimeRobot ───────────────────────────────────────────────────
echo "2️⃣  UPTIMEROBOT SETUP"
echo ""
echo "UptimeRobot monitors the health endpoints every 5 minutes:"
echo ""
echo "  Monitor 1: Frontend"
echo "    URL:   https://frontend-nine-mocha-22.vercel.app"
echo "    Type:  HTTP(s)"
echo "    Interval: 5 min"
echo ""
echo "  Monitor 2: Backend API"
echo "    URL:   https://<your-railway-url>/api/health"
echo "    Type:  HTTP(s)"
echo "    Interval: 5 min"
echo ""
echo "  Monitor 3: Keeper Bot"
echo "    URL:   http://<your-vps-ip>:9090/health"
echo "    Type:  HTTP(s)"
echo "    Interval: 5 min"
echo ""

# ── Alert Channels ────────────────────────────────────────────────
echo "3️⃣  ALERT CHANNELS"
echo ""
echo "Configure alert notifications in UptimeRobot:"
echo "  - Discord Webhook (recommended)"
echo "  - Email"
echo ""
echo "Alert thresholds:"
echo "  - API error rate > 1% in 5 min"
echo "  - Keeper bot down > 2 min"
echo "  - Settlement latency > 60s"
echo ""

# ── Verification ──────────────────────────────────────────────────
echo "4️⃣  VERIFICATION"
echo ""
echo "Run these checks after setup:"
echo ""
echo "  # Check frontend is live"
echo "  curl -s https://frontend-nine-mocha-22.vercel.app | head -5"
echo ""
echo "  # Check backend health"
echo "  curl -s <your-railway-url>/api/health"
echo ""
echo "  # Check keeper metrics"  
echo "  curl -s http://localhost:9090/health"
echo "  curl -s http://localhost:9090/metrics"
echo ""

echo "✅ Monitoring setup complete!"
