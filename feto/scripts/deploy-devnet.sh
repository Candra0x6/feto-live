#!/bin/bash
set -e

echo "=== Deploy to Devnet ==="
echo "Deployer: $(solana address)"
echo "Balance : $(solana balance)"

# Check balance
BALANCE=$(solana balance | cut -d' ' -f1)
if (( $(echo "$BALANCE < 3" | bc -l) )); then
  echo "⚠️  Low balance ($BALANCE SOL). Airdropping..."
  solana airdrop 5 || echo "Faucet dry — visit https://faucet.solana.com"
fi

# Deploy in order: factory → escrow → settle
echo "➡️  Deploying feto_factory..."
solana program deploy \
  target/deploy/feto_factory.so \
  --program-id target/deploy/feto_factory-keypair.json \
  --url devnet

echo "➡️  Deploying feto_escrow..."
solana program deploy \
  target/deploy/feto_escrow.so \
  --program-id target/deploy/feto_escrow-keypair.json \
  --url devnet

echo "➡️  Deploying feto_settle..."
solana program deploy \
  target/deploy/feto_settle.so \
  --program-id target/deploy/feto_settle-keypair.json \
  --url devnet

echo "✅ All programs deployed!"
echo "Factory  : 8FRnebXM2T3xcvuPpirKRuPZVGPzXpyx1kEVGrkTg2D4"
echo "Escrow   : ey3nM2h4qjMvs33F3nn5WfrEr8f8PAgbkkqyPtwgEGz"
echo "Settle   : DmRQTT8rJSSxNNjDiXwSMjzotP2xwdfngBnqtggRsPGz"
