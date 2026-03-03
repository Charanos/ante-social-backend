import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@app/database';
import { NotificationConsumer } from './consumers/notification.consumer';
import { NotificationController } from './notification.controller';
import { EmailService } from './channels/email.service';
import { InAppService } from './channels/in-app.service';
import { FcmService } from './channels/fcm.service';
import { APP_GUARD } from '@nestjs/core';
import { KafkaRetryDlqService, RateLimitGuard, validateEnv } from '@app/common';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
  ],
  controllers: [NotificationConsumer, NotificationController],
  providers: [
    EmailService,
    InAppService,
    FcmService,
    KafkaRetryDlqService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class NotificationModule {}
