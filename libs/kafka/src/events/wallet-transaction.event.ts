import { BaseEvent } from './base.event';

export interface WalletTransactionPayload {
  userId: string;
  transactionId: string;
  type: string; // deposit, withdrawal, bet_placed, bet_payout, refund, platform_fee
  amount: number;
  currency: string;
  status: string;
  description: string;
  balanceAfter?: number;
}

export class WalletTransactionEvent extends BaseEvent<WalletTransactionPayload> {
  constructor(payload: WalletTransactionPayload) {
    super('WALLET_TRANSACTION', payload);
  }
}
