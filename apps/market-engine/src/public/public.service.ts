import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  Blog,
  BlogDocument,
  Group,
  GroupDocument,
  LandingPage,
  LandingPageDocument,
  Market,
  MarketDocument,
  Transaction,
  TransactionDocument,
  User,
  UserDocument,
} from '@app/database';

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Market.name) private readonly marketModel: Model<MarketDocument>,
    @InjectModel(Group.name) private readonly groupModel: Model<GroupDocument>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(LandingPage.name)
    private readonly landingPageModel: Model<LandingPageDocument>,
    @InjectModel(Blog.name) private readonly blogModel: Model<BlogDocument>,
  ) {}

  async getLandingPageSettings(key = 'default') {
    const normalizedKey = String(key || 'default').trim().toLowerCase() || 'default';

    try {
      const settings = await this.landingPageModel
        .findOne({ key: normalizedKey })
        .lean()
        .exec();

      if (!settings) {
        return {
          key: normalizedKey,
          hero: {},
          features: {},
          gameModes: {},
          testimonials: {},
          hallOfFame: {},
          currency: {},
          socialProofStats: {},
        };
      }

      return settings;
    } catch (error: any) {
      this.logger.error(`Error fetching landing page settings: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getPublicDepositMetrics() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();

    const rows = await this.transactionModel
      .aggregate([
        {
          $match: {
            type: 'deposit',
            status: 'completed',
            createdAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: { provider: '$paymentProvider', currency: '$currency' },
            amount: { $sum: '$amount' },
            count: { $sum: 1 },
            latest: { $max: '$createdAt' },
          },
        },
      ])
      .exec();

    const normalizeProvider = (value?: string) => {
      const provider = String(value || '').toLowerCase();
      if (provider === 'mpesa') return 'mpesa';
      if (provider === 'nowpayments') return 'crypto';
      if (provider.includes('crypto')) return 'crypto';
      return provider || 'unknown';
    };

    let mpesaAmount = 0;
    let mpesaCount = 0;
    let mpesaLast: Date | null = null;
    let cryptoAmount = 0;
    let cryptoCount = 0;
    let cryptoLast: Date | null = null;
    let totalCount = 0;

    for (const row of rows || []) {
      const provider = normalizeProvider(row?._id?.provider);
      const amount = Number(row?.amount || 0);
      const count = Number(row?.count || 0);
      totalCount += count;

      if (provider === 'mpesa') {
        mpesaAmount += amount;
        mpesaCount += count;
        if (row?.latest && (!mpesaLast || row.latest > mpesaLast)) {
          mpesaLast = row.latest;
        }
      } else if (provider === 'crypto') {
        cryptoAmount += amount;
        cryptoCount += count;
        if (row?.latest && (!cryptoLast || row.latest > cryptoLast)) {
          cryptoLast = row.latest;
        }
      }
    }

    return {
      range: { from: since.toISOString(), to: now.toISOString() },
      totals: {
        mpesa: {
          amount: mpesaAmount,
          currency: 'KSH',
          count: mpesaCount,
          lastAt: mpesaLast?.toISOString() || null,
        },
        crypto: {
          amount: cryptoAmount,
          currency: 'USD',
          count: cryptoCount,
          lastAt: cryptoLast?.toISOString() || null,
        },
      },
      totalCount,
    };
  }

  async getPublicLandingMetrics() {
    const [
      totalUsers,
      verifiedUsers,
      highTierUsers,
      totalMarkets,
      activeMarkets,
      totalGroups,
      participantsAgg,
      totalVolumeAgg,
    ] = await Promise.all([
      this.userModel.countDocuments({ isDeleted: { $ne: true } }),
      this.userModel.countDocuments({ isVerified: true, isDeleted: { $ne: true } }),
      this.userModel.countDocuments({
        tier: { $in: ['strategist', 'high_roller'] },
        isDeleted: { $ne: true },
      }),
      this.marketModel.countDocuments({ isDeleted: { $ne: true } }),
      this.marketModel.countDocuments({ status: 'active', isDeleted: { $ne: true } }),
      this.groupModel.countDocuments({ isSuspended: { $ne: true } }),
      this.marketModel
        .aggregate([
          { $match: { isDeleted: { $ne: true } } },
          { $group: { _id: null, total: { $sum: '$participantCount' } } },
        ])
        .then((res) => Number(res?.[0]?.total || 0)),
      this.transactionModel
        .aggregate([
          { $match: { type: 'bet_placed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ])
        .then((res) => Number(res?.[0]?.total || 0)),
    ]);

    return {
      updatedAt: new Date().toISOString(),
      totals: {
        users: totalUsers,
        verifiedUsers,
        highTierUsers,
        markets: totalMarkets,
        activeMarkets,
        groups: totalGroups,
        participants: participantsAgg,
        totalVolume: totalVolumeAgg,
      },
    };
  }

  async getPublicLeaderboard(limit = 10, timePeriod?: string) {
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const normalizedPeriod = String(timePeriod || 'all-time').toLowerCase();

    if (normalizedPeriod === 'weekly' || normalizedPeriod === 'week') {
      const weekly = await this.getWeeklyLeaderboard(safeLimit);
      if (weekly.length > 0) {
        return { data: weekly, meta: { timePeriod: 'weekly' } };
      }
    }

    const users = await this.userModel
      .find({ isBanned: { $ne: true }, isDeleted: { $ne: true } })
      .select('username fullName avatarUrl reputationScore positionsWon positionsLost tier updatedAt')
      .sort({ reputationScore: -1 })
      .limit(safeLimit)
      .lean()
      .exec();

    return { data: users, meta: { timePeriod: 'all-time' } };
  }

  async getPublicBlogs(limit = 20, offset = 0) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const filter: Record<string, any> = { status: 'published' };

    const [blogs, total] = await Promise.all([
      this.blogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.blogModel.countDocuments(filter),
    ]);

    return { data: blogs, meta: { total, limit: safeLimit, offset: safeOffset } };
  }

  async getPublicBlogBySlug(slug: string) {
    if (!slug || slug.trim().length === 0) {
      throw new BadRequestException('Slug is required');
    }

    const blog = await this.blogModel
      .findOne({ slug: slug.trim(), status: 'published' })
      .lean()
      .exec();
    if (!blog) throw new NotFoundException('Blog not found');
    return blog;
  }

  async incrementPublicBlogViews(slug: string) {
    if (!slug || slug.trim().length === 0) {
      throw new BadRequestException('Slug is required');
    }

    const blog = await this.blogModel.findOneAndUpdate(
      { slug: slug.trim(), status: 'published' },
      { $inc: { views: 1 } },
      { new: true, select: 'views' },
    ).exec();

    if (!blog) throw new NotFoundException('Blog not found');
    return { success: true, views: blog.views || 0 };
  }

  private async getWeeklyLeaderboard(limit: number) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const amountExpr = { $ifNull: ['$amountInSettlementCurrency', '$amount'] };

    const rows = await this.transactionModel
      .aggregate([
        {
          $match: {
            status: 'completed',
            type: { $in: ['bet_placed', 'bet_payout'] },
            createdAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: '$userId',
            placedCount: {
              $sum: { $cond: [{ $eq: ['$type', 'bet_placed'] }, 1, 0] },
            },
            payoutCount: {
              $sum: { $cond: [{ $eq: ['$type', 'bet_payout'] }, 1, 0] },
            },
            placedAmount: {
              $sum: { $cond: [{ $eq: ['$type', 'bet_placed'] }, amountExpr, 0] },
            },
            payoutAmount: {
              $sum: { $cond: [{ $eq: ['$type', 'bet_payout'] }, amountExpr, 0] },
            },
            lastAt: { $max: '$createdAt' },
          },
        },
        {
          $addFields: {
            weeklyPnl: { $subtract: ['$payoutAmount', '$placedAmount'] },
          },
        },
        { $sort: { weeklyPnl: -1, payoutAmount: -1, placedCount: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        {
          $match: {
            'user.isBanned': { $ne: true },
            'user.isDeleted': { $ne: true },
          },
        },
        {
          $project: {
            _id: '$user._id',
            username: '$user.username',
            fullName: '$user.fullName',
            avatarUrl: '$user.avatarUrl',
            reputationScore: '$user.reputationScore',
            positionsWon: '$user.positionsWon',
            positionsLost: '$user.positionsLost',
            tier: '$user.tier',
            updatedAt: '$user.updatedAt',
            weeklyStats: {
              placedCount: '$placedCount',
              payoutCount: '$payoutCount',
              placedAmount: '$placedAmount',
              payoutAmount: '$payoutAmount',
              pnl: '$weeklyPnl',
              lastAt: '$lastAt',
            },
          },
        },
      ])
      .exec();

    return rows || [];
  }
}
