import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
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
}
