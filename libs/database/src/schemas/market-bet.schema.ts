import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MarketBetDocument = HydratedDocument<MarketBet>;

@Schema({ collection: 'market_bets', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class MarketBet {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Market' })
  marketId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  selectedOutcomeId!: Types.ObjectId;

  // ─── For Ladder markets (ranked options) ──────
  @Prop({ type: [Types.ObjectId], default: [] })
  rankedOutcomeIds!: Types.ObjectId[];

  // ─── Stakes ───────────────────────────────────
  @Prop({ required: true })
  amountContributed!: number;

  @Prop({ default: 'USD', enum: ['USD', 'KSH'] })
  currency!: string;

  @Prop({ default: 1 })
  quantity!: number;

  // ─── Settlement Details ───────────────────────
  @Prop()
  potentialPayout?: number;

  @Prop({ default: 0 })
  actualPayout!: number;

  @Prop({ default: false })
  isWinner!: boolean;

  @Prop({ default: false })
  payoutProcessed!: boolean;

  // ─── Integrity (anti-manipulation) ────────────
  @Prop({ default: 1.0 })
  integrityWeight!: number;

  @Prop({ type: Object })
  betContextSnapshot?: Record<string, any>;

  // ─── Edit Window ──────────────────────────────
  @Prop()
  editableUntil?: Date; // 5-minute window after placement

  @Prop({ default: false })
  isCancelled!: boolean;

  // ─── Reflex-specific ──────────────────────────
  @Prop()
  responseTimeMs?: number;

  // ─── User Info Cache ──────────────────────────
  @Prop()
  usernameCached?: string;

  @Prop()
  fullNameCached?: string;

  @Prop({ default: false })
  identityVerified!: boolean;

  @Prop()
  region?: string;

  // ─── Confirmation (for community settlement) ──
  @Prop()
  confirmedOutcome?: boolean;

  // ─── Audit ────────────────────────────────────
  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;
}

export const MarketBetSchema = SchemaFactory.createForClass(MarketBet);

// Indexes
MarketBetSchema.index({ marketId: 1, userId: 1 }, { unique: true });
MarketBetSchema.index({ marketId: 1, selectedOutcomeId: 1 });
MarketBetSchema.index({ userId: 1 });
MarketBetSchema.index({ isWinner: 1, payoutProcessed: 1 });
