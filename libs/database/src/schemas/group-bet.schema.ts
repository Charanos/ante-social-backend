import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GroupBetDocument = HydratedDocument<GroupBet>;

@Schema({ _id: true })
export class GroupBetParticipant {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop()
  selectedOption?: string;

  @Prop({ default: false })
  hasConfirmed!: boolean;

  @Prop({ default: false })
  hasDisagreed!: boolean;

  @Prop({ default: false })
  isWinner!: boolean;

  @Prop({ default: 0 })
  payoutAmount!: number;

  @Prop({ type: Date, default: Date.now })
  joinedAt!: Date;
}

export const GroupBetParticipantSchema = SchemaFactory.createForClass(GroupBetParticipant);

@Schema({ collection: 'group_bets', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class GroupBet {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Group' })
  groupId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop()
  description?: string;

  @Prop({ required: true, enum: ['winner_takes_all', 'odd_one_out'] })
  marketType!: string;

  @Prop({ required: true })
  buyInAmount!: number;

  @Prop({
    default: 'active',
    enum: ['active', 'pending_confirmation', 'disputed', 'settled', 'cancelled'],
  })
  status!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy!: Types.ObjectId;

  // ─── Winner Takes All ─────────────────────────
  @Prop({ type: Types.ObjectId })
  declaredWinnerId?: Types.ObjectId;

  @Prop({ default: 0 })
  confirmations!: number;

  @Prop({ default: 0 })
  disagreements!: number;

  @Prop()
  confirmationDeadline?: Date;

  // ─── Financials ───────────────────────────────
  @Prop({ default: 0 })
  totalPool!: number;

  @Prop()
  platformFeeCollected?: number;

  @Prop()
  prizePoolAfterFees?: number;

  @Prop({ default: false })
  payoutProcessed!: boolean;

  // ─── Participants ─────────────────────────────
  @Prop({ type: [GroupBetParticipantSchema], default: [] })
  participants!: GroupBetParticipant[];

  // ─── Options (for odd_one_out) ────────────────
  @Prop({ type: [String], default: [] })
  options!: string[];
}

export const GroupBetSchema = SchemaFactory.createForClass(GroupBet);

GroupBetSchema.index({ groupId: 1, status: 1 });
GroupBetSchema.index({ createdBy: 1 });
