import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ClientProxy, ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { MarketDocument, MarketBet, MarketBetDocument, User, UserDocument } from '@app/database';
import { MarketType, MarketStatus, PLATFORM_FEE_RATE, REFLEX_MULTIPLIER_TIERS, KAFKA_TOPICS } from '@app/common';
import { MarketSettledEvent } from '@app/kafka';
import {
  calculateIntegrityWeightedPayouts,
  calculateProportionalPayouts,
  isExactLadderSequence,
} from './settlement.math';

@Injectable()
export class SettlementDispatcher {
  private readonly logger = new Logger(SettlementDispatcher.name);

  constructor(
    @InjectModel(MarketBet.name) private betModel: Model<MarketBetDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject('WALLET_SERVICE') private walletClient: ClientProxy,
    @Inject('KAFKA_SERVICE') private kafkaClient: ClientKafka,
  ) {}

  async dispatch(market: MarketDocument) {
    this.logger.log(`Dispatching settlement for market ${market._id} (${market.betType})`);
    
    switch (market.betType) {
      case MarketType.CONSENSUS:
        return this.handleConsensus(market);
      case MarketType.REFLEX:
        return this.handleReflex(market);
      case MarketType.LADDER:
        return this.handleLadder(market);
      case MarketType.PRISONER_DILEMMA:
        return this.handlePrisonerDilemma(market);
      case MarketType.BETRAYAL:
        return this.handleBetrayal(market);
      default:
        this.logger.warn(`No handler for market type ${market.betType}`);
    }
  }

  // ─── Consensus ("The Crowd's Call") ─────────────────
  private async handleConsensus(market: MarketDocument) {
    const bets = await this.betModel.find({ marketId: market._id }).exec();
    if (bets.length === 0) return;

    const winningOutcomeId = market.winningOutcomeId;
    if (!winningOutcomeId) {
      this.logger.warn(`No winning outcome set for Consensus market ${market._id}`);
      return;
    }

    const totalPool = bets.reduce((sum, b) => sum + b.amountContributed, 0);
    const platformFee = totalPool * PLATFORM_FEE_RATE;
    const prizePool = totalPool - platformFee;

    const winners = bets.filter(b => b.selectedOutcomeId.toString() === winningOutcomeId.toString());
    const losers = bets.filter(b => b.selectedOutcomeId.toString() !== winningOutcomeId.toString());
    const integrityMap = await this.getIntegrityMap(winners.map((winner) => winner.userId.toString()));
    const payouts = calculateIntegrityWeightedPayouts(
      winners.map((winner) => ({
        id: winner.userId.toString(),
        stake: winner.amountContributed,
        integrityWeight: integrityMap.get(winner.userId.toString()) ?? winner.integrityWeight ?? 1,
      })),
      prizePool,
    );

    for (const winner of winners) {
      const share = payouts.get(winner.userId.toString()) ?? 0;
      winner.actualPayout = share;
      winner.isWinner = true;
      winner.payoutProcessed = true;
      await winner.save();
      await this.creditWinner(winner.userId.toString(), share, market.title);
    }

    for (const loser of losers) {
      loser.actualPayout = 0;
      loser.isWinner = false;
      loser.payoutProcessed = true;
      await loser.save();
    }

    this.emitSettledEvent(market, prizePool, platformFee, winners.length);
  }

