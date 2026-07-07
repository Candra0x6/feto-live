#!/bin/bash
set -e

echo "=== Deploy Frontend to Vercel ==="
echo ""

# Check if logged in to Vercel
if ! npx vercel whoami 2>/dev/null; then
  echo "🔑 Not logged in to Vercel. Please login first:"
  echo "   npx vercel login"
  exit 1
fi

cd frontend

# Build and deploy
echo "➡️  Deploying frontend to Vercel..."
npx vercel deploy \
  --prod \
  --build-env NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com \
  --build-env NEXT_PUBLIC_FACTORY_PROGRAM_ID=8FRnebXM2T3xcvuPpirKRuPZVGPzXpyx1kEVGrkTg2D4 \
  --build-env NEXT_PUBLIC_ESCROW_PROGRAM_ID=ey3nM2h4qjMvs33F3nn5WfrEr8f8PAgbkkqyPtwgEGz \
  --build-env NEXT_PUBLIC_SETTLE_PROGRAM_ID=DmRQTT8rJSSxNNjDiXwSMjzotP2xwdfngBnqtggRsPGz \
  --build-env NEXT_PUBLIC_API_URL=https://api.dev.feto.live \
  --build-env NEXT_PUBLIC_WS_URL=wss://api.dev.feto.live/ws

echo ""
echo "✅ Frontend deployed!"
echo "   URL: https://dev.feto.live"
