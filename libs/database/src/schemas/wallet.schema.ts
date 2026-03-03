import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WalletDocument = HydratedDocument<Wallet>;

@Schema({ collection: 'wallets', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Wallet {
  @Prop({ required: true, unique: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  // ─── Balances ─────────────────────────────────
  @Prop({ default: 0 })
  balanceUsd!: number;

  @Prop({ default: 0 })
  balanceKsh!: number;

  @Prop({ default: 0 })
  pendingUsd!: number;

  @Prop({ default: 0 })
  pendingKsh!: number;

  // ─── Lifetime Stats ───────────────────────────
  @Prop({ default: 0 })
  totalDeposits!: number;

  @Prop({ default: 0 })
  totalWithdrawals!: number;

  @Prop({ default: 0 })
  totalWinnings!: number;

  @Prop({ default: 0 })
  totalLosses!: number;

  @Prop({ default: 0 })
  totalVolume!: number;

  @Prop({ default: 0 })
  totalPnl!: number;

  // ─── Daily Limits (rolling 24h) ───────────────
  @Prop({ default: 0 })
  dailyDepositTotal!: number;

  @Prop({ default: 0 })
  dailyWithdrawalTotal!: number;

  @Prop({ type: Date, default: Date.now })
  lastResetDate!: Date;

  // ─── Safety ───────────────────────────────────
  @Prop({ default: 1 })
  version!: number; // Optimistic locking

  @Prop({ default: false })
  isFrozen!: boolean;

  @Prop()
  frozenReason?: string;

  @Prop()
  frozenAt?: Date;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
