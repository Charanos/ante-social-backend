import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { GammaClient } from '@app/polymarket';
import { DataClient } from '@app/polymarket';
import { ClobClient } from '@app/polymarket';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Market, MarketDocument, User, UserDocument } from '@app/database';
import type {
  PolymarketMarket,
  PolymarketEvent,
  PolymarketTag,
  PolymarketComment,
  PolymarketSearchResult,
  PolymarketLeaderboardEntry,
  PolymarketPriceHistory,
  PolymarketOrderBook,
  PolymarketPosition,
  PolymarketTrade,
  PolymarketActivity,
  GammaMarketsFilter,
  GammaEventsFilter,
  GammaSearchOptions,
  DataLeaderboardFilter,
  ClobPriceHistoryOptions,
} from '@app/polymarket';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * In-memory TTL cache to avoid redundant Polymarket API calls.
 * Default TTL is configured via POLYMARKET_CACHE_TTL_SECONDS env var (default 60s).
 */
class PolymarketCache {
  private redis: ReturnType<typeof createClient> | null = null;
  private readonly memStore = new Map<string, CacheEntry<unknown>>();
  private readonly ttlMs: number;
  private isRedisReady = false;
  private readonly logger = new Logger('PolymarketCache');

  constructor(private configService: ConfigService, ttlSeconds: number) {
    this.ttlMs = ttlSeconds * 1000;
  }

  async connect() {
    const redisUrl =
      this.configService.get<string>('REDIS_URL') ||
      this.configService.get<string>('REDIS_URI');
    
    if (!redisUrl) {
      this.logger.warn('No REDIS_URL provided. Falling back to in-memory caching.');
      return;
    }

    try {
      this.redis = createClient({ url: redisUrl });
      this.redis.on('error', (err) => {
        this.logger.error('Redis error', err);
        this.isRedisReady = false;
      });
      this.redis.on('ready', () => {
        this.logger.log('Polymarket cache Redis connected');
        this.isRedisReady = true;
      });
      await this.redis.connect();
    } catch (err) {
      this.logger.error('Failed to connect to Redis', err);
      this.isRedisReady = false;
    }
  }

  async disconnect() {
    if (this.redis && this.isRedisReady) {
      await this.redis.quit();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.isRedisReady && this.redis) {
      try {
        const val = await this.redis.get(key);
        if (val) return JSON.parse(val) as T;
        return null;
      } catch (err) {
        this.logger.warn(`Redis get error for ${key}: ${err}`);
      }
    }

    // Fallback to memStore
    const entry = this.memStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memStore.delete(key);
      return null;
    }
    return entry.data as T;
  }

  async set<T>(key: string, data: T, customTtlMs?: number): Promise<void> {
    const ttl = customTtlMs || this.ttlMs;
    if (this.isRedisReady && this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(data), {
          PX: ttl,
        });
        return;
      } catch (err) {
        this.logger.warn(`Redis set error for ${key}: ${err}`);
      }
    }

    // Fallback to memStore
    this.memStore.set(key, { data, expiresAt: Date.now() + ttl });
  }

  async clear(): Promise<void> {
    if (this.isRedisReady && this.redis) {
      // In a real prod environment with shared redis, we might use a prefix and delete keys by pattern
      // Because we share redis, flushing all would break rate limiting
      this.logger.warn('Redis clear() called on shared db, skipping to protect rate limits');
    }
    this.memStore.clear();
  }

  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.memStore.entries()) {
      if (now > entry.expiresAt) this.memStore.delete(key);
    }
  }
}

