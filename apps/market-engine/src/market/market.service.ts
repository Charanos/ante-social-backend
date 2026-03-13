import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Market, MarketDocument } from '@app/database';
import {
  CreateMarketDto,
  MarketStatus,
  KAFKA_TOPICS,
  UserTier,
  normalizeUserTier,
} from '@app/common';
import { ClientKafka } from '@nestjs/microservices';
import { MarketCreatedEvent, MarketClosedEvent } from '@app/kafka';
import { SettlementDispatcher } from '../settlement/settlement.dispatcher';

@Injectable()
export class MarketService {
  constructor(
    @InjectModel(Market.name) private marketModel: Model<MarketDocument>,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
    private readonly settlementDispatcher: SettlementDispatcher,
  ) {}

  async create(createMarketDto: CreateMarketDto, userId: string) {
    if (!createMarketDto.outcomes || createMarketDto.outcomes.length < 2) {
      throw new BadRequestException('At least two outcomes are required');
    }

    const normalizedBetType =
      (createMarketDto.betType as string) === 'syndicate'
        ? 'betrayal'
        : createMarketDto.betType;

    const slug = await this.ensureUniqueMarketSlug(createMarketDto.title);

    const market = new this.marketModel({
      ...createMarketDto,
      slug,
      betType: normalizedBetType,
      minimumTier: normalizeUserTier(createMarketDto.minimumTier || UserTier.NOVICE),
      createdBy: new Types.ObjectId(userId),
      status: createMarketDto.scheduledPublishTime ? MarketStatus.SCHEDULED : MarketStatus.ACTIVE,
    });
    const saved = await market.save();

    this.kafkaClient.emit(
      KAFKA_TOPICS.MARKET_EVENTS,
      new MarketCreatedEvent({
        marketId: saved._id.toString(),
        type: saved.betType,
        title: saved.title,
        category: saved.tags?.[0] || '',
        createdBy: userId,
        opensAt: saved.startTime?.toISOString() || new Date().toISOString(),
        closesAt: saved.closeTime?.toISOString() || '',
      }),
    );

    return saved;
  }

  async findAll(query: any) {
    const {
      status,
      type,
      betType,
      tag,
      tags,
      category,
      isFeatured,
      isTrending,
      isRecurring,
      search,
      includeDeleted = 'false',
      limit = 20,
      offset = 0,
    } = query;

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 1000);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const filter: Record<string, any> = {};
    if (includeDeleted !== 'true') {
      filter.isDeleted = { $ne: true };
    }
    if (status) filter.status = status;
    
    // Support both 'type' and 'betType' query params
    const resolvedType = betType || type;
    if (resolvedType) filter.betType = resolvedType;
    
    // Support both 'tag' and 'tags' query params
    const resolvedTag = tags || tag;
    if (resolvedTag) filter.tags = resolvedTag;

