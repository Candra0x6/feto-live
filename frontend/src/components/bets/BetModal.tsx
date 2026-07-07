"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { cn, formatUsdc } from "@/lib/utils";
import { X, Zap, Info } from "lucide-react";

interface BetModalProps {
  marketId: string;
  chainMarketId: number;
  marketType: string;
  outcomes: Array<{
    label: string;
    oddsDecimal: number;
    oddsAmerican: string;
    impliedProbability: number;
  }>;
  selectedOutcome: number;
  leverageEnabled: boolean;
  maxLeverage: number;
  onClose: () => void;
}

export function BetModal({
  marketId,
  chainMarketId,
  marketType,
  outcomes,
  selectedOutcome,
  leverageEnabled,
  maxLeverage,
  onClose,
}: BetModalProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [amount, setAmount] = useState("10");
  const [leverage, setLeverage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const outcome = outcomes[selectedOutcome];
  const amountNum = parseFloat(amount) || 0;
  const collateral = amountNum / leverage;
  const potentialPayout = amountNum * outcome.oddsDecimal - amountNum;

  const handleSubmit = async () => {
    if (!publicKey || !signTransaction) {
      toast.error("Connect your wallet first");
      return;
    }

    if (amountNum < 0.01) {
      toast.error("Minimum bet is 0.01 USDC");
      return;
    }

    setIsSubmitting(true);
    try {
      // In production, this would call the backend API to build the transaction,
      // then the user signs it with their wallet.

      toast.success("Bet placed successfully! (demo)");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to place bet");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-surface">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Place Bet</h3>
            <p className="text-xs text-text-muted">
              {outcome.label} — {outcome.oddsAmerican}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Amount Input */}
        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Amount (USDC)
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0.01"
                step="1"
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-lg font-bold text-text-primary outline-none transition-colors focus:border-primary"
                placeholder="10.00"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                {[10, 50, 100].map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(String(v))}
                    className="rounded-md bg-surface-hover px-2 py-1 text-xs text-text-muted hover:text-text-primary"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Leverage (if enabled) */}
          {leverageEnabled && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium text-text-secondary">
                  Leverage
                </label>
                <span className="flex items-center gap-1 text-xs text-primary">
                  <Zap className="h-3 w-3" />
                  Up to {maxLeverage}x
                </span>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3, 5].filter((v) => v <= maxLeverage).map((v) => (
                  <button
                    key={v}
                    onClick={() => setLeverage(v)}
                    className={cn(
                      "flex-1 rounded-lg border py-2 text-sm font-medium transition-all",
                      leverage === v
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-text-muted hover:border-text-muted",
                    )}
                  >
                    {v}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-lg bg-background p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Stake</span>
              <span className="text-text-primary">{formatUsdc(amountNum)} USDC</span>
            </div>
            {leverage > 1 && (
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Collateral</span>
                <span className="text-text-primary">{formatUsdc(collateral)} USDC</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Odds</span>
              <span className="text-text-primary">{outcome.oddsAmerican}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Potential Profit</span>
              <span className="font-semibold text-success">
                +{formatUsdc(potentialPayout)} USDC
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Total Payout</span>
              <span className="font-semibold text-text-primary">
                {formatUsdc(amountNum + potentialPayout)} USDC
              </span>
            </div>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <p className="text-xs text-text-muted">
              {leverage > 1
                ? `Liquidation occurs if the odds shift against your position by ${Math.round((1 - 1/leverage) * 100)}% or more.`
                : "Standard 1x bet. You will lose your stake if the outcome does not occur."}
            </p>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !publicKey}
            className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white transition-all hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting
              ? "Building Transaction..."
              : !publicKey
                ? "Connect Wallet to Bet"
                : `Place Bet ${formatUsdc(amountNum)} USDC`}
          </button>
        </div>
      </div>
    </div>
  );
}
