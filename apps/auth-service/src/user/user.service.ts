import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, ActivityLog, ActivityLogDocument } from '@app/database';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ActivityLog.name) private activityLogModel: Model<ActivityLogDocument>,
  ) {}

  async getProfile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select(
        '-passwordHash -twoFactorSecret -backupCodes -emailVerificationToken -passwordResetToken -passwordResetExpires -refreshTokenHash -refreshTokenExpiresAt',
      );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, updates: Partial<{
    email: string;
    username: string;
    fullName: string;
    phone: string;
    location: string;
    bio: string;
    avatarUrl: string;
    timezone: string;
    language: string;
    preferredCurrency: string;
    notificationEmail: boolean;
    notificationPush: boolean;
  }>) {
    // Whitelist allowed fields
    const allowed: Record<string, any> = {};
    const allowedFields = [
      'email',
      'username',
      'fullName',
      'phone',
      'location',
      'bio',
      'avatarUrl',
      'preferredCurrency',
      'timezone',
      'language',
      'notificationEmail',
      'notificationPush',
    ];
    for (const key of allowedFields) {
      if (updates[key as keyof typeof updates] !== undefined) {
        allowed[key] = updates[key as keyof typeof updates];
      }
    }

    if (typeof allowed.email === 'string') {
      const normalizedEmail = allowed.email.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes('@')) {
        throw new BadRequestException('Invalid email address');
      }
      const existing = await this.userModel.findOne({
        email: normalizedEmail,
        _id: { $ne: new Types.ObjectId(userId) },
      });
      if (existing) throw new ConflictException('Email already in use');
      allowed.email = normalizedEmail;
    }

    if (typeof allowed.username === 'string') {
      const normalizedUsername = allowed.username.trim();
      if (!normalizedUsername) throw new BadRequestException('Username is required');
      const existing = await this.userModel.findOne({
        username: normalizedUsername,
        _id: { $ne: new Types.ObjectId(userId) },
      });
      if (existing) throw new ConflictException('Username already in use');
      allowed.username = normalizedUsername;
    }

    for (const field of ['fullName', 'phone', 'location', 'bio', 'avatarUrl', 'timezone', 'language', 'preferredCurrency']) {
      if (typeof allowed[field] === 'string') {
        allowed[field] = allowed[field].trim();
      }
    }

    const user = await this.userModel
      .findByIdAndUpdate(userId, allowed, { new: true })
      .select(
        '-passwordHash -twoFactorSecret -backupCodes -emailVerificationToken -passwordResetToken -passwordResetExpires -refreshTokenHash -refreshTokenExpiresAt',
      );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getPublicProfile(userId: string) {
    const user = await this.findPublicUser(userId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getPublicAchievements(username: string) {
    const user = await this.findPublicUser(username);
    if (!user) throw new NotFoundException('User not found');

    const totalPositions = Number(user.totalPositions || 0);
    const wins = Number(user.positionsWon || 0);
    const losses = Number(user.positionsLost || 0);
    const tierBoost = String(user.tier || '').toLowerCase() === 'high_roller' ? 2 : 0;
    const unlockedCount = Math.max(1, Math.min(6, Math.floor(totalPositions / 5) + 1 + tierBoost));

    const catalog = [
      { key: 'first_win', title: 'First Win', category: 'beginner', reward: 100, icon: 'trophy' },
      { key: 'activity_streak', title: 'Activity Streak', category: 'time_based', reward: 150, icon: 'clock' },
      { key: 'accuracy_master', title: 'Accuracy Master', category: 'performance', reward: 220, icon: 'zap' },
      { key: 'high_roller', title: 'High Roller', category: 'prestige', reward: 500, icon: 'crown' },
      { key: 'win_rate_boost', title: 'Win Rate Boost', category: 'performance', reward: 280, icon: 'flame' },
      { key: 'volume_trader', title: 'Volume Trader', category: 'spending', reward: 320, icon: 'coins' },
    ];

    const now = Date.now();
    const achievements = catalog.slice(0, unlockedCount).map((item, index) => ({
      id: item.key,
      title: item.title,
      category: item.category,
      reward: item.reward,
      icon: item.icon,
      unlocked: true,
      unlockedAt: new Date(now - index * 7 * 24 * 60 * 60 * 1000).toISOString(),
      progress:
        item.key === 'first_win'
          ? Math.min(1, wins)
          : item.key === 'accuracy_master'
            ? Number((Math.max(0, Math.min(100, totalPositions > 0 ? (wins / totalPositions) * 100 : 0)) / 100).toFixed(2))
            : item.key === 'volume_trader'
              ? Number((Math.min(1, totalPositions / 25)).toFixed(2))
              : 1,
    }));

    const totals = {
      totalPositions,
      wins,
      losses,
      totalUnlocked: achievements.length,
    };

    return { data: achievements, totals };
  }

  async getPublicStats(username: string) {
    const user = await this.findPublicUser(username);
    if (!user) throw new NotFoundException('User not found');

    const totalPositions = Number(user.totalPositions || 0);
    const wins = Number(user.positionsWon || 0);
    const losses = Number(user.positionsLost || 0);
    const winRate = totalPositions > 0 ? Number(((wins / totalPositions) * 100).toFixed(2)) : 0;
    const signalAccuracy = Number(user.signalAccuracy || winRate);
    const reputationScore = Number(user.reputationScore || 0);

    return {
      totalPositions,
      wins,
      losses,
      winRate,
      signalAccuracy,
      reputationScore,
      activeDays: Number(user.activeDays || 0),
      followersCount: Number(user.followersCount || 0),
      followingCount: Number(user.followingCount || 0),
      groupMemberships: Number(user.groupMemberships || 0),
      joinedAt: user.createdAt,
      tier: user.tier,
      isVerified: Boolean(user.isVerified),
    };
  }

  async deleteProfile(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const suffix = user._id.toString().slice(-8);
    user.email = `deleted+${suffix}@deleted.local`;
    user.username = `deleted_${suffix}`;
    user.fullName = undefined;
    user.phone = undefined;
    user.location = undefined;
    user.bio = undefined;
    user.avatarUrl = undefined;
    user.notificationEmail = false;
    user.notificationPush = false;
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.backupCodes = [];
    user.refreshTokenHash = undefined;
    user.refreshTokenExpiresAt = undefined;
    user.emailVerified = false;
    user.isBanned = true;
    user.banReason = 'Self-deleted account';
    user.isFlagged = false;

    await user.save();
    return { success: true };
  }

  async getActivity(userId: string, limit = 20, offset = 0) {
    const activities = await this.activityLogModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .exec();

    const total = await this.activityLogModel.countDocuments({ userId: new Types.ObjectId(userId) });
    return { data: activities, meta: { total, limit, offset } };
  }

  private findPublicUser(identifier: string) {
    const baseSelect =
      'username fullName bio avatarUrl tier role reputationScore signalAccuracy totalPositions positionsWon positionsLost activeDays followersCount followingCount groupMemberships isVerified createdAt';

    if (Types.ObjectId.isValid(identifier)) {
      return this.userModel.findById(identifier).select(baseSelect).exec();
    }

    return this.userModel
      .findOne({ username: String(identifier || '').trim() })
      .select(baseSelect)
      .exec();
  }
}
