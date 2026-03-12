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
      // Fetch trending markets
      const trending = await this.polymarket.getTrendingMarkets(40);
      await this.polymarket.syncToNativeMarkets(trending);
      
      // Fetch featured markets
      const featured = await this.polymarket.getFeaturedMarkets(40);
      await this.polymarket.syncToNativeMarkets(featured);

      // Fetch sports markets
      const sports = await this.polymarket.getSportsMarkets({ limit: 40 });
      await this.polymarket.syncToNativeMarkets(sports);
      
      // Fetch featured events and their markets
      const events = await this.polymarket.listEvents({ limit: 20, active: true });
      for (const event of events) {
        if (event.markets && event.markets.length > 0) {
          await this.polymarket.syncToNativeMarkets(event.markets);
        }
      }
      
      // Fetch top tags
      await this.polymarket.getTags();
      
      this.logger.log('Polymarket sync completed successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Polymarket sync failed: ${message}`);
    }
  }
}
