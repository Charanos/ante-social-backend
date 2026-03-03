import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WalletService } from './wallet.service';

@Injectable()
export class WalletReconciliationScheduler {
  private readonly logger = new Logger(WalletReconciliationScheduler.name);

  constructor(private readonly walletService: WalletService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcilePendingTransactions() {
    const result = await this.walletService.reconcilePendingTransactions();
    if (result.scanned > 0) {
      this.logger.log(
        `Reconciled pending wallet transactions: scanned=${result.scanned}, failed=${result.failed}`,
      );
    }
  }
}
