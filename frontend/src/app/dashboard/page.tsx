"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { api } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
import { cn, formatUsdc, truncateWallet } from "@/lib/utils";
import {
  Loader2,
  Wallet,
  TrendingUp,
  Activity,
  Target,
  Trophy,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import Link from "next/link";

function StatCard({
  icon: Icon,
  label,
  value,
  change,
  positive = true,
}: {
  icon: any;
  label: string;
  value: string;
  change?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        {change && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              positive ? "text-success" : "text-danger",
            )}
          >
            {positive ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {change}
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        <p className="mt-1 text-xs text-text-muted">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toBase58() || "";

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["user", wallet],
    queryFn: () => api.getUserProfile(wallet),
    enabled: !!publicKey,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["user-stats", wallet],
    queryFn: () => api.getUserStats(wallet),
    enabled: !!publicKey,
  });

  const { data: positions, isLoading: positionsLoading } = useQuery({
    queryKey: ["user-positions", wallet],
    queryFn: () => api.getUserPositions(wallet),
    enabled: !!publicKey,
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
            <p className="mt-1 text-sm text-text-muted">
              Your betting activity and stats
            </p>
          </div>
        </div>

        {!connected ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface py-20">
            <Wallet className="mb-4 h-12 w-12 text-text-muted" />
            <h2 className="mb-2 text-lg font-semibold text-text-primary">
              Connect Your Wallet
            </h2>
            <p className="mb-6 text-sm text-text-muted">
              Connect your Solana wallet to view your dashboard
            </p>
            <WalletMultiButton />
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                icon={Activity}
                label="Total Bets"
                value={String(stats?.totalBets || 0)}
              />
              <StatCard
                icon={Target}
                label="Win Rate"
                value={`${stats?.winRate || 0}%`}
                change="vs avg"
                positive={(stats?.winRate || 0) >= 50}
              />
              <StatCard
                icon={TrendingUp}
                label="Total Volume"
                value={`${formatUsdc(stats?.totalVolume || 0)} USDC`}
              />
              <StatCard
                icon={Trophy}
                label="P&L"
                value={`${formatUsdc(stats?.totalPnl || 0)} USDC`}
                change={stats?.roi ? `${stats.roi}% ROI` : undefined}
                positive={(stats?.totalPnl || 0) >= 0}
              />
            </div>

            {/* Active Positions */}
            <div className="mb-8">
              <h2 className="mb-4 text-lg font-bold text-text-primary">
                Active Positions
              </h2>

              {positionsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : positions && positions.positions.length > 0 ? (
                <div className="space-y-3">
                  {positions.positions.map((pos: any) => (
                    <div
                      key={pos.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
                    >
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {pos.marketType} — Outcome {pos.outcomeIndex}
                        </p>
                        <p className="mt-1 text-xs text-text-muted">
                          {formatUsdc(pos.amount)} USDC @ {pos.oddsAtEntry}x
                        </p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium",
                          pos.status === "ACTIVE"
                            ? "bg-primary/20 text-primary"
                            : pos.status === "WON"
                              ? "bg-success/20 text-success"
                              : "bg-danger/20 text-danger",
                        )}
                      >
                        {pos.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-surface p-8 text-center">
                  <p className="text-sm text-text-muted">
                    No active positions.{" "}
                    <Link href="/" className="text-primary hover:underline">
                      Browse matches
                    </Link>{" "}
                    to place your first bet.
                  </p>
                </div>
              )}
            </div>

            {/* Wallet Info */}
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Wallet className="h-5 w-5 text-text-muted" />
                  <div>
                    <p className="text-sm text-text-muted">Connected Wallet</p>
                    <p className="text-sm font-medium text-text-primary">
                      {truncateWallet(wallet, 8)}
                    </p>
                  </div>
                </div>
                <WalletMultiButton />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
