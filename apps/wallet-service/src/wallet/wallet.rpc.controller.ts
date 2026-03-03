import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { WalletService } from './wallet.service';

type BalanceCommandPayload = {
  userId: string;
  amount: number;
  currency?: string;
  description?: string;
  type?: string;
};

@Controller()
export class WalletRpcController {
  private readonly logger = new Logger(WalletRpcController.name);

  constructor(private readonly walletService: WalletService) {}

  @MessagePattern('debit_balance')
  async debitBalance(@Payload() payload: BalanceCommandPayload) {
    try {
      const tx = await this.walletService.debitBalance(
        payload.userId,
        Number(payload.amount),
        payload.currency || 'USD',
        payload.description || 'Wallet debit',
        payload.type || 'bet_placed',
      );
      return { success: true, data: tx };
    } catch (error: any) {
      this.logger.error(`debit_balance failed: ${error?.message || 'unknown error'}`);
      return { success: false, error: error?.message || 'Failed to debit balance' };
    }
  }

  @MessagePattern('credit_balance')
  async creditBalance(@Payload() payload: BalanceCommandPayload) {
    try {
      const tx = await this.walletService.creditBalance(
        payload.userId,
        Number(payload.amount),
        payload.currency || 'USD',
        payload.description || 'Wallet credit',
        payload.type || 'bet_payout',
      );
      return { success: true, data: tx };
    } catch (error: any) {
      this.logger.error(`credit_balance failed: ${error?.message || 'unknown error'}`);
      return { success: false, error: error?.message || 'Failed to credit balance' };
    }
  }

  @MessagePattern('approve_withdrawal')
  async approveWithdrawal(@Payload() payload: { transactionId: string }) {
    try {
      const tx = await this.walletService.approveWithdrawal(payload.transactionId);
      return { success: true, data: tx };
    } catch (error: any) {
      this.logger.error(`approve_withdrawal failed: ${error?.message || 'unknown error'}`);
      return { success: false, error: error?.message || 'Failed to approve withdrawal' };
    }
  }

  @MessagePattern('reject_withdrawal')
  async rejectWithdrawal(@Payload() payload: { transactionId: string }) {
    try {
      const tx = await this.walletService.rejectWithdrawal(payload.transactionId);
      return { success: true, data: tx };
    } catch (error: any) {
      this.logger.error(`reject_withdrawal failed: ${error?.message || 'unknown error'}`);
      return { success: false, error: error?.message || 'Failed to reject withdrawal' };
    }
  }
}
