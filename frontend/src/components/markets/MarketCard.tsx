"use client";

import { useState } from "react";
import { cn, formatUsdc } from "@/lib/utils";
import { BetModal } from "@/components/bets/BetModal";
import { Lock, Zap } from "lucide-react";

interface MarketCardProps {
  id: string;
  chainMarketId: number;
  marketType: string;
  status: string;
  outcomes: Array<{
    label: string;
    oddsDecimal: number;
    oddsAmerican: string;
    impliedProbability: number;
  }>;
  totalPool: number;
  lockTime: string | null;
  leverageEnabled: boolean;
  maxLeverage: number;
}

const marketTypeLabels: Record<string, string> = {
  NEXT_CORNER: "Next Corner",
  NEXT_CARD: "Next Card",
  NEXT_SUBSTITUTION: "Next Substitution",
  NEXT_GOAL_SCORER: "Next Goal Scorer",
  GOAL_IN_5_MIN: "Goal in 5 min",
  ANY_GOAL: "Any Goal",
};

export function MarketCard({
  id,
  chainMarketId,
  marketType,
  status,
  outcomes,
  totalPool,
  lockTime,
  leverageEnabled,
  maxLeverage,
}: MarketCardProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null);
  const isOpen = status === "OPEN";
  const isSettled = status === "SETTLED";

  return (
    <>
      <div className="rounded-xl border border-border bg-surface p-4">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">
              {marketTypeLabels[marketType] || marketType}
            </span>
            {leverageEnabled && (
              <span className="flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                <Zap className="h-3 w-3" />
                Up to {maxLeverage}x
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            {!isOpen && !isSettled && (
              <span className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Locked
              </span>
            )}
            <span>Pool: {formatUsdc(totalPool)} USDC</span>
          </div>
        </div>

        {/* Outcomes */}
        <div className="grid grid-cols-3 gap-2">
          {outcomes.map((outcome, index) => {
            const isSelected = selectedOutcome === index;
            const isWinning = isSettled && index === 0; // Simplified

            return (
              <button
                key={index}
                onClick={() => isOpen && setSelectedOutcome(index)}
                disabled={!isOpen}
                className={cn(
                  "flex flex-col items-center rounded-lg border p-3 transition-all",
                  isOpen && !isSelected && "border-border hover:border-primary/50 hover:bg-primary/5",
                  isOpen && isSelected && "border-primary bg-primary/10",
                  !isOpen && "border-border/50 opacity-60",
                  isWinning && "border-success bg-success/10",
                )}
              >
                <span className="text-xs font-medium text-text-primary">
                  {outcome.label}
                </span>
                <span className="mt-1 text-lg font-bold text-text-primary">
                  {outcome.oddsAmerican}
                </span>
                <span className="mt-0.5 text-[10px] text-text-muted">
                  {outcome.impliedProbability.toFixed(0)}% prob.
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bet Modal */}
      {selectedOutcome !== null && (
        <BetModal
          marketId={id}
          chainMarketId={chainMarketId}
          marketType={marketType}
          outcomes={outcomes}
          selectedOutcome={selectedOutcome}
          leverageEnabled={leverageEnabled}
          maxLeverage={maxLeverage}
          onClose={() => setSelectedOutcome(null)}
        />
      )}
    </>
  );
}
