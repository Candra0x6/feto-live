"use client";

import { Navbar } from "@/components/layout/Navbar";
import { Trophy, Medal, TrendingUp, Zap } from "lucide-react";

const leaderboardCategories = [
  { id: "pnl", label: "Top P&L", icon: TrendingUp },
  { id: "roi", label: "Best ROI", icon: Zap },
  { id: "streak", label: "Best Streak", icon: Medal },
] as const;

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Leaderboard</h1>
          <p className="mt-1 text-sm text-text-muted">
            Top bettors across all markets
          </p>
        </div>

        {/* Categories */}
        <div className="mb-6 flex gap-2">
          {leaderboardCategories.map((cat) => (
            <button
              key={cat.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <cat.icon className="h-4 w-4" />
              {cat.label}
            </button>
          ))}
        </div>

        {/* Empty State */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface py-20">
          <Trophy className="mb-4 h-12 w-12 text-text-muted" />
          <h2 className="mb-2 text-lg font-semibold text-text-primary">
            No Rankings Yet
          </h2>
          <p className="text-sm text-text-muted">
            Rankings will appear once bets are settled
          </p>
        </div>
      </main>
    </div>
  );
}
