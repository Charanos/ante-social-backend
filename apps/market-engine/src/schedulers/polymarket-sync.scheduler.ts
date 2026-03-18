import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PolymarketService } from '../polymarket/polymarket.service';

@Injectable()
export class PolymarketSyncScheduler {
  private readonly logger = new Logger(PolymarketSyncScheduler.name);

  constructor(private readonly polymarket: PolymarketService) {}

  /**
   * Periodically pre-fetch the top Polymarket data every 3 minutes.
   * This warms up the Redis cache, ensuring that the heavy GET requests
   * from the UI are always served fast without straining the Gamma API.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncPolyData() {
    this.logger.log('Starting scheduled Polymarket sync...');
    
    try {
      await this.polymarket.syncTopMarkets();
      
      this.logger.log('Polymarket sync completed successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Polymarket sync failed: ${message}`);
    }
  }
}
