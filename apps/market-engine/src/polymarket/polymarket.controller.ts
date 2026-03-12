import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PolymarketService } from './polymarket.service';
import type {
  GammaMarketsFilter,
  GammaEventsFilter,
  GammaSearchOptions,
  DataLeaderboardFilter,
  ClobPriceHistoryOptions,
} from '@app/polymarket';

@Controller('polymarket')
export class PolymarketController {
  constructor(private readonly polymarket: PolymarketService) {}

  // ─── Markets ───────────────────────────────────────────────────────────────

  @Get('markets')
  @HttpCode(HttpStatus.OK)
  async listMarkets(@Query() query: Record<string, string>) {
    const filters: GammaMarketsFilter = {};
    if (query.active !== undefined) filters.active = query.active === 'true';
    if (query.closed !== undefined) filters.closed = query.closed === 'true';
    if (query.archived !== undefined) filters.archived = query.archived === 'true';
    if (query.featured !== undefined) filters.featured = query.featured === 'true';
    if (query.tag_slug) filters.tag_slug = query.tag_slug;
    if (query.tag_id) filters.tag_id = query.tag_id;
    if (query.liquidity_min) filters.liquidity_min = Number(query.liquidity_min);
    if (query.volume_min) filters.volume_min = Number(query.volume_min);
    if (query.order) filters.order = query.order;
    if (query.ascending !== undefined) filters.ascending = query.ascending === 'true';
    if (query.limit) filters.limit = Math.min(Number(query.limit) || 20, 100);
    if (query.offset) filters.offset = Number(query.offset) || 0;
    if (query.id) filters.id = query.id;

    return this.polymarket.listMarkets(filters);
  }

  @Get('markets/featured')
  async getFeaturedMarkets(@Query('limit') limit?: string) {
    return this.polymarket.getFeaturedMarkets(Number(limit) || 20);
  }

  @Get('markets/trending')
  async getTrendingMarkets(@Query('limit') limit?: string) {
    return this.polymarket.getTrendingMarkets(Number(limit) || 20);
  }

  @Get('markets/sports')
  async getSportsMarkets(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.polymarket.getSportsMarkets({
      limit: Number(limit) || 20,
      offset: Number(offset) || 0,
    });
  }

  @Get('markets/:id')
  async getMarket(@Param('id') id: string) {
    return this.polymarket.getMarket(id);
  }

  @Get('markets/:id/comments')
  async getMarketComments(
    @Param('id') assetId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.polymarket.getMarketComments(assetId, {
      limit: Number(limit) || 20,
      offset: Number(offset) || 0,
    });
  }

  @Get('markets/:id/price-history')
  async getMarketPriceHistory(
    @Param('id') tokenId: string,
    @Query('interval') interval?: string,
    @Query('fidelity') fidelity?: string,
  ) {
    const options: ClobPriceHistoryOptions = {
      token_id: tokenId,
      interval: (interval as ClobPriceHistoryOptions['interval']) || '1w',
      fidelity: fidelity ? Number(fidelity) : undefined,
    };
    return this.polymarket.getMarketPriceHistory(options);
  }

  @Get('markets/:id/orderbook')
  async getMarketOrderBook(@Param('id') tokenId: string) {
    return this.polymarket.getMarketOrderBook(tokenId);
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  @Get('events')
  async listEvents(@Query() query: Record<string, string>) {
    const filters: GammaEventsFilter = {};
    if (query.active !== undefined) filters.active = query.active === 'true';
    if (query.closed !== undefined) filters.closed = query.closed === 'true';
    if (query.tag_slug) filters.tag_slug = query.tag_slug;
    if (query.limit) filters.limit = Math.min(Number(query.limit) || 20, 100);
    if (query.offset) filters.offset = Number(query.offset) || 0;
    if (query.id) filters.id = query.id;

    return this.polymarket.listEvents(filters);
  }

  @Get('events/:id')
  async getEvent(@Param('id') id: string) {
    return this.polymarket.getEvent(id);
  }

  // ─── Tags ──────────────────────────────────────────────────────────────────

  @Get('tags')
  async getTags() {
    return this.polymarket.getTags();
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  @Get('search')
  async search(@Query() query: Record<string, string>) {
    if (!query.q) {
      throw new BadRequestException('Search query parameter "q" is required');
    }
    const options: GammaSearchOptions = {
      q: query.q,
      events_status: query.events_status,
      limit_per_type: query.limit_per_type ? Number(query.limit_per_type) : undefined,
      page: query.page ? Number(query.page) : undefined,
      include_tags: query.include_tags !== 'false',
      include_profiles: query.include_profiles !== 'false',
      events_tag: query.events_tag,
    };
    return this.polymarket.search(options);
  }

  // ─── Leaderboard ───────────────────────────────────────────────────────────

  @Get('leaderboard')
  async getLeaderboard(@Query() query: Record<string, string>) {
    const filter: DataLeaderboardFilter = {
      category: query.category as DataLeaderboardFilter['category'],
      timePeriod: query.timePeriod as DataLeaderboardFilter['timePeriod'],
      orderBy: (query.orderBy as DataLeaderboardFilter['orderBy']) || 'PNL',
      limit: query.limit ? Math.min(Number(query.limit) || 20, 100) : 20,
      offset: query.offset ? Number(query.offset) : 0,
      user: query.user,
    };
    return this.polymarket.getLeaderboard(filter);
  }

  // ─── Trader Profile (public wallet address) ─────────────────────────────

  @Get('traders/:address')
  async getTraderProfile(
    @Param('address') address: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const options = {
      limit: Number(limit) || 20,
      offset: Number(offset) || 0,
    };
    const [positions, trades, activity] = await Promise.allSettled([
      this.polymarket.getTraderPositions(address, options),
      this.polymarket.getTraderTrades(address, options),
      this.polymarket.getTraderActivity(address, options),
    ]);

    return {
      address,
      positions: positions.status === 'fulfilled' ? positions.value : [],
      trades: trades.status === 'fulfilled' ? trades.value : [],
      activity: activity.status === 'fulfilled' ? activity.value : [],
    };
  }
}
