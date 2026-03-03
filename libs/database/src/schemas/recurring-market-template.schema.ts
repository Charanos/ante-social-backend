import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RecurringMarketTemplateDocument = HydratedDocument<RecurringMarketTemplate>;

@Schema({
  collection: 'recurring_market_templates',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
})
export class RecurringMarketTemplate {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  titleTemplate!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({
    required: true,
    enum: ['consensus', 'reflex', 'ladder', 'betrayal', 'prisoner_dilemma'],
  })
  marketType!: string;

  @Prop({ type: [String], default: [] })
  options!: string[];

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ default: 'daily', enum: ['daily', 'weekly', 'monthly', 'custom'] })
  recurrence!: string;

  @Prop()
  cronExpression?: string;

  @Prop({ default: 'UTC' })
  timezone!: string;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  openTime!: string;

  @Prop({ required: true })
  closeTime!: string;

  @Prop({ required: true, min: 0 })
  buyInAmount!: number;

  @Prop({ default: 2, min: 0 })
  settlementDelayHours!: number;

  @Prop({ default: true })
  autoPublish!: boolean;

  @Prop({ default: false })
  isPaused!: boolean;

  @Prop()
  nextExecutionAt?: Date;

  @Prop()
  lastExecutedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;
}

export const RecurringMarketTemplateSchema = SchemaFactory.createForClass(RecurringMarketTemplate);

RecurringMarketTemplateSchema.index({ isPaused: 1, nextExecutionAt: 1 });
RecurringMarketTemplateSchema.index({ createdBy: 1, createdAt: -1 });
