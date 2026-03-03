import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type TransactionDocument = HydratedDocument<Transaction>;

@Schema({ collection: 'transactions', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Transaction {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Wallet' })
  walletId!: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['deposit', 'withdrawal', 'bet_placed', 'bet_payout', 'refund', 'platform_fee'],
  })
  type!: string;

  @Prop({ required: true })
  amount!: number;

  @Prop({ default: 'USD', enum: ['USD', 'KSH'] })
  currency!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ default: 'pending', enum: ['pending', 'processing', 'completed', 'failed'] })
  status!: string;

  // ─── References ───────────────────────────────
  @Prop({ type: Types.ObjectId })
  marketId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  groupId?: Types.ObjectId;

  // ─── Payment Provider ─────────────────────────
  @Prop()
  paymentProvider?: string; // 'mpesa', 'nowpayments', 'internal'

  @Prop({ type: String })
  externalTransactionId?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  paymentMetadata?: Record<string, any>;

  // ─── Exchange Rate ────────────────────────────
  @Prop()
  exchangeRate?: number; // USD/KSH rate at time of transaction

  @Prop()
  amountInSettlementCurrency?: number; // Normalized to USD

  // ─── Audit ────────────────────────────────────
  @Prop()
  ipAddress?: string;

  @Prop({ type: Types.ObjectId })
  processedBy?: Types.ObjectId; // Admin who approved (for withdrawals)
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// Indexes
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ userId: 1, type: 1, status: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, status: 1 });
TransactionSchema.index({ marketId: 1 });
TransactionSchema.index({ externalTransactionId: 1 }, { sparse: true });
TransactionSchema.index({ status: 1, createdAt: -1 });
