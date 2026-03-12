import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import type {
  PolymarketMarket,
  PolymarketEvent,
  PolymarketTag,
  PolymarketComment,
  PolymarketSearchResult,
  PolymarketPaginated,
  GammaMarketsFilter,
  GammaEventsFilter,
  GammaSearchOptions,
} from './types';

export interface GammaClientConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

@Injectable()
export class GammaClient {
  private readonly http: AxiosInstance;
  private readonly logger = new Logger(GammaClient.name);

  constructor(config: GammaClientConfig = {}) {
    this.http = axios.create({
      baseURL: config.baseUrl || 'https://gamma-api.polymarket.com',
      timeout: config.timeoutMs || 12000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Gamma API request failed';
        this.logger.warn(`[GammaClient] ${msg}`);
        return Promise.reject(err);
      },
    );
  }

  private async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const config: AxiosRequestConfig = {};
    if (params) {
      config.params = params;
    }
    const res = await this.http.get<T>(path, config);
    return res.data;
  }

  private toParams(obj: object): Record<string, unknown> {
    return obj as unknown as Record<string, unknown>;
  }

  // ─── Markets ───────────────────────────────────────────────────────────────

  async getMarkets(
    filters: GammaMarketsFilter = {},
  ): Promise<PolymarketMarket[]> {
    return this.get<PolymarketMarket[]>('/markets', this.toParams(filters));
  }

  async getMarket(conditionId: string): Promise<PolymarketMarket> {
    return this.get<PolymarketMarket>(`/markets/${conditionId}`);
  }

  async getMarketBySlug(slug: string): Promise<PolymarketMarket[]> {
    return this.get<PolymarketMarket[]>('/markets', { slug });
  }

  async getFeaturedMarkets(limit = 20): Promise<PolymarketMarket[]> {
    return this.get<PolymarketMarket[]>('/markets', {
      active: true,
      closed: false,
      featured: true,
      end_date_min: new Date().toISOString(),
      limit,
      order: 'volume',
      ascending: false,
    });
  }

  async getTrendingMarkets(limit = 20): Promise<PolymarketMarket[]> {
    return this.get<PolymarketMarket[]>('/markets', {
      active: true,
      closed: false,
      end_date_min: new Date().toISOString(),
      limit,
      order: 'volume',
      ascending: false,
    });
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  async getEvents(
    filters: GammaEventsFilter = {},
  ): Promise<PolymarketEvent[]> {
    return this.get<PolymarketEvent[]>('/events', this.toParams(filters));
  }

  async getEvent(id: string): Promise<PolymarketEvent> {
    return this.get<PolymarketEvent>(`/events/${id}`);
  }

  async getEventBySlug(slug: string): Promise<PolymarketEvent[]> {
    return this.get<PolymarketEvent[]>('/events', { slug });
  }

  async getActiveEvents(limit = 20): Promise<PolymarketEvent[]> {
    return this.get<PolymarketEvent[]>('/events', {
      active: true,
      closed: false,
      limit,
    });
  }

  // ─── Tags ──────────────────────────────────────────────────────────────────

  async getTags(limit = 100): Promise<PolymarketTag[]> {
    return this.get<PolymarketTag[]>('/tags', { limit });
  }

  async getTag(slug: string): Promise<PolymarketTag[]> {
    return this.get<PolymarketTag[]>('/tags', { slug });
  }

  // ─── Comments ──────────────────────────────────────────────────────────────

  async getComments(
    assetId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<PolymarketComment[]> {
    const payload = await this.get<PolymarketPaginated<PolymarketComment> | PolymarketComment[]>(
      '/comments',
      { asset_id: assetId, ...options },
    );
    return Array.isArray(payload) ? payload : payload.data;
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  async search(options: GammaSearchOptions): Promise<PolymarketSearchResult> {
    return this.get<PolymarketSearchResult>('/public-search', this.toParams(options));
  }

  // ─── Sports ────────────────────────────────────────────────────────────────

  async getSportsMarkets(
    options: { limit?: number; offset?: number } = {},
  ): Promise<PolymarketMarket[]> {
    return this.get<PolymarketMarket[]>('/sports', options);
  }
}
