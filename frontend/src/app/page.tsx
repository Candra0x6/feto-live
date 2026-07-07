"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
import { MatchCard } from "@/components/markets/MatchCard";
import { Loader2, AlertCircle, Search, RefreshCw } from "lucide-react";

const statusFilters = [
  { value: "", label: "All" },
  { value: "LIVE", label: "Live" },
  { value: "SCHEDULED", label: "Upcoming" },
  { value: "FINISHED", label: "Finished" },
] as const;

export default function HomePage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["matches", statusFilter, searchQuery],
    queryFn: () =>
      api.getMatches({
        status: statusFilter || undefined,
        search: searchQuery || undefined,
      }),
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Matches</h1>
            <p className="mt-1 text-sm text-text-muted">
              Browse live and upcoming matches
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  statusFilter === f.value
                    ? "bg-primary text-white"
                    : "bg-surface text-text-secondary hover:bg-surface-hover"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-4 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary sm:w-64"
            />
          </div>
        </div>

        {/* Content */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-20">
            <AlertCircle className="mb-3 h-8 w-8 text-danger" />
            <p className="text-text-muted">
              Failed to load matches. Make sure the backend is running.
            </p>
            <button
              onClick={() => refetch()}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-white"
            >
              Try Again
            </button>
          </div>
        )}

        {data && data.matches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-text-muted">No matches found</p>
          </div>
        )}

        {data && data.matches.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.matches.map((match) => (
              <MatchCard key={match.id} {...match} />
            ))}
          </div>
        )}

        {/* Demo data notice */}
        {data && data.matches.length === 0 && !error && (
          <div className="mt-8 rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-text-muted">
              No matches available yet.{" "}
              <button
                onClick={() => api.getMatches().catch(() => {})}
                className="text-primary hover:underline"
              >
                Seed the database
              </button>{" "}
              with mock data to see matches here.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
