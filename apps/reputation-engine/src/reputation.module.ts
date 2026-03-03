import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@app/database';
import { KafkaRetryDlqService, validateEnv } from '@app/common';
import { ReputationService } from './reputation.service';
import { DecayScheduler } from './decay.scheduler';
import { ReputationConsumer } from './reputation.consumer';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
  ],
  controllers: [ReputationConsumer],
  providers: [ReputationService, DecayScheduler, KafkaRetryDlqService],
})
export class ReputationModule {}
