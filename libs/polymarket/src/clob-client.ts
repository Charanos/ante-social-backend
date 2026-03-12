import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import type {
  PolymarketPrice,
  PolymarketMidpoint,
  PolymarketSpread,
  PolymarketOrderBook,
  PolymarketPriceHistory,
  ClobPriceHistoryOptions,
} from './types';

export interface ClobClientConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

@Injectable()
export class ClobClient {
  private readonly http: AxiosInstance;
  private readonly logger = new Logger(ClobClient.name);

  constructor(config: ClobClientConfig = {}) {
    this.http = axios.create({
      baseURL: config.baseUrl || 'https://clob.polymarket.com',
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
          'CLOB API request failed';
        this.logger.warn(`[ClobClient] ${msg}`);
        return Promise.reject(err);
      },
    );
  }

  private async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await this.http.get<T>(path, { params });
    return res.data;
  }

  // ─── Prices ────────────────────────────────────────────────────────────────

  /**
   * Get the current price for a specific token (condition outcome).
   */
  async getPrice(tokenId: string): Promise<PolymarketPrice> {
    return this.get<PolymarketPrice>('/prices', { token_id: tokenId });
  }

  /**
   * Get prices for multiple tokens.
   */
  async getPrices(tokenIds: string[]): Promise<Record<string, PolymarketPrice>> {
    const results = await Promise.allSettled(
      tokenIds.map((id) => this.getPrice(id).then((p) => ({ id, p }))),
    );
    const out: Record<string, PolymarketPrice> = {};
    for (const r of results) {
      if (r.status === 'fulfilled') out[r.value.id] = r.value.p;
    }
    return out;
  }

  // ─── Midpoints ────────────────────────────────────────────────────────────

  async getMidpoint(tokenId: string): Promise<PolymarketMidpoint> {
    return this.get<PolymarketMidpoint>('/midpoints', { token_id: tokenId });
  }

  async getMidpoints(tokenIds: string[]): Promise<Record<string, number>> {
    const results = await Promise.allSettled(
      tokenIds.map((id) => this.getMidpoint(id).then((m) => ({ id, mid: m.mid }))),
    );
    const out: Record<string, number> = {};
    for (const r of results) {
      if (r.status === 'fulfilled') out[r.value.id] = r.value.mid;
    }
    return out;
  }

  // ─── Spread ───────────────────────────────────────────────────────────────

  async getSpread(tokenId: string): Promise<PolymarketSpread> {
    return this.get<PolymarketSpread>('/spread', { token_id: tokenId });
  }

  // ─── Order Book ───────────────────────────────────────────────────────────

  async getOrderBook(tokenId: string): Promise<PolymarketOrderBook> {
    return this.get<PolymarketOrderBook>('/book', { token_id: tokenId });
  }

  async getOrderBooks(tokenIds: string[]): Promise<PolymarketOrderBook[]> {
    const res = await this.http.post<PolymarketOrderBook[]>('/books', {
      token_ids: tokenIds,
    });
    return res.data;
  }

  // ─── Price History ────────────────────────────────────────────────────────

  async getPriceHistory(options: ClobPriceHistoryOptions): Promise<PolymarketPriceHistory> {
    const { token_id, interval = '1w', fidelity = 1, start_ts, end_ts } = options;
    return this.get<PolymarketPriceHistory>('/prices-history', {
      market: token_id,
      interval,
      fidelity,
      ...(start_ts && { startTs: start_ts }),
      ...(end_ts && { endTs: end_ts }),
    });
  }
}
