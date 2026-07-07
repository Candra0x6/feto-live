"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Clock, Users } from "lucide-react";

interface MatchCardProps {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: number | null;
  status: string;
  activeMarkets: number;
  startTime: string;
  competition: string | null;
}

const statusConfig = {
  LIVE: { label: "LIVE", className: "bg-danger text-white animate-pulse" },
  SCHEDULED: { label: "Upcoming", className: "bg-warning/20 text-warning" },
  FINISHED: { label: "Final", className: "bg-text-muted/20 text-text-muted" },
  PAUSED: { label: "HT", className: "bg-warning/20 text-warning" },
  ABANDONED: { label: "Abandoned", className: "bg-danger/20 text-danger" },
} as const;

export function MatchCard({
  id,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  minute,
  status,
  activeMarkets,
  startTime,
  competition,
}: MatchCardProps) {
  const config =
    statusConfig[status as keyof typeof statusConfig] || statusConfig.SCHEDULED;
  const isLive = status === "LIVE";

  return (
    <Link
      href={`/matches/${id}`}
      className={cn(
        "group block rounded-xl border p-4 transition-all",
        isLive
          ? "border-danger/30 bg-danger/5 hover:border-danger/50"
          : "border-border bg-surface hover:border-text-muted hover:bg-surface-hover",
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", config.className)}>
            {config.label}
          </span>
          {isLive && minute !== null && (
            <span className="text-xs text-text-muted">{minute}&apos;</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-text-muted">
          <Users className="h-3 w-3" />
          <span>{activeMarkets} markets</span>
        </div>
      </div>

      {/* Teams & Score */}
      <div className="flex items-center justify-between">
        {/* Home Team */}
        <div className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-hover text-sm font-bold uppercase">
            {homeTeam.slice(0, 3)}
          </div>
          <span className="text-center text-sm font-medium text-text-primary">
            {homeTeam}
          </span>
        </div>

        {/* Score */}
        <div className="mx-4 flex flex-col items-center">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "text-3xl font-bold",
                isLive ? "text-text-primary" : "text-text-muted",
              )}
            >
              {isLive || status === "FINISHED" ? homeScore : "-"}
            </span>
            <span className="text-sm text-text-muted">:</span>
            <span
              className={cn(
                "text-3xl font-bold",
                isLive ? "text-text-primary" : "text-text-muted",
              )}
            >
              {isLive || status === "FINISHED" ? awayScore : "-"}
            </span>
          </div>
          {!isLive && status !== "FINISHED" && (
            <div className="mt-1 flex items-center gap-1 text-xs text-text-muted">
              <Clock className="h-3 w-3" />
              <span>
                {new Date(startTime).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
        </div>

        {/* Away Team */}
        <div className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-hover text-sm font-bold uppercase">
            {awayTeam.slice(0, 3)}
          </div>
          <span className="text-center text-sm font-medium text-text-primary">
            {awayTeam}
          </span>
        </div>
      </div>

      {/* Competition */}
      {competition && (
        <div className="mt-3 text-center text-xs text-text-muted">
          {competition}
        </div>
      )}
    </Link>
  );
}
