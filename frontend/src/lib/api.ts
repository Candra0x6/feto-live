const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Request failed" }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  // ── Matches ──
  async getMatches(params?: { status?: string; search?: string; page?: number; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.search) searchParams.set("search", params.search);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));

    const qs = searchParams.toString();
    return this.request<{
      matches: Array<{
        id: string;
        txlineMatchId: number;
        homeTeam: string;
        awayTeam: string;
        homeScore: number;
        awayScore: number;
        minute: number | null;
        status: string;
        activeMarkets: number;
        startTime: string;
        competition: string;
        venue: string;
      }>;
      total: number;
      page: number;
    }>(`/api/matches${qs ? `?${qs}` : ""}`);
  }

  async getMatch(id: string) {
    return this.request<{
      match: {
        id: string;
        homeTeam: string;
        awayTeam: string;
        homeScore: number;
        awayScore: number;
        minute: number | null;
        status: string;
        startTime: string;
        competition: string;
        venue: string;
        markets: Array<{
          id: string;
          chainMarketId: number;
          marketType: string;
          status: string;
          outcomes: any;
          totalPool: number;
        }>;
      };
    }>(`/api/matches/${id}`);
  }

  // ── Markets ──
  async getMarkets(matchId: string, filters?: { type?: string; status?: string }) {
    const searchParams = new URLSearchParams();
    if (filters?.type) searchParams.set("type", filters.type);
    if (filters?.status) searchParams.set("status", filters.status);
    const qs = searchParams.toString();

    return this.request<{
      markets: Array<{
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
      }>;
    }>(`/api/matches/${matchId}/markets${qs ? `?${qs}` : ""}`);
  }

  // ── Bets ──
  async buildBetTx(params: {
    marketId: string;
    outcomeIndex: number;
    amount: number;
    leverage?: number;
    maxSlippageBps?: number;
    wallet: string;
  }) {
    return this.request<{
      tx: string;
      marketId: number;
      positionPda: string;
      estimatedGas: number;
    }>("/api/bets", {
      method: "POST",
      headers: { "x-wallet": params.wallet },
      body: JSON.stringify({
        marketId: params.marketId,
        outcomeIndex: params.outcomeIndex,
        amount: params.amount,
        leverage: params.leverage,
        maxSlippageBps: params.maxSlippageBps,
      }),
    });
  }

  // ── Users ──
  async getUserProfile(wallet: string) {
    return this.request<{
      user: {
        walletAddress: string;
        username: string | null;
        totalBets: number;
        totalWins: number;
        totalVolume: number;
        totalPnl: number;
        winRate: number;
      };
    }>(`/api/users/${wallet}`);
  }

  async getUserPositions(wallet: string) {
    return this.request<{
      positions: Array<{
        id: string;
        marketType: string;
        outcomeIndex: number;
        amount: number;
        leverage: number;
        oddsAtEntry: number;
        status: string;
        createdAt: string;
      }>;
    }>(`/api/users/${wallet}/positions`, {
      headers: { "x-wallet": wallet },
    });
  }

  async getUserHistory(wallet: string, params?: { status?: string; page?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.page) searchParams.set("page", String(params.page));
    const qs = searchParams.toString();

    return this.request<{
      bets: Array<any>;
      total: number;
      page: number;
    }>(`/api/users/${wallet}/history${qs ? `?${qs}` : ""}`);
  }

  async getUserStats(wallet: string) {
    return this.request<{
      totalBets: number;
      wins: number;
      losses: number;
      winRate: number;
      totalVolume: number;
      totalPnl: number;
      roi: number;
    }>(`/api/users/${wallet}/stats`);
  }

  async getUserPnl(wallet: string, period?: "7d" | "30d" | "all") {
    return this.request<{
      pnl: Array<{ date: string; pnl: number }>;
    }>(`/api/users/${wallet}/pnl${period ? `?period=${period}` : ""}`);
  }
}

export const api = new ApiClient(API_BASE);
