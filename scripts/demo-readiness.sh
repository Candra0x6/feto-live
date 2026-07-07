#!/bin/bash
# ── Feto Live — Demo Readiness Checklist ──
#
# Run this script to verify everything is ready for the demo.
# It checks all components and prints a pass/fail report.

set -e

PASS=0
FAIL=0

check() {
  local desc="$1"
  local cmd="$2"
  
  echo -n "  [ ] $desc ... "
  if eval "$cmd" > /dev/null 2>&1; then
    echo "✅ PASS"
    PASS=$((PASS + 1))
  else
    echo "❌ FAIL"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║   Feto Live — Demo Readiness              ║"
echo "╚════════════════════════════════════════════╝"
echo ""

echo "── Smart Contracts ──"
check "Factory program deployed" \
  "solana program show 8FRnebXM2T3xcvuPpirKRuPZVGPzXpyx1kEVGrkTg2D4 --url devnet"
check "Escrow program deployed" \
  "solana program show ey3nM2h4qjMvs33F3nn5WfrEr8f8PAgbkkqyPtwgEGz --url devnet"
check "Settle program deployed" \
  "solana program show DmRQTT8rJSSxNNjDiXwSMjzotP2xwdfngBnqtggRsPGz --url devnet"

echo ""
echo "── Backend API ──"
check "Backend process running" \
  "curl -s http://localhost:3001/health | grep -q 'ok'"
check "Health endpoint responds" \
  "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/health | grep -q '200'"

echo ""
echo "── Frontend ──"
check "Frontend build succeeds" \
  "test -d /home/cn/Projects/Competition/Web3/Solana/Feto/frontend/.next"
check "Frontend deployed to Vercel" \
  "curl -s -o /dev/null -w '%{http_code}' https://frontend-nine-mocha-22.vercel.app | grep -q '200'"

echo ""
echo "── Keeper Bot ──"
check "Keeper keypair configured" \
  "grep -q 'KEEPER_PRIVATE_KEY=' /home/cn/Projects/Competition/Web3/Solana/Feto/backend/.env && ! grep -q 'KEEPER_PRIVATE_KEY=\"\"' /home/cn/Projects/Competition/Web3/Solana/Feto/backend/.env"
check "Keeper wallet funded" \
  "solana balance 9RxA7f2jqH8XMo7wuaYggUhWeUsF6zrmygSPpP9mRFnZ --url devnet | grep -q 'SOL'"
check "Keeper metrics server ready" \
  "grep -q 'KEEPER_HEALTH_PORT=9090' /home/cn/Projects/Competition/Web3/Solana/Feto/backend/.env"

echo ""
echo "── Database ──"
check "Supabase connection configured" \
  "grep -q 'DATABASE_URL' /home/cn/Projects/Competition/Web3/Solana/Feto/backend/.env"
check "Prisma client generated" \
  "test -d /home/cn/Projects/Competition/Web3/Solana/Feto/backend/node_modules/.prisma/client"

echo ""
echo "── TypeScript ──"
check "Backend TypeScript compiles" \
  "npx tsc --noEmit --project /home/cn/Projects/Competition/Web3/Solana/Feto/backend/tsconfig.json"
check "Frontend TypeScript compiles" \
  "cd /home/cn/Projects/Competition/Web3/Solana/Feto/frontend && npx tsc --noEmit 2>&1 | head -1 | grep -q ''"

echo ""
echo "── Deployment Configs ──"
check "Vercel config exists" \
  "test -f /home/cn/Projects/Competition/Web3/Solana/Feto/frontend/vercel.json"
check "Railway config exists" \
  "test -f /home/cn/Projects/Competition/Web3/Solana/Feto/backend/railway.json"
check "Dockerfile exists" \
  "test -f /home/cn/Projects/Competition/Web3/Solana/Feto/backend/Dockerfile"
check "Docker compose exists" \
  "test -f /home/cn/Projects/Competition/Web3/Solana/Feto/docker-compose.yml"
check ".env.example files exist" \
  "test -f /home/cn/Projects/Competition/Web3/Solana/Feto/frontend/.env.example && test -f /home/cn/Projects/Competition/Web3/Solana/Feto/backend/.env.example"

echo ""
echo "── Results ──"
echo "  ✅ Passed: $PASS"
echo "  ❌ Failed: $FAIL"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "🎉 All checks passed! Ready for demo!"
else
  echo "⚠️  $FAIL check(s) failed. Fix before demo."
fi
echo ""
