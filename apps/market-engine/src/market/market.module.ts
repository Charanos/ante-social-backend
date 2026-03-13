import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { CommentService } from './comment.service';
import { PredictionService } from './prediction.service';
import { PredictionController } from './prediction.controller';
import { DatabaseModule, MarketComment, MarketCommentSchema } from '@app/database';
import { KafkaModule } from '@app/kafka';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MarketCloseScheduler } from '../schedulers/market-close.scheduler';
import { SettlementDispatcher } from '../settlement/settlement.dispatcher';

@Module({
  imports: [
    DatabaseModule,
    KafkaModule,
    MongooseModule.forFeature([
      { name: MarketComment.name, schema: MarketCommentSchema },
    ]),
    ClientsModule.registerAsync([
      {
        name: 'WALLET_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('WALLET_SERVICE_HOST') || '127.0.0.1',
            port:
              config.get<number>('WALLET_RPC_PORT') ||
              config.get<number>('WALLET_SERVICE_PORT') ||
              4004,
          },
        }),
      },
    ]),
  ],
  controllers: [MarketController, PredictionController],
  providers: [
    MarketService,
    PredictionService,
    CommentService,
    MarketCloseScheduler,
    SettlementDispatcher,
  ],
})
export class MarketModule {}