  // ─── Reflex ("Against The Grain") ───────────────────
  private async handleReflex(market: MarketDocument) {
    const bets = await this.betModel.find({ marketId: market._id }).exec();
    if (bets.length === 0) return;

    const totalPool = bets.reduce((sum, b) => sum + b.amountContributed, 0);
    const platformFee = totalPool * PLATFORM_FEE_RATE;
    const prizePool = totalPool - platformFee;

    const outcomeGroups: Record<string, typeof bets> = {};
    for (const bet of bets) {
      const key = bet.selectedOutcomeId.toString();
      if (!outcomeGroups[key]) outcomeGroups[key] = [];
      outcomeGroups[key].push(bet);
    }

    const groups = Object.entries(outcomeGroups).sort((a, b) => a[1].length - b[1].length);
    const minorityKey = groups[0][0];
    const minorityBets = groups[0][1];
    const minorityPct = (minorityBets.length / bets.length) * 100;

    const tier = REFLEX_MULTIPLIER_TIERS.find(t => minorityPct <= t.maxPct);
    const multiplier = tier?.multiplier || 1.0;

    for (const winner of minorityBets) {
      const payout = winner.amountContributed * multiplier;
      winner.actualPayout = payout;
      winner.isWinner = true;
      winner.payoutProcessed = true;
      await winner.save();
      await this.creditWinner(winner.userId.toString(), payout, market.title);
    }

    const majorityBets = bets.filter(b => b.selectedOutcomeId.toString() !== minorityKey);
    for (const loser of majorityBets) {
      loser.actualPayout = 0;
      loser.isWinner = false;
      loser.payoutProcessed = true;
      await loser.save();
    }

    this.emitSettledEvent(market, prizePool, platformFee, minorityBets.length);
  }

  // ─── Ladder ("Conviction Climb") ────────────────────
  private async handleLadder(market: MarketDocument) {
    const bets = await this.betModel.find({ marketId: market._id }).exec();
    if (bets.length === 0) return;

    const totalPool = bets.reduce((sum, b) => sum + b.amountContributed, 0);
    const platformFee = totalPool * PLATFORM_FEE_RATE;
    const prizePool = totalPool - platformFee;

    const canonicalRanking = (market.outcomes || []).map((outcome) => outcome._id.toString());
    const winners = bets.filter((bet) =>
      isExactLadderSequence(
        (bet.rankedOutcomeIds || []).map((outcomeId) => outcomeId.toString()),
        canonicalRanking,
      ),
    );

    const losers = bets.filter((bet) => !winners.some((winner) => winner._id.equals(bet._id)));
    const payouts = calculateProportionalPayouts(
      winners.map((winner) => ({
        id: winner.userId.toString(),
        stake: winner.amountContributed,
      })),
      prizePool,
    );

    for (const winner of winners) {
      const payout = payouts.get(winner.userId.toString()) ?? 0;
      winner.actualPayout = payout;
      winner.isWinner = true;
      winner.payoutProcessed = true;
      await winner.save();
      await this.creditWinner(winner.userId.toString(), payout, market.title);
    }

    for (const loser of losers) {
      loser.actualPayout = 0;
      loser.isWinner = false;
      loser.payoutProcessed = true;
      await loser.save();
    }

    this.emitSettledEvent(market, prizePool, platformFee, winners.length);
  }

  // ─── Betrayal ("Trust vs Betray") ──────────────────
  private async handleBetrayal(market: MarketDocument) {
    const bets = await this.betModel.find({ marketId: market._id }).exec();
    if (bets.length === 0) return;

    const totalPool = bets.reduce((sum, b) => sum + b.amountContributed, 0);
    const platformFee = totalPool * PLATFORM_FEE_RATE;
    const prizePool = totalPool - platformFee;

    const betrayalOutcomeId =
      market.winningOutcomeId?.toString() ||
      market.outcomes.find((outcome) => outcome.optionText.toLowerCase().includes('betray'))?._id?.toString();

    if (!betrayalOutcomeId) {
      this.logger.warn(`No betrayal outcome resolved for market ${market._id.toString()}`);
      return;
    }

    const winners = bets.filter((bet) => bet.selectedOutcomeId.toString() === betrayalOutcomeId);
    const losers = bets.filter((bet) => bet.selectedOutcomeId.toString() !== betrayalOutcomeId);
    const payouts = calculateProportionalPayouts(
      winners.map((winner) => ({
        id: winner.userId.toString(),
        stake: winner.amountContributed,
      })),
      prizePool,
    );

    for (const winner of winners) {
      const payout = payouts.get(winner.userId.toString()) ?? 0;
      winner.actualPayout = payout;
      winner.isWinner = true;
      winner.payoutProcessed = true;
      await winner.save();
      await this.creditWinner(winner.userId.toString(), payout, market.title);
    }

    for (const loser of losers) {
      loser.actualPayout = 0;
      loser.isWinner = false;
      loser.payoutProcessed = true;
      await loser.save();
    }

    this.emitSettledEvent(market, prizePool, platformFee, winners.length);
  }

