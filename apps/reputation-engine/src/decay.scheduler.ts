import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReputationService } from './reputation.service';

@Injectable()
export class DecayScheduler {
  private readonly logger = new Logger(DecayScheduler.name);

  constructor(private readonly reputationService: ReputationService) {}

  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyDecay() {
    this.logger.log('Running weekly reputation decay...');
    const affected = await this.reputationService.applyWeeklyDecay();
    this.logger.log(`Weekly decay complete. ${affected} users affected.`);
  }
}
