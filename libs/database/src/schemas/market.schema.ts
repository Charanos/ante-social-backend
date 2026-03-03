import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MarketDocument = HydratedDocument<Market>;

// ─── Embedded subdocument: MarketOption ─────────────
@Schema({ _id: true })
export class MarketOption {
  // Generated automatically for embedded outcome documents.
  _id!: Types.ObjectId;

  @Prop({ required: true })
  optionText!: string;

  @Prop({ default: 0 })
  participantCount!: number;

  @Prop({ default: 0 })
  totalAmount!: number;

  @Prop()
  fixedOdds?: number;

  @Prop({ default: false })
  isWinningOutcome!: boolean;

  @Prop({ default: 0 })
  payoutPerWinner!: number;

  @Prop()
  mediaUrl?: string;

  @Prop({ default: 'none', enum: ['image', 'gif', 'video', 'none'] })
  mediaType!: string;
}

export const MarketOptionSchema = SchemaFactory.createForClass(MarketOption);

// ─── Main Market Schema ─────────────────────────────
@Schema({ collection: 'public_markets', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Market {
  // ─── Basic Info ────────────────────────────────
  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop()
  category?: string;

  // ─── Betting Configuration ────────────────────
  @Prop({ required: true, enum: ['consensus', 'reflex', 'ladder', 'prisoner_dilemma', 'betrayal'] })
  betType!: string;

  @Prop({ default: 'daily', enum: ['daily', 'weekly'] })
  marketDuration!: string;

  @Prop({ required: true })
  buyInAmount!: number;

  @Prop({ default: 2 })
  minParticipants!: number;

  @Prop()
  maxParticipants?: number;

  // ─── Timing ───────────────────────────────────
  @Prop()
  startTime?: Date;

  @Prop({ required: true })
  closeTime!: Date;

  @Prop({ required: true })
  settlementTime!: Date;

  @Prop()
  scheduledPublishTime?: Date;

  // ─── Status ───────────────────────────────────
  @Prop({
    default: 'draft',
    enum: ['draft', 'scheduled', 'published', 'active', 'closed', 'settling', 'settled', 'cancelled'],
  })
  status!: string;

  // ─── Settlement ───────────────────────────────
  @Prop({ default: 'admin_report', enum: ['external_api', 'admin_report'] })
  settlementMethod!: string;

  @Prop()
  externalApiEndpoint?: string;

  // ─── Odds ─────────────────────────────────────
  @Prop({ default: 'pari_mutuel', enum: ['fixed', 'pari_mutuel'] })
  oddsType!: string;

  // ─── Outcomes (embedded) ──────────────────────
  @Prop({ type: [MarketOptionSchema], default: [] })
  outcomes!: MarketOption[];

  // ─── Geographic Restrictions ──────────────────
  @Prop({ type: [String], default: [] })
  regionsAllowed!: string[];

  @Prop({ type: [String], default: [] })
  regionsBlocked!: string[];

  @Prop({ default: 18 })
  ageRestriction!: number;

  @Prop({ default: false })
  requiresIdentityCheck!: boolean;

  // ─── Market Stats ─────────────────────────────
  @Prop({ default: 0 })
  totalPool!: number;

  @Prop({ default: 0 })
  participantCount!: number;

  @Prop({ type: Types.ObjectId })
  winningOutcomeId?: Types.ObjectId;

  // ─── Admin Settlement ─────────────────────────
  @Prop()
  adminReport?: string;

  @Prop()
  reportedAt?: Date;

  @Prop({ type: Types.ObjectId })
  reportedBy?: Types.ObjectId;

  @Prop({ default: 0 })
  confirmationsNeeded!: number;

  @Prop({ default: 0 })
  confirmationsReceived!: number;

  // ─── Compliance & Flags ───────────────────────
  @Prop({ default: false })
  isFlagged!: boolean;

  @Prop({ default: false })
  complianceHold!: boolean;

  @Prop()
  holdReason?: string;

  // ─── Financial ────────────────────────────────
  @Prop({ default: false })
  payoutProcessed!: boolean;

  @Prop()
  platformFeeCollected?: number;

  @Prop()
  prizePoolAfterFees?: number;

  // ─── Media ────────────────────────────────────
  @Prop()
  mediaUrl?: string;

  @Prop({ default: 'none', enum: ['image', 'gif', 'video', 'none'] })
  mediaType!: string;

  // ─── Metadata ─────────────────────────────────
  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  lastEditedBy?: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], default: [] })
  assignedMarketMakers!: Types.ObjectId[];

  @Prop({ type: Types.ObjectId })
  recurringTemplateId?: Types.ObjectId;

  // ─── Soft Delete ──────────────────────────────
  @Prop({ default: false })
  isDeleted!: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

  // ─── Optimistic Locking ───────────────────────
  @Prop({ default: 1 })
  version!: number;
}

export const MarketSchema = SchemaFactory.createForClass(Market);

// Indexes
MarketSchema.index({ status: 1, closeTime: 1 });
MarketSchema.index({ betType: 1 });
MarketSchema.index({ category: 1, closeTime: 1 });
MarketSchema.index({ createdBy: 1 });
MarketSchema.index({ tags: 1 });
MarketSchema.index({ isDeleted: 1, status: 1 });
