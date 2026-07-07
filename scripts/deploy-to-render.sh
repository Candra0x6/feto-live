#!/bin/bash
# ── Feto Live — Deploy Backend to Render (via Blueprint) ──
#
# Render Blueprint = one-click deploy from render.yaml
# No CLI needed — just click the link.
#
# ── PREREQUISITES ──
# 1. GitHub repo: https://github.com/Candra0x6/feto-live
# 2. Render account: https://dashboard.render.com (free tier)
#
# ── STEPS ──

echo "=== Deploy Backend to Render ==="
echo ""
echo "STEP 1: Open Render Dashboard"
echo "  → https://dashboard.render.com/"
echo ""
echo "STEP 2: Click 'New Web Service'"
echo "  → Connect GitHub repo: Candra0x6/feto-live"
echo "  → Render automatically detects render.yaml"
echo "  → Select the 'feto-backend' service"
echo ""
echo "STEP 3: Set Environment Variables (in Render dashboard)"
echo "  These are marked 'sync: false' in render.yaml — you MUST set them:"
echo ""
echo "  DATABASE_URL:"
echo "    postgresql://postgres.cyxxddogknobbhdyeucl:<PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
echo ""
echo "  DIRECT_URL:"
echo "    postgresql://postgres.cyxxddogknobbhdyeucl:<PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
echo ""
echo "  (Replace <PASSWORD> with your Supabase password from backend/.env)"
echo ""
echo "STEP 4: Click 'Create Web Service'"
echo "  → Render builds the Docker image and deploys"
echo "  → First deploy takes ~3-5 minutes"
echo ""
echo "STEP 5: Verify"
echo "  → curl https://<your-app>.onrender.com/health"
echo "  → Expected: {\"status\":\"ok\",\"checks\":{\"database\":\"healthy\",...}}"
echo ""
echo "STEP 6: Update Frontend"
echo "  In Vercel dashboard, update these env vars:"
echo "  NEXT_PUBLIC_API_URL=https://<your-app>.onrender.com"
echo "  NEXT_PUBLIC_WS_URL=wss://<your-app>.onrender.com"
echo ""
echo "  Then redeploy frontend: npx vercel deploy --prod"
echo ""
echo "────────────────────────────────────"
echo "YOUR RENDER APP URL WILL BE:"
echo "  https://feto-backend.onrender.com"
echo "────────────────────────────────────"
