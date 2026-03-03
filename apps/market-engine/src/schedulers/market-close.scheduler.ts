import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Market, MarketDocument } from '@app/database';
import { MarketStatus } from '@app/common';
import { MarketService } from '../market/market.service';

@Injectable()
export class MarketCloseScheduler {
  private readonly logger = new Logger(MarketCloseScheduler.name);

  constructor(
    @InjectModel(Market.name) private marketModel: Model<MarketDocument>,
    private readonly marketService: MarketService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkClosingMarkets() {
    const now = new Date();

    const marketsToClose = await this.marketModel
      .find({
        status: MarketStatus.ACTIVE,
        closeTime: { $lte: now },
      })
      .select('_id')
      .lean()
      .exec();

    if (!marketsToClose.length) {
      return;
    }

    let settledCount = 0;
    for (const market of marketsToClose) {
      try {
        await this.marketService.closeMarket(market._id.toString());
        await this.marketService.settleMarket(market._id.toString());
        settledCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Auto-settlement failed for ${market._id.toString()}: ${message}`);
      }
    }

    if (settledCount > 0) {
      this.logger.log(`Auto closed and settled ${settledCount} markets.`);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledMarkets() {
    const now = new Date();
    
    const result = await this.marketModel.updateMany(
      {
        status: MarketStatus.SCHEDULED,
        scheduledPublishTime: { $lte: now },
      },
      {
        $set: { status: MarketStatus.ACTIVE },
      }
    );

    if (result.modifiedCount > 0) {
      this.logger.log(`Published ${result.modifiedCount} scheduled markets.`);
    }
  }
}
