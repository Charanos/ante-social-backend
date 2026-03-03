import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DailyLimitDocument = DailyLimit & Document;

@Schema({ timestamps: true })
export class DailyLimit {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  date!: string; // YYYY-MM-DD

  @Prop({ default: 0 })
  depositUsedUsd!: number;

  @Prop({ default: 0 })
  depositUsedKsh!: number;

  @Prop({ default: 0 })
  withdrawalUsedUsd!: number;

  @Prop({ default: 0 })
  withdrawalUsedKsh!: number;

  @Prop({ default: 0 })
  betVolumeUsd!: number;

  @Prop({ default: 0 })
  betVolumeKsh!: number;
}

export const DailyLimitSchema = SchemaFactory.createForClass(DailyLimit);
DailyLimitSchema.index({ userId: 1, date: 1 }, { unique: true });