@Injectable()
export class PolymarketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PolymarketService.name);
  private readonly cache: PolymarketCache;
  private pruneInterval: NodeJS.Timeout;

  constructor(
    private readonly gamma: GammaClient,
    private readonly data: DataClient,
    private readonly clob: ClobClient,
    private readonly config: ConfigService,
    @InjectModel(Market.name) private readonly marketModel: Model<MarketDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    const ttlSeconds = Number(
      this.config.get('POLYMARKET_CACHE_TTL_SECONDS') || 60,
    );
    this.cache = new PolymarketCache(this.config, ttlSeconds);
  }

  async onModuleInit() {
    await this.cache.connect();
    // Prune stale mem cache entries every 5 minutes
    this.pruneInterval = setInterval(() => this.cache.prune(), 5 * 60 * 1000);
  }

  async onModuleDestroy() {
    clearInterval(this.pruneInterval);
    await this.cache.disconnect();
  }

  private async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = await this.cache.get<T>(key);
    if (hit !== null) return hit;
    const result = await fn();
    await this.cache.set(key, result);
    return result;
  }

  // ─── Gamma: Markets ────────────────────────────────────────────────────────

  async listMarkets(filters: GammaMarketsFilter = {}): Promise<PolymarketMarket[]> {
    const key = `markets:${JSON.stringify(filters)}`;
    return this.cached(key, () => this.gamma.getMarkets(filters));
  }

  async getMarket(id: string): Promise<PolymarketMarket> {
    const key = `market:${id}`;
    return this.cached(key, () => this.gamma.getMarket(id));
  }

  async getFeaturedMarkets(limit = 20): Promise<PolymarketMarket[]> {
    const key = `markets:featured:${limit}`;
    return this.cached(key, () => this.gamma.getFeaturedMarkets(limit));
  }

  async getTrendingMarkets(limit = 20): Promise<PolymarketMarket[]> {
    const key = `markets:trending:${limit}`;
    return this.cached(key, () => this.gamma.getTrendingMarkets(limit));
  }

  // ─── Gamma: Events ────────────────────────────────────────────────────────

  async listEvents(filters: GammaEventsFilter = {}): Promise<PolymarketEvent[]> {
    const key = `events:${JSON.stringify(filters)}`;
    return this.cached(key, () => this.gamma.getEvents(filters));
  }

  async getEvent(id: string): Promise<PolymarketEvent> {
    const key = `event:${id}`;
    return this.cached(key, () => this.gamma.getEvent(id));
  }

  // ─── Gamma: Tags ──────────────────────────────────────────────────────────

  async getTags(): Promise<PolymarketTag[]> {
    return this.cached('tags:all', () => this.gamma.getTags(200));
  }

  // ─── Gamma: Comments ──────────────────────────────────────────────────────

  async getMarketComments(
    assetId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<PolymarketComment[]> {
    const key = `comments:${assetId}:${JSON.stringify(options)}`;
    return this.cached(key, () => this.gamma.getComments(assetId, options));
  }

  // ─── Gamma: Search ────────────────────────────────────────────────────────

  async search(options: GammaSearchOptions): Promise<PolymarketSearchResult> {
    // Don't cache search results tightly to keep them fresh
    return this.gamma.search(options);
  }

  // ─── Gamma: Sports ────────────────────────────────────────────────────────

  async getSportsMarkets(options: { limit?: number; offset?: number } = {}): Promise<PolymarketMarket[]> {
    const key = `sports:${JSON.stringify(options)}`;
    return this.cached(key, () => this.gamma.getSportsMarkets(options));
  }

  // ─── CLOB: Pricing ────────────────────────────────────────────────────────

  async getMarketPriceHistory(
    options: ClobPriceHistoryOptions,
  ): Promise<PolymarketPriceHistory> {
    const key = `price-history:${JSON.stringify(options)}`;
    return this.cached(key, () => this.clob.getPriceHistory(options));
  }

  async getMarketOrderBook(tokenId: string): Promise<PolymarketOrderBook> {
    // Order book is always live — short cache (5s)
    const key = `order-book:${tokenId}`;
    const hit = await this.cache.get<PolymarketOrderBook>(key);
    if (hit) return hit;
    const book = await this.clob.getOrderBook(tokenId);
    await this.cache.set(key, book, 5000);
    return book;
  }

  async getMultipleOrderBooks(tokenIds: string[]): Promise<PolymarketOrderBook[]> {
    return this.clob.getOrderBooks(tokenIds);
  }

  // ─── Data: Leaderboard ────────────────────────────────────────────────────

  async getLeaderboard(
    filter: DataLeaderboardFilter = {},
  ): Promise<PolymarketLeaderboardEntry[]> {
    const key = `leaderboard:${JSON.stringify(filter)}`;
    return this.cached(key, () => this.data.getLeaderboard(filter));
  }

  // ─── Data: Trader Profile ─────────────────────────────────────────────────

  async getTraderPositions(
    address: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<PolymarketPosition[]> {
    const key = `positions:${address}:${JSON.stringify(options)}`;
    return this.cached(key, () =>
      this.data.getPositions({ user: address, ...options }),
    );
  }

  async getTraderTrades(
    address: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<PolymarketTrade[]> {
    const key = `trades:${address}:${JSON.stringify(options)}`;
    return this.cached(key, () =>
      this.data.getTrades({ user: address, ...options }),
    );
  }

  async getTraderActivity(
    address: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<PolymarketActivity[]> {
    const key = `activity:${address}:${JSON.stringify(options)}`;
    return this.cached(key, () =>
      this.data.getActivity(address, options),
    );
  }

  /** Invalidate all cached data */
  async clearCache(): Promise<void> {
    await this.cache.clear();
    this.logger.log('Polymarket cache cleared');
  }

  /**
   * Syncs Polymarket data to native Ante Social markets
   */
  async syncToNativeMarkets(polyMarkets: PolymarketMarket[]) {
    const admin = await this.userModel.findOne({ role: 'admin' }).select('_id').lean();
    const adminId = admin?._id as Types.ObjectId;

    for (const pm of polyMarkets) {
      const hasTokens = pm.tokens && pm.tokens.length >= 2;
      const hasClobTokens = pm.clobTokenIds && pm.clobTokenIds.length > 10; // Simple check for stringified array
      
      if (!hasTokens && !hasClobTokens) continue;

      try {
        const existing = await this.marketModel.findOne({
          externalId: pm.id,
          externalSource: 'polymarket',
        });

        if (existing) {
          // Update prices/status if needed
          await this.updateExistingMarket(existing, pm);
          continue;
        }

        // Create new native market
        const marketData = this.mapPolymarketToNative(pm, adminId);
        await this.marketModel.create(marketData);
        this.logger.log(`Imported Polymarket market: ${pm.question}`);
      } catch (err: any) {
        this.logger.error(`Failed to sync market ${pm.id}: ${err?.message || String(err)}`);
      }
    }

    // Global cleanup: ensure any market with past close time is marked as closed
    await this.marketModel.updateMany(
      { 
        status: 'active', 
        closeTime: { $lt: new Date() },
        isDeleted: { $ne: true }
      },
      { $set: { status: 'closed' } }
    );
  }

  private mapPolymarketToNative(pm: PolymarketMarket, adminId: Types.ObjectId) {
    const isTrending = (pm as any).isTrending || (pm.volume_24hr || 0) > 10000 || ((pm as any).volume24hr || 0) > 10000;
    const isFeatured = pm.featured || (pm as any).isFeatured || false;
    const closeTime = pm.endDate ? new Date(pm.endDate) : (pm.end_date_iso ? new Date(pm.end_date_iso) : new Date());
    
    return {
      title: pm.question,
      description: pm.description || 'Synced from Polymarket',
      scenario: pm.description || pm.question,
      slug: pm.market_slug || `poly-${pm.id}`,
      category: pm.tags?.[0]?.label || 'General',
      tags: pm.tags?.map((t) => t.label) || [],
      betType: 'consensus',
      status: (pm.active && closeTime.getTime() > Date.now()) ? 'active' : 'closed',
      isTrending: isTrending,
      isFeatured: isFeatured,
      buyInAmount: 1,
      buyInCurrency: 'USD',
      closeTime: closeTime,
      settlementTime: new Date(closeTime.getTime() + 24 * 60 * 60 * 1000),
      outcomes: this.parseOutcomes(pm),
      totalPool: pm.liquidity || 0,
      participantCount: 0,
      createdBy: adminId,
      externalId: pm.id,
      externalSource: 'polymarket',
      mediaUrl: pm.image,
      mediaType: pm.image ? 'image' : 'none',
    };
  }

  private parseOutcomes(pm: PolymarketMarket) {
    if (pm.tokens && pm.tokens.length >= 2) {
      return pm.tokens.map((token, i) => ({
        _id: new Types.ObjectId(),
        optionText: token.outcome || `Option ${(token as any).index !== undefined ? (token as any).index + 1 : i + 1}`,
        totalAmount: (token.price || 0) * 1000,
        participantCount: 0,
        mediaUrl: pm.image,
        mediaType: pm.image ? 'image' : 'none',
      }));
    }

    if (pm.outcomes) {
      const outcomeNames = typeof pm.outcomes === 'string' ? JSON.parse(pm.outcomes) : pm.outcomes;
      if (Array.isArray(outcomeNames)) {
        return outcomeNames.map((name, i) => ({
          _id: new Types.ObjectId(),
          optionText: name,
          totalAmount: 0,
          participantCount: 0,
          mediaUrl: pm.image,
          mediaType: pm.image ? 'image' : 'none',
        }));
      }
    }

    // Fallback if no tokens or outcomes are explicitly defined
    return [
      {
        _id: new Types.ObjectId(),
        optionText: 'Yes',
        totalAmount: 0,
        participantCount: 0,
        mediaUrl: pm.image,
        mediaType: pm.image ? 'image' : 'none',
      },
      {
        _id: new Types.ObjectId(),
        optionText: 'No',
        totalAmount: 0,
        participantCount: 0,
        mediaUrl: pm.image,
        mediaType: pm.image ? 'image' : 'none',
      },
    ];
  }

  private async updateExistingMarket(market: MarketDocument, pm: PolymarketMarket) {
    const closeTime = pm.endDate ? new Date(pm.endDate) : (pm.end_date_iso ? new Date(pm.end_date_iso) : new Date(market.closeTime));
    const status = (pm.active && closeTime.getTime() > Date.now()) ? 'active' : 'closed';
    const totalPool = (pm.liquidity || 0) as number;
    const isTrending = (pm as any).isTrending || (pm.volume_24hr || 0) > 10000 || ((pm as any).volume24hr || 0) > 10000;
    const isFeatured = pm.featured || (pm as any).isFeatured || false;

    let hasChanges = false;

    if (market.status !== status) {
      market.status = status;
      hasChanges = true;
    }
    
    if (Math.abs(market.totalPool - totalPool) > 1) {
      market.totalPool = totalPool;
      hasChanges = true;
    }

    if (market.isTrending !== isTrending) {
      market.isTrending = isTrending;
      hasChanges = true;
    }

    if (market.isFeatured !== isFeatured) {
      market.isFeatured = isFeatured;
      hasChanges = true;
    }

    // Sync image if missing
    if (!market.mediaUrl && pm.image) {
      market.mediaUrl = pm.image;
      market.mediaType = 'image';
      hasChanges = true;
    }

    if (hasChanges) {
      market.markModified('status');
      market.markModified('totalPool');
      market.markModified('isTrending');
      await market.save();
    }
  }
}
