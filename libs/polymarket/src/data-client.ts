import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import type {
  PolymarketPosition,
  PolymarketClosedPosition,
  PolymarketTrade,
  PolymarketActivity,
  PolymarketLeaderboardEntry,
  PolymarketHolderData,
  PolymarketOpenInterest,
  PolymarketPaginated,
  DataPositionsFilter,
  DataTradesFilter,
  DataLeaderboardFilter,
} from './types';

export interface DataClientConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

@Injectable()
export class DataClient {
  private readonly http: AxiosInstance;
  private readonly logger = new Logger(DataClient.name);

  constructor(config: DataClientConfig = {}) {
    this.http = axios.create({
      baseURL: config.baseUrl || 'https://data-api.polymarket.com',
      timeout: config.timeoutMs || 12000,
      headers: {
        Accept: 'application/json',
      },
    });

    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Data API request failed';
        this.logger.warn(`[DataClient] ${msg}`);
        return Promise.reject(err);
      },
    );
  }

  private async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await this.http.get<T>(path, { params });
    return res.data;
  }

  private toParams(obj: object): Record<string, unknown> {
    return obj as unknown as Record<string, unknown>;
  }

  private unwrapPaginated<T>(
    payload: PolymarketPaginated<T> | T[],
  ): T[] {
    return Array.isArray(payload) ? payload : payload.data;
  }

  // ─── Positions ─────────────────────────────────────────────────────────────

  async getPositions(filter: DataPositionsFilter): Promise<PolymarketPosition[]> {
    const payload = await this.get<PolymarketPaginated<PolymarketPosition> | PolymarketPosition[]>(
      '/positions',
      this.toParams(filter),
    );
    return this.unwrapPaginated(payload);
  }

  async getClosedPositions(
    user: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<PolymarketClosedPosition[]> {
    const payload = await this.get<
      PolymarketPaginated<PolymarketClosedPosition> | PolymarketClosedPosition[]
    >('/closed-positions', { user, ...options });
    return this.unwrapPaginated(payload);
  }

  // ─── Trades ────────────────────────────────────────────────────────────────

  async getTrades(filter: DataTradesFilter): Promise<PolymarketTrade[]> {
    const payload = await this.get<PolymarketPaginated<PolymarketTrade> | PolymarketTrade[]>(
      '/trades',
      this.toParams(filter),
    );
    return this.unwrapPaginated(payload);
  }

  // ─── Activity ──────────────────────────────────────────────────────────────

  async getActivity(
    user: string,
    options: { limit?: number; offset?: number; type?: string; market?: string } = {},
  ): Promise<PolymarketActivity[]> {
    const payload = await this.get<PolymarketPaginated<PolymarketActivity> | PolymarketActivity[]>(
      '/activity',
      { user, ...options },
    );
    return this.unwrapPaginated(payload);
  }

  // ─── Leaderboard ───────────────────────────────────────────────────────────

  async getLeaderboard(
    filter: DataLeaderboardFilter = {},
  ): Promise<PolymarketLeaderboardEntry[]> {
    const payload = await this.get<
      PolymarketPaginated<PolymarketLeaderboardEntry> | PolymarketLeaderboardEntry[]
    >('/v1/leaderboard', this.toParams(filter));
    return this.unwrapPaginated(payload);
  }

  // ─── Holders ───────────────────────────────────────────────────────────────

  async getHolders(
    tokenId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<PolymarketHolderData[]> {
    const payload = await this.get<PolymarketPaginated<PolymarketHolderData> | PolymarketHolderData[]>(
      '/holders',
      { token_id: tokenId, ...options },
    );
    return this.unwrapPaginated(payload);
  }

  // ─── Open Interest ─────────────────────────────────────────────────────────

  async getOpenInterest(market: string): Promise<PolymarketOpenInterest[]> {
    const payload = await this.get<PolymarketPaginated<PolymarketOpenInterest> | PolymarketOpenInterest[]>(
      '/open-interest',
      { market },
    );
    return this.unwrapPaginated(payload);
  }
}
