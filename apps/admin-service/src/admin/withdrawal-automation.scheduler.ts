import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AdminService } from './admin.service';

@Injectable()
export class WithdrawalAutomationScheduler {
  private readonly logger = new Logger(WithdrawalAutomationScheduler.name);
  private readonly systemActorId = '000000000000000000000000';
  private isRunning = false;

  constructor(
    private readonly adminService: AdminService,
    private readonly configService: ConfigService,
  ) {}

  @Interval(60_000)
  async runAutoProcessTick() {
    if (!this.getBoolean('WITHDRAWAL_AUTO_PROCESS_ENABLED', true)) {
      return;
    }

    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    try {
      const result = await this.adminService.autoProcessWithdrawals(this.systemActorId, {
        limit: this.getNumber('WITHDRAWAL_AUTO_PROCESS_LIMIT', 50),
        autoApproveAmount: this.getNumber('WITHDRAWAL_AUTO_APPROVE_AMOUNT', 1000),
        requireVerifiedForApproval: this.getBoolean(
          'WITHDRAWAL_REQUIRE_VERIFIED_FOR_APPROVAL',
          true,
        ),
        rejectFlagged: this.getBoolean('WITHDRAWAL_REJECT_FLAGGED', true),
        rejectBanned: this.getBoolean('WITHDRAWAL_REJECT_BANNED', true),
        rejectUnverified: this.getBoolean('WITHDRAWAL_REJECT_UNVERIFIED', false),
      });

      const summary = result?.summary || {};
      const totalScanned = Number(summary.totalScanned || 0);
      const approved = Number(summary.approved || 0);
      const rejected = Number(summary.rejected || 0);
      const skipped = Number(summary.skipped || 0);

      if (totalScanned > 0) {
        this.logger.log(
          `Auto-processed withdrawals: scanned=${totalScanned}, approved=${approved}, rejected=${rejected}, skipped=${skipped}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Withdrawal auto-process failed: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
    } finally {
      this.isRunning = false;
    }
  }

  private getBoolean(key: string, fallback: boolean) {
    const value = String(this.configService.get(key) ?? '')
      .trim()
      .toLowerCase();
    if (!value) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value);
  }

  private getNumber(key: string, fallback: number) {
    const value = Number(this.configService.get(key));
    return Number.isFinite(value) ? value : fallback;
  }
}
