#!/bin/bash
set -e

echo "=== Deploy Backend to Railway ==="
echo ""
echo "Prerequisites:"
echo "  1. Create a Railway account at https://railway.app"
echo "  2. Install Railway CLI: npm install -g @railway/cli"
echo "  3. Login: railway login"
echo ""

# This script uses Railway CLI
if ! command -v railway &> /dev/null; then
  echo "❌ Railway CLI not found. Install with: npm install -g @railway/cli"
  exit 1
fi

echo "➡️  Linking to Railway project..."
railway link

echo "➡️  Setting environment variables..."
railway env set NODE_ENV=production
railway env set PORT=3001
railway env set DATABASE_URL="$DATABASE_URL"
railway env set DIRECT_URL="$DIRECT_URL"
railway env set SOLANA_RPC_URL=https://api.devnet.solana.com
railway env set PROGRAM_FACTORY_ID=8FRnebXM2T3xcvuPpirKRuPZVGPzXpyx1kEVGrkTg2D4
railway env set PROGRAM_ESCROW_ID=ey3nM2h4qjMvs33F3nn5WfrEr8f8PAgbkkqyPtwgEGz
railway env set PROGRAM_SETTLE_ID=DmRQTT8rJSSxNNjDiXwSMjzotP2xwdfngBnqtggRsPGz
railway env set KEEPER_DEMO_MODE=true

echo "➡️  Deploying..."
railway up --detach

echo ""
echo "✅ Backend deployed to Railway!"
echo "   URL: https://api.dev.feto.live (configure custom domain in Railway dashboard)"
