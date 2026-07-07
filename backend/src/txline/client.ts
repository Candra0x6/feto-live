import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import type { TxlineFixture, TxlineFixturesResponse, TxlineMatchDetail } from "./types.js";

/**
 * TxLINE API client for fetching match fixtures and scores.
 *
 * Docs: https://txodds.com/api-docs
 * Free tier: World Cup 2026 matches (Service Level 12, no TxL purchase required)
 */
class TxlineClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = config.TXLINE_API_URL;
    this.apiKey = config.TXLINE_API_KEY || "";
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
    };

    try {
      const response = await fetch(url, { ...options, headers });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TxLINE API error ${response.status}: ${errorText}`);
      }

      return response.json() as Promise<T>;
    } catch (err) {
      logger.error({ err, url }, "TxLINE API request failed");
      throw err;
    }
  }

  /**
   * Get all available fixtures (live + upcoming).
   */
  async getFixtures(): Promise<TxlineFixture[]> {
    const data = await this.request<TxlineFixturesResponse>("/fixtures");
    return data.fixtures || [];
  }

  /**
   * Get live fixtures only.
   */
  async getLiveFixtures(): Promise<TxlineFixture[]> {
    const fixtures = await this.getFixtures();
    return fixtures.filter((f) => f.status === "LIVE");
  }

  /**
   * Get match detail by TxLINE match ID, including events.
   */
  async getMatchDetail(matchId: number): Promise<TxlineMatchDetail> {
    return this.request<TxlineMatchDetail>(`/fixtures/${matchId}`);
  }

  /**
   * Get recent events for a match.
   */
  async getMatchEvents(matchId: number): Promise<TxlineMatchDetail["events"]> {
    const detail = await this.getMatchDetail(matchId);
    return detail.events || [];
  }
}

export const txlineClient = new TxlineClient();