  // ─── Prisoner's Dilemma ("Trust or Betray") ────────
  private async handlePrisonerDilemma(market: MarketDocument) {
    const bets = await this.betModel.find({ marketId: market._id }).exec();
    if (bets.length === 0) return;

    const totalPool = bets.reduce((sum, b) => sum + b.amountContributed, 0);
    const platformFee = totalPool * PLATFORM_FEE_RATE;
    const prizePool = totalPool - platformFee;

    const outcomes = market.outcomes || [];
    const cooperateId = (outcomes[0] as any)?._id?.toString();
    const defectId = (outcomes[1] as any)?._id?.toString();

    const cooperators = bets.filter(b => b.selectedOutcomeId.toString() === cooperateId);
    const defectors = bets.filter(b => b.selectedOutcomeId.toString() === defectId);

    if (defectors.length === 0) {
      const bonus = prizePool / cooperators.length;
      for (const coop of cooperators) {
        coop.actualPayout = coop.amountContributed + bonus * 0.1;
        coop.isWinner = true;
        coop.payoutProcessed = true;
        await coop.save();
        await this.creditWinner(coop.userId.toString(), coop.actualPayout, market.title);
      }
    } else if (cooperators.length === 0) {
      const returnRate = 0.7;
      for (const def of defectors) {
        const payout = def.amountContributed * returnRate;
        def.actualPayout = payout;
        def.isWinner = false;
        def.payoutProcessed = true;
        await def.save();
        await this.creditWinner(def.userId.toString(), payout, market.title);
      }
    } else {
      const defectorPayout = prizePool * 0.7 / defectors.length;
      const cooperatorPayout = prizePool * 0.3 / cooperators.length;

      for (const def of defectors) {
        def.actualPayout = defectorPayout;
        def.isWinner = true;
        def.payoutProcessed = true;
        await def.save();
        await this.creditWinner(def.userId.toString(), defectorPayout, market.title);
      }

      for (const coop of cooperators) {
        coop.actualPayout = cooperatorPayout;
        coop.isWinner = cooperatorPayout > coop.amountContributed;
        coop.payoutProcessed = true;
        await coop.save();
        await this.creditWinner(coop.userId.toString(), cooperatorPayout, market.title);
      }
    }

    this.emitSettledEvent(market, prizePool, platformFee, bets.length);
  }

  // ─── Helpers ────────────────────────────────────────
  private async creditWinner(userId: string, amount: number, marketTitle: string) {
    try {
      await lastValueFrom(
        this.walletClient.send('credit_balance', {
          userId,
          amount,
          currency: 'KSH',
          description: `Payout from: ${marketTitle}`,
          type: 'bet_payout',
        })
      );
    } catch (e: any) {
      this.logger.error(`Failed to credit winner ${userId}: ${e.message}`);
    }
  }

  private emitSettledEvent(market: MarketDocument, prizePool: number, platformFee: number, winnerCount: number) {
    this.kafkaClient.emit(KAFKA_TOPICS.MARKET_EVENTS, new MarketSettledEvent({
      marketId: market._id.toString(),
      type: market.betType,
      winningOptionId: market.winningOutcomeId?.toString(),
      totalPool: market.totalPool || 0,
      platformFee,
      prizePool,
      winnerCount,
      settledAt: new Date().toISOString(),
    }));
  }

  private async getIntegrityMap(userIds: string[]) {
    const uniqueIds = Array.from(new Set(userIds)).filter((id) => Types.ObjectId.isValid(id));
    if (!uniqueIds.length) {
      return new Map<string, number>();
    }

    const users = await this.userModel
      .find({
        _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) },
      })
      .select('_id integrityWeight')
      .lean()
      .exec();

    return new Map(users.map((user) => [user._id.toString(), user.integrityWeight ?? 1]));
  }
}
