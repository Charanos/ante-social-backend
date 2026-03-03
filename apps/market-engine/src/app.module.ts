import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@app/database';
import { ScheduleModule } from '@nestjs/schedule'; // For cron jobs
import { MarketModule } from './market/market.module';
import { GroupModule } from './group/group.module';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard, validateEnv } from '@app/common';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    MarketModule,
    GroupModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule {}
