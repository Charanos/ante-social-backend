import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, MarketBet, MarketBetDocument } from '@app/database';
import { REPUTATION_WEIGHTS, INTEGRITY_WEIGHT_RULES } from '@app/common';

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(MarketBet.name) private betModel: Model<MarketBetDocument>,
  ) {}

  /**
   * Calculate reputation score for a user.
   * Formula: R = (accuracy × 0.4) + (consistency × 0.25) + (tenure × 0.15) + (social × 0.1) + (compliance × 0.1)
   * Score range: 0 - 1000
   */
  async calculateScore(userId: string): Promise<number> {
    const user = await this.userModel.findById(userId);
    if (!user) return 0;

    const accuracy = await this.calcAccuracy(userId, user);
    const consistency = this.calcConsistency(user);
    const tenure = this.calcTenure(user);
    const social = this.calcSocial(user);
    const compliance = this.calcCompliance(user);

    const score = Math.round(
      (accuracy * REPUTATION_WEIGHTS.ACCURACY +
       consistency * REPUTATION_WEIGHTS.CONSISTENCY +
       tenure * REPUTATION_WEIGHTS.TENURE +
       social * REPUTATION_WEIGHTS.SOCIAL +
       compliance * REPUTATION_WEIGHTS.COMPLIANCE) * 1000,
    );

    // Update user
    user.reputationScore = score;
    user.signalAccuracy = accuracy * 100;
    await user.save();

    this.logger.log(`Reputation for ${userId}: ${score} (acc=${accuracy.toFixed(2)}, con=${consistency.toFixed(2)})`);
    return score;
  }

  /**
   * Calculate integrity weight (anti-Sybil).
   * Range: 0.80 - 1.00
   */
  async calculateIntegrityWeight(userId: string): Promise<number> {
    const user = await this.userModel.findById(userId);
    if (!user) return INTEGRITY_WEIGHT_RULES.NEW;

    const accountAgeDays = (Date.now() - user._id.getTimestamp().getTime()) / (1000 * 60 * 60 * 24);
    const settledBets = user.positionsWon + user.positionsLost;

    let weight: number;
    if (user.isFlagged) {
      weight = INTEGRITY_WEIGHT_RULES.FLAGGED;
    } else if (accountAgeDays >= 30 && settledBets >= 5) {
      weight = INTEGRITY_WEIGHT_RULES.ESTABLISHED;
    } else if (accountAgeDays >= 7 && settledBets >= 1) {
      weight = INTEGRITY_WEIGHT_RULES.BUILDING;
    } else if (accountAgeDays >= 7) {
      weight = INTEGRITY_WEIGHT_RULES.UNPROVEN;
    } else {
      weight = INTEGRITY_WEIGHT_RULES.NEW;
    }

    user.integrityWeight = weight;
    await user.save();
    return weight;
  }

  /**
   * Weekly decay: reduce inactive accounts' scores by 2%
   */
  async applyWeeklyDecay() {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const result = await this.userModel.updateMany(
      {
        lastActiveAt: { $lt: oneWeekAgo },
        reputationScore: { $gt: 50 }, // Don't decay below 50
      },
      { $mul: { reputationScore: 0.98 } }, // 2% decay
    );

    this.logger.log(`Weekly decay applied to ${result.modifiedCount} users`);
    return result.modifiedCount;
  }

  // ─── Sub-calculations ──────────────────────────────
  private async calcAccuracy(userId: string, user: UserDocument): Promise<number> {
    if (user.totalPositions === 0) return 0.5; // Cold start
    return user.positionsWon / Math.max(user.totalPositions, 1);
  }

  private calcConsistency(user: UserDocument): number {
    // Score based on regular participation
    return Math.min(user.activeDays / 30, 1.0);
  }

  private calcTenure(user: UserDocument): number {
    const days = (Date.now() - user._id.getTimestamp().getTime()) / (1000 * 60 * 60 * 24);
    return Math.min(days / 365, 1.0); // Max at 1 year
  }

  private calcSocial(user: UserDocument): number {
    const followScore = Math.min(user.followersCount / 50, 1.0);
    const groupScore = Math.min(user.groupMemberships / 5, 1.0);
    return (followScore + groupScore) / 2;
  }

  private calcCompliance(user: UserDocument): number {
    if (user.isFlagged) return 0;
    if (user.complianceViolations > 3) return 0.2;
    if (user.complianceViolations > 0) return 0.7;
    return 1.0;
  }
}
