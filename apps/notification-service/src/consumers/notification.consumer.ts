import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KafkaRetryDlqService } from '@app/common';
import { User, UserDocument } from '@app/database';
import { EmailService } from '../channels/email.service';
import { InAppService } from '../channels/in-app.service';
import { FcmService } from '../channels/fcm.service';

@Controller()
export class NotificationConsumer {
  private readonly logger = new Logger(NotificationConsumer.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
    private readonly inAppService: InAppService,
    private readonly fcmService: FcmService,
    private readonly kafkaRetryDlqService: KafkaRetryDlqService,
  ) {}

  @EventPattern('user.created')
  async handleUserCreated(@Payload() data: any) {
    await this.processUserCreated(data, 'user.created');
  }

  @EventPattern('user.created.retry')
  async handleUserCreatedRetry(@Payload() data: any) {
    await this.processUserCreated(data, 'user.created');
  }

  @EventPattern('bet.placed')
  async handleBetPlaced(@Payload() data: any) {
    await this.processBetPlaced(data, 'bet.placed');
  }

  @EventPattern('bet.placed.retry')
  async handleBetPlacedRetry(@Payload() data: any) {
    await this.processBetPlaced(data, 'bet.placed');
  }

  @EventPattern('market.events')
  async handleMarketEvent(@Payload() data: any) {
    await this.processMarketEvent(data, 'market.events');
  }

  @EventPattern('market.events.retry')
  async handleMarketEventRetry(@Payload() data: any) {
    await this.processMarketEvent(data, 'market.events');
  }

  @EventPattern('wallet.transactions')
  async handleWalletTransaction(@Payload() data: any) {
    await this.processWalletTransaction(data, 'wallet.transactions');
  }

  @EventPattern('wallet.transactions.retry')
  async handleWalletTransactionRetry(@Payload() data: any) {
    await this.processWalletTransaction(data, 'wallet.transactions');
  }

  @EventPattern('notification.dispatch')
  async handleDispatch(@Payload() data: any) {
    await this.processDispatch(data, 'notification.dispatch');
  }

  @EventPattern('notification.dispatch.retry')
  async handleDispatchRetry(@Payload() data: any) {
    await this.processDispatch(data, 'notification.dispatch');
  }

  @EventPattern('auth.resend-otp')
  async handleResendOtp(@Payload() data: any) {
    const payload = data.payload || data;
    console.log(`[NotificationConsumer] Received auth.resend-otp for ${payload.email}`);
    await this.emailService.sendVerificationEmail(payload.email, payload.token);
  }

  private async processUserCreated(data: any, topic: string) {
    await this.withRetryDlq(topic, data, async () => {
      const payload = data.payload || data;
      this.logger.log(`Processing user.created for ${payload.userId}`);
      console.log(`[NotificationConsumer] Processing user.created for user ${payload.userId} (${payload.email})`);

      await this.emailService.sendVerificationEmail(payload.email, payload.verificationToken);

      await this.inAppService.create(
        payload.userId,
        'Welcome!',
        'Thanks for joining Ante Social. Complete your profile to earn reputation.',
        'welcome',
      );
    });
  }

  private async processBetPlaced(data: any, topic: string) {
    await this.withRetryDlq(topic, data, async () => {
      const payload = data.payload || data;
      const userId = payload.userId;
      const amount = payload.amount;

      if (!userId) {
        return;
      }

      this.logger.log(`Processing bet.placed for ${userId}`);
      await this.inAppService.create(
        userId,
        'Prediction Placed',
        `You placed a prediction of $${amount}`,
        'bet_placed',
      );
    });
  }

  private async processMarketEvent(data: any, topic: string) {
    await this.withRetryDlq(topic, data, async () => {
      const payload = data.payload || data;
      const eventType = payload.eventType || payload.type;
      this.logger.log(`Processing market event: ${eventType}`);

      if (eventType === 'MARKET_SETTLED') {
        this.logger.log(`Market ${payload.marketId} settled`);
      }
    });
  }

  private async processWalletTransaction(data: any, topic: string) {
    await this.withRetryDlq(topic, data, async () => {
      const payload = data.payload || data;
      this.logger.log(`Processing wallet transaction for ${payload.userId}`);

      if (payload.type === 'deposit' && payload.status === 'completed') {
        await this.inAppService.create(
          payload.userId,
          'Deposit Confirmed',
          `Your deposit of ${payload.currency} ${payload.amount} has been confirmed.`,
          'deposit_confirmed',
        );
      } else if (payload.type === 'withdrawal' && payload.status === 'completed') {
        await this.inAppService.create(
          payload.userId,
          'Withdrawal Processed',
          `Your withdrawal of ${payload.currency} ${payload.amount} has been processed.`,
          'withdrawal_processed',
        );
      }
    });
  }

  private async processDispatch(data: any, topic: string) {
    await this.withRetryDlq(topic, data, async () => {
      const payload = data.payload || data;
      this.logger.log(`Processing notification dispatch for ${payload.userId}`);

      const channels: string[] = payload.channels || ['in_app'];
      const user = payload.userId
        ? await this.userModel
            .findById(payload.userId)
            .select('email notificationEmail notificationPush fcmTokens')
            .lean()
            .exec()
        : null;

      if (channels.includes('in_app')) {
        await this.inAppService.create(
          payload.userId,
          payload.title,
          payload.message,
          payload.type || 'system',
        );
      }

      const recipientEmail = payload.email || user?.email;
      if (channels.includes('email') && recipientEmail && user?.notificationEmail !== false) {
        await this.emailService.sendNotificationEmail(
          recipientEmail,
          payload.title || 'Notification',
          payload.message || '',
        );
      }

      if (channels.includes('push') && user?.notificationPush !== false) {
        await this.fcmService.sendPushNotification(
          (user?.fcmTokens || []) as string[],
          payload.title,
          payload.message,
          { type: payload.type, actionUrl: payload.actionUrl || '' },
        );
      }
    });
  }

  private async withRetryDlq(topic: string, data: any, handler: () => Promise<void>) {
    try {
      await handler();
    } catch (error) {
      const routed = await this.kafkaRetryDlqService.routeFailure(topic, data, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Kafka handler failed for ${topic}. Routed to ${routed.targetTopic} (attempt ${routed.attempt}/${routed.maxRetries}). Error: ${errorMessage}`,
      );
    }
  }
}
