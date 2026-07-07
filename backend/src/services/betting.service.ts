import { PublicKey, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import { prisma } from "../db/client.js";
import { logger } from "../utils/logger.js";
import { cacheService } from "../cache/cache-service.js";
import { solanaService } from "./solana.service.js";
import { MIN_BET_AMOUNT, MAX_BET_AMOUNT, MAX_LEVERAGE, MAX_SLIPPAGE_BPS } from "../utils/constants.js";

interface BuildPlaceBetTxInput {
  marketId: string;
  outcomeIndex: number;
  amount: number; // In USDC (human readable, e.g., 10.00)
  leverage: number;
  maxSlippageBps: number;
  userPubkey: string;
}

interface TransactionResult {
  tx: string; // Serialized base64 transaction
  marketId: number;
  positionPda: string;
  estimatedGas: number;
}

export class BettingService {
  /**
   * Build and simulate a place_bet transaction.
   * Returns a serialized transaction for the user to sign client-side.
   */
  async buildPlaceBetTx(input: BuildPlaceBetTxInput): Promise<TransactionResult> {
    // 1. Validate market exists and is open
    const market = await prisma.market.findUnique({ where: { id: input.marketId } });
    if (!market) {
      throw new Error("Market not found");
    }
    if (market.status !== "OPEN") {
      throw new Error("Market is not open for betting");
    }

    // 2. Validate amount
    if (input.amount < MIN_BET_AMOUNT) {
      throw new Error(`Minimum bet amount is ${MIN_BET_AMOUNT} USDC`);
    }
    if (input.amount > MAX_BET_AMOUNT) {
      throw new Error(`Maximum bet amount is ${MAX_BET_AMOUNT} USDC`);
    }

    // 3. Validate leverage
    if (input.leverage < 1) {
      throw new Error("Leverage must be at least 1x");
    }
    if (input.leverage > MAX_LEVERAGE) {
      throw new Error(`Maximum leverage is ${MAX_LEVERAGE}x`);
    }
    if (input.leverage > 1 && !market.leverageEnabled) {
      throw new Error("Leverage is not enabled for this market");
    }
    if (input.leverage > (market.maxLeverage || 1)) {
      throw new Error(`Maximum leverage for this market is ${market.maxLeverage}x`);
    }

    // 4. Validate outcome index
    const outcomes = market.outcomes as unknown as Array<{ label: string; oddsDecimal: number }>;
    if (input.outcomeIndex < 0 || input.outcomeIndex >= outcomes.length) {
      throw new Error(`Invalid outcome index. Must be 0-${outcomes.length - 1}`);
    }

    // 5. Slippage check (compare DB odds vs on-chain odds)
    if (solanaService.isConfigured) {
      const onChainOdds = await solanaService.getMarketOdds(Number(market.chainMarketId));
      if (onChainOdds && onChainOdds.outcomes[input.outcomeIndex]) {
        const currentOdds = onChainOdds.outcomes[input.outcomeIndex].oddsDecimal;
        const requestedOdds = outcomes[input.outcomeIndex].oddsDecimal;
        const slippage = Math.abs(currentOdds - requestedOdds) / requestedOdds;

        if (slippage > input.maxSlippageBps / 10000) {
          throw new Error(
            `Slippage exceeded. Current odds: ${currentOdds}, requested: ${requestedOdds}, slippage: ${(slippage * 100).toFixed(2)}%`,
          );
        }
      }
    }

    // 6. Build transaction
    const userPubkey = new PublicKey(input.userPubkey);
    const amountUnits = Math.floor(input.amount * 1_000_000); // USDC has 6 decimals
    const collateral = Math.floor(amountUnits / input.leverage);

    // PDA derivation
    const marketPda = this.deriveMarketPda(Number(market.chainMarketId));
    const positionPda = solanaService.getPositionPda(Number(market.chainMarketId), userPubkey);
    const marketVaultPda = solanaService.getMarketVaultPda(Number(market.chainMarketId));
    const configPda = solanaService.getConfigPda();

    // Build place_bet instruction
    // NOTE: This is a simplified transaction. In production, use the Anchor TS SDK
    // with the generated IDL for proper instruction encoding.
    const tx = new Transaction();

    // Add compute budget
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
    );

    // The actual place_bet instruction would be added here using
    // the Anchor program.methods.placeBet() builder from the generated SDK.
    // For now, we include the account structure as a comment:
    //
    // accounts:
    //   market: marketPda
    //   position: positionPda
    //   marketVault: marketVaultPda
    //   user: userPubkey
    //   config: configPda
    //   tokenProgram: TOKEN_PROGRAM_ID
    //   systemProgram: SystemProgram.programId
    //
    // args: outcomeIndex, amountUnits, leverage, maxSlippageBps

    // 7. Simulate (optional — requires RPC)
    // const simulation = await solanaService.connection.simulateTransaction(tx);

    // 8. Return serialized transaction
    const serializedTx = tx
      .serialize({ requireAllSignatures: false })
      .toString("base64");

    return {
      tx: serializedTx,
      marketId: Number(market.chainMarketId),
      positionPda: positionPda.toBase58(),
      estimatedGas: 400_000,
    };
  }

  /**
   * Build a claim_payout transaction.
   */
  async buildClaimTx(marketId: string, userPubkey: string): Promise<TransactionResult> {
    const market = await prisma.market.findUnique({ where: { id: marketId } });
    if (!market) {
      throw new Error("Market not found");
    }
    if (market.status !== "SETTLED") {
      throw new Error("Market is not settled yet");
    }
    if (market.winningOutcome === null || market.winningOutcome === undefined) {
      throw new Error("Market has no winning outcome");
    }

    const userPk = new PublicKey(userPubkey);
    const positionPda = solanaService.getPositionPda(Number(market.chainMarketId), userPk);
    const marketVaultPda = solanaService.getMarketVaultPda(Number(market.chainMarketId));
    const marketPda = this.deriveMarketPda(Number(market.chainMarketId));
    const configPda = solanaService.getConfigPda();

    const tx = new Transaction();
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    );

    const serializedTx = tx
      .serialize({ requireAllSignatures: false })
      .toString("base64");

    return {
      tx: serializedTx,
      marketId: Number(market.chainMarketId),
      positionPda: positionPda.toBase58(),
      estimatedGas: 200_000,
    };
  }

  /**
   * Create a position record after successful on-chain bet.
   */
  async recordPosition(params: {
    chainPositionId: number;
    marketId: string;
    walletAddress: string;
    outcomeIndex: number;
    amount: number;
    leverage: number;
    oddsAtEntry: number;
    chainPositionPda: string;
  }) {
    const amount = params.amount;
    const collateral = amount / params.leverage;

    const position = await prisma.position.create({
      data: {
        chainPositionId: BigInt(params.chainPositionId),
        marketId: params.marketId,
        walletAddress: params.walletAddress,
        outcomeIndex: params.outcomeIndex,
        amount: amount,
        leverage: params.leverage,
        collateral: collateral,
        oddsAtEntry: params.oddsAtEntry,
        potentialPayout: amount * params.oddsAtEntry,
        chainPositionPda: params.chainPositionPda,
        status: "ACTIVE",
      },
    });

    // Upsert user
    await prisma.user.upsert({
      where: { walletAddress: params.walletAddress },
      update: {
        totalBets: { increment: 1 },
        totalVolume: { increment: amount },
      },
      create: {
        walletAddress: params.walletAddress,
        totalBets: 1,
        totalVolume: amount,
      },
    });

    // Invalidate cache
    await cacheService.invalidate(`user:${params.walletAddress}:positions`);

    logger.info(
      { positionId: position.id, marketId: params.marketId, amount },
      "Position recorded",
    );

    return position;
  }

  /**
   * Get a bet by ID.
   */
  async getBet(id: string) {
    const position = await prisma.position.findUnique({
      where: { id },
      include: {
        market: {
          select: {
            id: true,
            marketType: true,
            outcomes: true,
            status: true,
            winningOutcome: true,
          },
        },
      },
    });

    if (!position) return null;

    return {
      id: position.id,
      marketId: position.marketId,
      market: position.market,
      walletAddress: position.walletAddress,
      outcomeIndex: position.outcomeIndex,
      amount: Number(position.amount),
      leverage: position.leverage,
      collateral: Number(position.collateral),
      oddsAtEntry: Number(position.oddsAtEntry),
      potentialPayout: Number(position.potentialPayout),
      status: position.status,
      claimed: position.claimed,
      payoutAmount: Number(position.payoutAmount),
      createdAt: position.createdAt.toISOString(),
      settledAt: position.settledAt?.toISOString() || null,
    };
  }

  /**
   * Derive market PDA from chain market ID.
   */
  private deriveMarketPda(chainMarketId: number): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), Buffer.from(new Uint8Array(new Uint32Array([chainMarketId]).buffer))],
      solanaService.factoryProgramId,
    );
    return pda;
  }
}

export const bettingService = new BettingService();
