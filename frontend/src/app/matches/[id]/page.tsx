"use client";

import { use, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { api } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
import { MarketCard } from "@/components/markets/MarketCard";
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  Clock,
  Users,
  MapPin,
} from "lucide-react";
import Link from "next/link";

export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { publicKey } = useWallet();

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["match", id],
    queryFn: () => api.getMatch(id),
  });

  const isLive = data?.match.status === "LIVE";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="mb-3 h-8 w-8 text-danger" />
          <p className="text-text-muted">Match not found</p>
          <Link
            href="/"
            className="mt-4 text-sm text-primary hover:underline"
          >
            Back to matches
          </Link>
        </div>
      </div>
    );
  }

  const { match } = data;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Back link */}
        <Link
          href="/"
          className="mb-6 flex items-center gap-1 text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to matches
        </Link>

        {/* Match Header */}
        <div className="mb-8 rounded-2xl border border-border bg-surface p-6">
          {/* Status */}
          <div className="mb-6 flex items-center justify-center gap-4">
            {isLive && (
              <span className="rounded-full bg-danger px-3 py-1 text-xs font-bold text-white animate-pulse">
                LIVE
              </span>
            )}
            {match.competition && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <MapPin className="h-3 w-3" />
                {match.competition}
              </span>
            )}
            {match.venue && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <MapPin className="h-3 w-3" />
                {match.venue}
              </span>
            )}
          </div>

          {/* Scoreboard */}
          <div className="flex items-center justify-center gap-8">
            {/* Home */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-hover text-xl font-bold uppercase">
                {match.homeTeam.slice(0, 3)}
              </div>
              <span className="text-lg font-semibold text-text-primary">
                {match.homeTeam}
              </span>
            </div>

            {/* Score */}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-4">
                <span className="text-5xl font-bold text-text-primary">
                  {match.homeScore}
                </span>
                <span className="text-2xl text-text-muted">:</span>
                <span className="text-5xl font-bold text-text-primary">
                  {match.awayScore}
                </span>
              </div>
              {isLive && match.minute !== null && (
                <span className="mt-2 text-sm text-text-muted">
                  {match.minute}&apos;
                </span>
              )}
              {!isLive && match.status !== "FINISHED" && (
                <span className="mt-2 flex items-center gap-1 text-sm text-text-muted">
                  <Clock className="h-4 w-4" />
                  {new Date(match.startTime).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              )}
            </div>

            {/* Away */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-hover text-xl font-bold uppercase">
                {match.awayTeam.slice(0, 3)}
              </div>
              <span className="text-lg font-semibold text-text-primary">
                {match.awayTeam}
              </span>
            </div>
          </div>

          {/* Market count */}
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-text-muted">
            <Users className="h-4 w-4" />
            <span>{match.markets.length} active markets</span>
          </div>
        </div>

        {/* Markets */}
        <div>
          <h2 className="mb-4 text-xl font-bold text-text-primary">
            Markets
          </h2>

          {match.markets.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-8 text-center">
              <p className="text-text-muted">
                No markets available for this match yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {match.markets.map((market) => (
                <MarketCard
                  key={market.id}
                  id={market.id}
                  chainMarketId={market.chainMarketId}
                  marketType={market.marketType}
                  status={market.status}
                  outcomes={market.outcomes}
                  totalPool={market.totalPool}
                  lockTime={null}
                  leverageEnabled={false}
                  maxLeverage={1}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
