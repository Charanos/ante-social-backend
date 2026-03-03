import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  User,
  UserDocument,
  Market,
  MarketDocument,
  Transaction,
  TransactionDocument,
} from '@app/database';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Market.name) private marketModel: Model<MarketDocument>,
    @InjectModel(Transaction.name) private txModel: Model<TransactionDocument>,
  ) {}

  async getDashboardStats() {
    const [
      totalUsers,
      activeMarkets,
      flaggedMarkets,
      pendingSettlements,
      pendingWithdrawals,
      totalVolumeAgg,
      totalRevenueAgg,
      pendingPayouts,
      participantsAgg,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.marketModel.countDocuments({ status: 'active', isDeleted: { $ne: true } }),
      this.marketModel.countDocuments({ isFlagged: true, isDeleted: { $ne: true } }),
      this.marketModel.countDocuments({
        status: { $in: ['closed', 'settling'] },
        isDeleted: { $ne: true },
      }),
      this.txModel.countDocuments({ type: 'withdrawal', status: 'pending' }),
      this.txModel
        .aggregate([{ $match: { type: 'bet_placed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
        .then((res) => res[0]?.total || 0),
      this.txModel
        .aggregate([{ $match: { type: 'platform_fee' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
        .then((res) => res[0]?.total || 0),
      this.txModel.countDocuments({ type: 'bet_payout', status: { $in: ['pending', 'processing'] } }),
      this.marketModel
        .aggregate([
          { $match: { isDeleted: { $ne: true } } },
          { $group: { _id: null, total: { $sum: '$participantCount' } } },
        ])
        .then((res) => res[0]?.total || 0),
    ]);

    return {
      totalUsers,
      activeMarkets,
      totalVolume: totalVolumeAgg,
      totalRevenue: totalRevenueAgg,
      participants: participantsAgg,
      pendingPayouts,
      pendingSettlements,
      pendingWithdrawals,
      flaggedMarkets,
    };
  }

  async getRevenueMetrics(from?: string, to?: string) {
    const { createdAtMatch, range } = this.resolveCreatedAtRange(from, to);

    const [
      totalDeposits,
      totalWithdrawals,
      totalVolume,
      totalRevenue,
      revenueTrend,
    ] = await Promise.all([
      this.sumTransactions('deposit', { status: 'completed', ...createdAtMatch }),
      this.sumTransactions('withdrawal', { status: 'completed', ...createdAtMatch }),
      this.sumTransactions('bet_placed', createdAtMatch),
      this.sumTransactions('platform_fee', createdAtMatch),
      this.txModel.aggregate([
        { $match: { type: 'platform_fee', ...createdAtMatch } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            value: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return {
      ...range,
      totals: {
        deposits: totalDeposits,
        withdrawals: totalWithdrawals,
        volume: totalVolume,
        revenue: totalRevenue,
      },
      trend: revenueTrend.map((row) => ({ date: row._id, value: row.value })),
    };
  }

  async getUserMetrics(from?: string, to?: string) {
    const { createdAtMatch, range } = this.resolveCreatedAtRange(from, to);
    const createdAt = createdAtMatch.createdAt ? { createdAt: createdAtMatch.createdAt } : {};

    const [totalUsers, usersInRange, verifiedUsers, bannedUsers, registrationsTrend] =
      await Promise.all([
        this.userModel.countDocuments(),
        this.userModel.countDocuments(createdAt),
        this.userModel.countDocuments({ isVerified: true }),
        this.userModel.countDocuments({ isBanned: true }),
        this.userModel.aggregate([
          { $match: createdAt },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              value: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

    return {
      ...range,
      totals: {
        users: totalUsers,
        usersInRange,
        verifiedUsers,
        bannedUsers,
      },
      trend: registrationsTrend.map((row) => ({ date: row._id, value: row.value })),
    };
  }

  async getMarketMetrics(from?: string, to?: string) {
    const { createdAtMatch, range } = this.resolveCreatedAtRange(from, to);
    const createdAt = createdAtMatch.createdAt ? { createdAt: createdAtMatch.createdAt } : {};

    const [
      totalMarkets,
      marketsInRange,
      activeMarkets,
      settledMarkets,
      byType,
      byStatus,
    ] = await Promise.all([
      this.marketModel.countDocuments({ isDeleted: { $ne: true } }),
      this.marketModel.countDocuments({ ...createdAt, isDeleted: { $ne: true } }),
      this.marketModel.countDocuments({ status: 'active', isDeleted: { $ne: true } }),
      this.marketModel.countDocuments({
        ...createdAt,
        status: 'settled',
        isDeleted: { $ne: true },
      }),
      this.marketModel.aggregate([
        { $match: { ...createdAt, isDeleted: { $ne: true } } },
        { $group: { _id: '$betType', value: { $sum: 1 } } },
        { $sort: { value: -1 } },
      ]),
      this.marketModel.aggregate([
        { $match: { ...createdAt, isDeleted: { $ne: true } } },
        { $group: { _id: '$status', value: { $sum: 1 } } },
        { $sort: { value: -1 } },
      ]),
    ]);

    return {
      ...range,
      totals: {
        markets: totalMarkets,
        marketsInRange,
        activeMarkets,
        settledMarkets,
      },
      byType: byType.map((row) => ({ key: row._id || 'unknown', value: row.value })),
      byStatus: byStatus.map((row) => ({ key: row._id || 'unknown', value: row.value })),
    };
  }

  private async sumTransactions(type: string, filters: Record<string, unknown> = {}) {
    const result = await this.txModel.aggregate([
      { $match: { type, ...filters } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return Number(result[0]?.total || 0);
  }

  private resolveCreatedAtRange(from?: string, to?: string) {
    const createdAt: Record<string, Date> = {};
    const fromDate = this.parseDate(from, false);
    const toDate = this.parseDate(to, true);

    if (fromDate) {
      createdAt.$gte = fromDate;
    }
    if (toDate) {
      createdAt.$lte = toDate;
    }

    return {
      createdAtMatch: Object.keys(createdAt).length > 0 ? { createdAt } : {},
      range: {
        from: fromDate ? fromDate.toISOString() : null,
        to: toDate ? toDate.toISOString() : null,
      },
    };
  }

  private parseDate(value?: string, endOfDay = false) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    if (endOfDay) {
      date.setHours(23, 59, 59, 999);
    } else {
      date.setHours(0, 0, 0, 0);
    }
    return date;
  }
}
