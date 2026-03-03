import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ActivityLogDocument = ActivityLog & Document;

export enum ActivityType {
  USER_REGISTERED = 'user_registered',
  BET_PLACED = 'bet_placed',
  BET_WON = 'bet_won',
  BET_LOST = 'bet_lost',
  DEPOSIT_COMPLETED = 'deposit_completed',
  WITHDRAWAL_COMPLETED = 'withdrawal_completed',
  GROUP_JOINED = 'group_joined',
  GROUP_LEFT = 'group_left',
  WINNER_DECLARED = 'winner_declared',
  WINNER_CONFIRMED = 'winner_confirmed',
  WINNER_DISPUTED = 'winner_disputed',
}

@Schema({ timestamps: true })
export class ActivityLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, enum: ActivityType, required: true })
  type!: ActivityType;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: Types.ObjectId, ref: 'Group' })
  groupId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Market' })
  marketId?: Types.ObjectId;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop()
  ipAddress?: string;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);
ActivityLogSchema.index({ userId: 1, createdAt: -1 });
ActivityLogSchema.index({ type: 1, createdAt: -1 });
ActivityLogSchema.index({ groupId: 1, createdAt: -1 }, { sparse: true });
