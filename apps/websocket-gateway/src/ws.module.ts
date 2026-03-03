import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WsGateway } from './ws.gateway';
import { WsBroadcastConsumer } from './consumers/ws-broadcast.consumer';
import { JwtModule } from '@nestjs/jwt';
import { WsAuthGuard } from './ws.auth.guard';
import { KafkaRetryDlqService, validateEnv } from '@app/common';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    JwtModule.register({}),
  ],
  providers: [WsGateway, WsAuthGuard, KafkaRetryDlqService],
  controllers: [WsBroadcastConsumer],
})
export class WsModule {}