    if (category) filter.category = category;
    if (isFeatured !== undefined) filter.isFeatured = isFeatured === 'true';
    if (isTrending !== undefined) filter.isTrending = isTrending === 'true';
    if (isRecurring !== undefined) filter.isRecurring = isRecurring === 'true';

    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [{ title: regex }, { description: regex }];
    }

    const [markets, total] = await Promise.all([
      this.marketModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .exec(),
      this.marketModel.countDocuments(filter),
    ]);

    return { data: markets, meta: { total, limit: safeLimit, offset: safeOffset } };
  }

  async findOne(id: string) {
    const market = await this.findMarketByIdentifier(id);
    if (!market) throw new NotFoundException('Market not found');
    return market;
  }

  async updateMarket(id: string, updates: Partial<CreateMarketDto>, userId: string) {
    const market = await this.findMarketByIdentifier(id);
    if (!market) throw new NotFoundException('Market not found');

    if (updates.outcomes && updates.outcomes.length < 2) {
      throw new BadRequestException('At least two outcomes are required');
    }

    const updateDoc: Record<string, any> = {};

    if (updates.title !== undefined) {
      updateDoc.title = updates.title;
      updateDoc.slug = await this.ensureUniqueMarketSlug(
        updates.title,
        market._id.toString(),
      );
    }
    if (updates.description !== undefined) updateDoc.description = updates.description;
    if (updates.scenario !== undefined) updateDoc.scenario = updates.scenario;
    if (updates.category !== undefined) updateDoc.category = updates.category;
    if (updates.isFeatured !== undefined) updateDoc.isFeatured = updates.isFeatured;
    if (updates.isRecurring !== undefined) updateDoc.isRecurring = updates.isRecurring;
    if (updates.isTrending !== undefined) updateDoc.isTrending = updates.isTrending;
    if (updates.betType !== undefined) {
      updateDoc.betType = (updates.betType as string) === 'syndicate' ? 'betrayal' : updates.betType;
    }
    if (updates.buyInAmount !== undefined) updateDoc.buyInAmount = updates.buyInAmount;
    if (updates.buyInCurrency !== undefined) updateDoc.buyInCurrency = updates.buyInCurrency;
    if (updates.marketDuration !== undefined) updateDoc.marketDuration = updates.marketDuration;
    if (updates.minParticipants !== undefined) updateDoc.minParticipants = updates.minParticipants;
    if (updates.maxParticipants !== undefined) updateDoc.maxParticipants = updates.maxParticipants;
    if (updates.minimumTier !== undefined) {
      updateDoc.minimumTier = normalizeUserTier(updates.minimumTier);
    }
    if (updates.settlementMethod !== undefined) updateDoc.settlementMethod = updates.settlementMethod;
    if (updates.externalApiEndpoint !== undefined) {
      updateDoc.externalApiEndpoint = updates.externalApiEndpoint;
    }
    if (updates.oddsType !== undefined) updateDoc.oddsType = updates.oddsType;
    if (updates.tags !== undefined) updateDoc.tags = updates.tags;
    if (updates.mediaUrl !== undefined) updateDoc.mediaUrl = updates.mediaUrl;
    if (updates.mediaType !== undefined) updateDoc.mediaType = updates.mediaType;
    if (updates.regionsAllowed !== undefined) updateDoc.regionsAllowed = updates.regionsAllowed;
    if (updates.regionsBlocked !== undefined) updateDoc.regionsBlocked = updates.regionsBlocked;
    if (updates.outcomes !== undefined) {
      updateDoc.outcomes = updates.outcomes.map((outcome: any) => {
        const out: any = {
          optionText: outcome.optionText,
          fixedOdds: outcome.fixedOdds,
          mediaUrl: outcome.mediaUrl,
          mediaType: outcome.mediaType || 'none',
        };
        if (outcome.id || outcome._id) out._id = new Types.ObjectId(outcome.id || outcome._id);
        return out;
      });
    }

    if (updates.startTime !== undefined) {
      updateDoc.startTime = new Date(updates.startTime);
    }
    if (updates.closeTime !== undefined) {
      updateDoc.closeTime = new Date(updates.closeTime);
    }
    if (updates.settlementTime !== undefined) {
      updateDoc.settlementTime = new Date(updates.settlementTime);
    }
    if (updates.scheduledPublishTime !== undefined) {
      updateDoc.scheduledPublishTime = new Date(updates.scheduledPublishTime);
    }

    updateDoc.lastEditedBy = new Types.ObjectId(userId);
    updateDoc.version = (market.version || 1) + 1;

    const updated = await this.marketModel.findByIdAndUpdate(market._id, updateDoc, { new: true });
    if (!updated) throw new NotFoundException('Market not found');
    return updated;
  }

  async deleteMarket(id: string, userId: string) {
    const market = await this.findMarketByIdentifier(id);
    if (!market) throw new NotFoundException('Market not found');

    market.isDeleted = true;
    market.deletedAt = new Date();
    market.deletedBy = new Types.ObjectId(userId);
    market.status = MarketStatus.CANCELLED;
    await market.save();

    return { success: true };
  }

  async closeMarket(id: string) {
    const market = await this.findMarketByIdentifier(id);
    if (!market) throw new NotFoundException('Market not found');

    if (
      market.status === MarketStatus.CLOSED ||
      market.status === MarketStatus.SETTLING ||
      market.status === MarketStatus.SETTLED
    ) {
      return market;
    }

    if (market.status !== MarketStatus.ACTIVE) {
      throw new BadRequestException('Market is not active');
    }

    market.status = MarketStatus.CLOSED;
    market.closeTime = new Date();
    const saved = await market.save();

    this.kafkaClient.emit(
      KAFKA_TOPICS.MARKET_EVENTS,
      new MarketClosedEvent({
        marketId: saved._id.toString(),
        type: saved.betType,
        totalPool: saved.totalPool || 0,
        participantCount: saved.participantCount || 0,
        closedAt: saved.closeTime.toISOString(),
      }),
    );

    return saved;
  }

  async settleMarket(id: string, winningOptionId?: string) {
    const market = await this.findMarketByIdentifier(id);
    if (!market) throw new NotFoundException('Market not found');

    if (market.status === MarketStatus.SETTLED) {
      return market;
    }

    if (market.status !== MarketStatus.CLOSED && market.status !== MarketStatus.SETTLING) {
      throw new BadRequestException('Market must be closed before settlement');
    }

    const settlingMarket =
      market.status === MarketStatus.SETTLING
        ? market
        : await this.marketModel.findOneAndUpdate(
            {
              _id: market._id,
              status: MarketStatus.CLOSED,
              isDeleted: { $ne: true },
            },
            { $set: { status: MarketStatus.SETTLING } },
            { new: true },
          );

    if (!settlingMarket) {
      const latest = await this.marketModel.findById(market._id);
      if (latest?.status === MarketStatus.SETTLED) {
        return latest;
      }
      throw new BadRequestException('Market settlement is already in progress');
    }

    if (winningOptionId) {
      settlingMarket.winningOutcomeId = new Types.ObjectId(winningOptionId);
      await settlingMarket.save();
    }

    try {
      await this.settlementDispatcher.dispatch(settlingMarket);
    } catch (error) {
      await this.marketModel.findByIdAndUpdate(settlingMarket._id, { status: MarketStatus.CLOSED });
      throw error;
    }

    settlingMarket.status = MarketStatus.SETTLED;
    settlingMarket.settlementTime = new Date();
    await settlingMarket.save();

    return settlingMarket;
  }

  private normalizeIdentifier(value: string) {
    try {
      return decodeURIComponent(String(value || '').trim()).toLowerCase();
    } catch {
      return String(value || '').trim().toLowerCase();
    }
  }

  private slugify(value: string) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  private async ensureUniqueMarketSlug(title: string, excludeMarketId?: string) {
    const base = this.slugify(title) || `market-${Date.now()}`;
    let candidate = base;
    let attempt = 0;
    while (attempt < 1000) {
      const existing = await this.marketModel
        .findOne({
          slug: candidate,
          ...(excludeMarketId ? { _id: { $ne: new Types.ObjectId(excludeMarketId) } } : {}),
        })
        .select('_id')
        .lean()
        .exec();
      if (!existing) return candidate;
      attempt += 1;
      candidate = `${base}-${attempt + 1}`;
    }
    return `${base}-${Date.now()}`;
  }

  private async findMarketByIdentifier(identifier: string) {
    const normalized = this.normalizeIdentifier(identifier);
    return this.marketModel
      .findOne({
        isDeleted: { $ne: true },
        $or: [
          ...(Types.ObjectId.isValid(normalized) ? [{ _id: new Types.ObjectId(normalized) }] : []),
          { slug: normalized },
          { externalId: normalized },
        ],
      })
      .exec();
  }
}
