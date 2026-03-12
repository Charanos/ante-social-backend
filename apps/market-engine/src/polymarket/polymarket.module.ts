import { Module } from '@nestjs/common';
import { PolymarketModule } from '@app/polymarket';
import { PolymarketController } from './polymarket.controller';
import { PolymarketService } from './polymarket.service';
import { PolymarketSyncScheduler } from '../schedulers/polymarket-sync.scheduler';

@Module({
  imports: [
    PolymarketModule.registerAsync(),
  ],
  controllers: [PolymarketController],
  providers: [PolymarketService, PolymarketSyncScheduler],
  exports: [PolymarketService],
})
export class PolymarketEngineModule {}
