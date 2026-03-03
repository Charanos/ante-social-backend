import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ExchangeRateDocument = ExchangeRate & Document;

@Schema({ timestamps: true })
export class ExchangeRate {
  @Prop({ required: true, enum: ['USD'], default: 'USD' })
  baseCurrency!: string;

  @Prop({ required: true, enum: ['KSH'], default: 'KSH' })
  targetCurrency!: string;

  @Prop({ required: true })
  rate!: number;

  @Prop({ required: true })
  source!: string; // e.g. 'exchangerate-api.com'

  @Prop()
  fetchedAt!: Date;
}

export const ExchangeRateSchema = SchemaFactory.createForClass(ExchangeRate);
ExchangeRateSchema.index({ baseCurrency: 1, targetCurrency: 1 }, { unique: true });
ExchangeRateSchema.index({ updatedAt: -1 });
