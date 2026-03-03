import { Injectable, BadRequestException, Inject, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ClientProxy, ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { 
  Market, MarketDocument, 
  MarketBet, MarketBetDocument,
  User,
  UserDocument,
} from '@app/database';
import { DAILY_LIMITS, KAFKA_TOPICS, MarketStatus, MarketType, PlacePredictionDto, UserTier } from '@app/common';
import { BetPlacedEvent, BetEditedEvent, BetCancelledEvent } from '@app/kafka';

@Injectable()
export class PredictionService {
  constructor(
    @InjectModel(Market.name) private marketModel: Model<MarketDocument>,
    @InjectModel(MarketBet.name) private betModel: Model<MarketBetDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject('WALLET_SERVICE') private walletClient: ClientProxy,
    @Inject('KAFKA_SERVICE') private kafkaClient: ClientKafka,
  ) {}

  async placePrediction(userId: string, dto: PlacePredictionDto) {
    // 1. Validate Market
    const market = await this.marketModel.findById(dto.marketId);
    if (!market) throw new NotFoundException('Market not found');
    
    if (market.status !== MarketStatus.ACTIVE) {
      throw new BadRequestException('Market is not active');
    }
    
    if (new Date() > market.closeTime) {
      throw new BadRequestException('Market is closed');
    }

    const selectedOutcomeId = dto.outcomeId || dto.rankedOutcomeIds?.[0];
    if (!selectedOutcomeId) {
      throw new BadRequestException('Outcome selection is required');
    }

    if (market.betType === MarketType.LADDER) {
      if (!dto.rankedOutcomeIds?.length) {
        throw new BadRequestException('Ladder markets require rankedOutcomeIds');
      }

      const uniqueRanking = new Set(dto.rankedOutcomeIds);
      if (uniqueRanking.size !== dto.rankedOutcomeIds.length) {
        throw new BadRequestException('Duplicate outcomes are not allowed in ladder ranking');
      }

      const validOutcomeIds = new Set((market.outcomes || []).map((outcome) => outcome._id.toString()));
      if (dto.rankedOutcomeIds.some((outcomeId) => !validOutcomeIds.has(outcomeId))) {
        throw new BadRequestException('Ranking includes invalid market outcomes');
      }
    }

    await this.enforceDailyBetLimit(userId, dto.amount);

    const existingActiveBet = await this.betModel.findOne({
      marketId: new Types.ObjectId(dto.marketId),
      userId: new Types.ObjectId(userId),
      isCancelled: { $ne: true },
    });
    if (existingActiveBet) {
      throw new BadRequestException('You already have an active prediction in this market');
    }

    // 2. Debit Wallet (Synchronous TCP call)
    try {
      const debitResult = await lastValueFrom(
        this.walletClient.send('debit_balance', {
          userId,
          amount: dto.amount,
          currency: 'KSH',
          description: `Prediction on ${market.title}`,
          type: 'bet_placed'
        })
      );
      
      if (!debitResult.success) {
        throw new BadRequestException('Wallet debit failed');
      }
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Insufficient funds');
    }

    // 3. Create Bet
    const prediction = new this.betModel({
      marketId: new Types.ObjectId(dto.marketId),
      userId: new Types.ObjectId(userId),
      selectedOutcomeId: new Types.ObjectId(selectedOutcomeId),
      rankedOutcomeIds: (dto.rankedOutcomeIds || []).map((outcomeId) => new Types.ObjectId(outcomeId)),
      amountContributed: dto.amount,
      editableUntil: new Date(Date.now() + 5 * 60 * 1000), // 5 min 
    });

    try {
      await prediction.save();
    } catch (error: any) {
      if (error?.code === 11000) {
        await this.refundFailedPlacement(userId, dto.amount, market.title);
        throw new BadRequestException('Duplicate prediction request');
      }
      throw error;
    }

    // 4. Update Market Stats
    await this.marketModel.findByIdAndUpdate(dto.marketId, {
      $inc: { 
        totalPool: dto.amount,
        participantCount: 1,
        'outcomes.$[elem].totalAmount': dto.amount,
        'outcomes.$[elem].participantCount': 1
      }
    }, {
      arrayFilters: [{ 'elem._id': new Types.ObjectId(selectedOutcomeId) }]
    });

    // 5. Emit Event
    this.kafkaClient.emit(
      KAFKA_TOPICS.BET_PLACEMENTS,
      new BetPlacedEvent({
        betId: prediction._id.toString(),
        marketId: dto.marketId,
        userId,
        amount: dto.amount,
        outcomeId: selectedOutcomeId,
      }),
    );

    return prediction;
  }

  async getUserPredictions(userId: string, limit = 100, offset = 0) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const query = {
      userId: new Types.ObjectId(userId),
      isCancelled: { $ne: true },
    };

    const [bets, total] = await Promise.all([
      this.betModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .exec(),
      this.betModel.countDocuments(query),
    ]);

    const marketIds = Array.from(
      new Set(bets.map((bet) => bet.marketId.toString())),
    );
    const markets = await this.marketModel
      .find({ _id: { $in: marketIds.map((id) => new Types.ObjectId(id)) } })
      .exec();
    const marketById = new Map(markets.map((market) => [market._id.toString(), market]));

    const data = bets.map((bet) => this.enrichBetWithMarket(bet, marketById.get(bet.marketId.toString())));
    return { data, meta: { total, limit: safeLimit, offset: safeOffset } };
  }

  async getUserPrediction(userId: string, predictionId: string) {
    const bet = await this.betModel.findOne({
      _id: predictionId,
      userId: new Types.ObjectId(userId),
      isCancelled: { $ne: true },
    });

    if (!bet) throw new NotFoundException('Prediction not found');

    const market = await this.marketModel.findById(bet.marketId);
    return this.enrichBetWithMarket(bet, market || undefined);
  }

  // ─── Edit Prediction (5-min window) ────────────────
  async editPrediction(userId: string, predictionId: string, newOutcomeId: string) {
    const bet = await this.betModel.findById(predictionId);
    if (!bet) throw new NotFoundException('Prediction not found');
    
    if (bet.userId.toString() !== userId) {
      throw new BadRequestException('Not your prediction');
    }

    if (!bet.editableUntil || new Date() > bet.editableUntil) {
      throw new BadRequestException('Edit window has expired (5 minutes)');
    }

    const previousOptionId = bet.selectedOutcomeId.toString();
    bet.selectedOutcomeId = new Types.ObjectId(newOutcomeId);
    await bet.save();

    // Update market outcome stats (decrement old, increment new)
    const market = await this.marketModel.findById(bet.marketId);
    if (market) {
      await this.marketModel.findByIdAndUpdate(bet.marketId, {
        $inc: {
          'outcomes.$[old].totalAmount': -bet.amountContributed,
          'outcomes.$[old].participantCount': -1,
          'outcomes.$[new].totalAmount': bet.amountContributed,
          'outcomes.$[new].participantCount': 1,
        }
      }, {
        arrayFilters: [
          { 'old._id': new Types.ObjectId(previousOptionId) },
          { 'new._id': new Types.ObjectId(newOutcomeId) },
        ]
      });
    }

    this.kafkaClient.emit(KAFKA_TOPICS.BET_PLACEMENTS, new BetEditedEvent({
      betId: predictionId,
      marketId: bet.marketId.toString(),
      userId,
      previousOptionId,
      newOptionId: newOutcomeId,
      stake: bet.amountContributed,
      currency: 'KSH',
      editedAt: new Date().toISOString(),
    }));

    return bet;
  }

  // ─── Cancel Prediction (5-min window) ──────────────
  async cancelPrediction(userId: string, predictionId: string) {
    const prediction = await this.betModel.findById(predictionId);
    if (!prediction) throw new NotFoundException('Prediction not found');
    
    if (prediction.userId.toString() !== userId) {
      throw new BadRequestException('Not your prediction');
    }

    if (!prediction.editableUntil || new Date() > prediction.editableUntil) {
      throw new BadRequestException('Cancel window has expired (5 minutes)');
    }

    // Refund wallet
    try {
      await lastValueFrom(
        this.walletClient.send('credit_balance', {
          userId,
          amount: prediction.amountContributed,
          currency: 'KSH',
          description: 'Prediction cancelled - refund',
          type: 'refund',
        })
      );
    } catch (e: any) {
      throw new BadRequestException('Failed to process refund');
    }

    // Update market stats
    await this.marketModel.findByIdAndUpdate(prediction.marketId, {
      $inc: {
        totalPool: -prediction.amountContributed,
        participantCount: -1,
        'outcomes.$[elem].totalAmount': -prediction.amountContributed,
        'outcomes.$[elem].participantCount': -1,
      }
    }, {
      arrayFilters: [{ 'elem._id': prediction.selectedOutcomeId }]
    });

    // Mark prediction as cancelled
    prediction.isCancelled = true;
    await prediction.save();

    this.kafkaClient.emit(KAFKA_TOPICS.BET_PLACEMENTS, new BetCancelledEvent({
      betId: predictionId,
      marketId: prediction.marketId.toString(),
      userId,
      refundAmount: prediction.amountContributed,
      currency: 'KSH',
      cancelledAt: new Date().toISOString(),
    }));

    return { success: true, refundAmount: prediction.amountContributed };
  }

  private enrichBetWithMarket(bet: MarketBetDocument, market?: MarketDocument) {
    const betJson = bet.toObject();
    if (!market) return betJson;

    const selectedOutcome = market.outcomes.find(
      (outcome) => outcome._id.toString() === bet.selectedOutcomeId.toString(),
    );

    return {
      ...betJson,
      market,
      selectedOutcome: selectedOutcome
        ? {
            _id: selectedOutcome._id,
            optionText: selectedOutcome.optionText,
          }
        : undefined,
    };
  }

  private async enforceDailyBetLimit(userId: string, requestedAmount: number) {
    const user = await this.userModel
      .findById(userId)
      .select('tier')
      .lean()
      .exec();

    const tier = (user?.tier as UserTier | undefined) || UserTier.NOVICE;
    const dailyBetLimit = DAILY_LIMITS[tier]?.deposit || DAILY_LIMITS[UserTier.NOVICE].deposit;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const result = await this.betModel.aggregate<{ total: number }>([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          createdAt: { $gte: startOfDay },
          isCancelled: { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amountContributed' },
        },
      },
    ]);

    const usedToday = result[0]?.total || 0;
    if (usedToday + requestedAmount > dailyBetLimit) {
      throw new BadRequestException(
        `Daily bet volume limit exceeded. Used: ${usedToday}, Limit: ${dailyBetLimit}`,
      );
    }
  }

  private async refundFailedPlacement(userId: string, amount: number, marketTitle: string) {
    try {
      await lastValueFrom(
        this.walletClient.send('credit_balance', {
          userId,
          amount,
          currency: 'KSH',
          description: `Refund for duplicate placement on ${marketTitle}`,
          type: 'refund',
        }),
      );
    } catch {
      // Best-effort refund path for duplicate placement race conditions.
    }
  }
}
