import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { KafkaRetryDlqService } from '@app/common';
import { WsGateway } from '../ws.gateway';

@Controller()
export class WsBroadcastConsumer {
  private readonly logger = new Logger(WsBroadcastConsumer.name);

  constructor(
    private readonly wsGateway: WsGateway,
    private readonly kafkaRetryDlqService: KafkaRetryDlqService,
  ) {}

  @EventPattern('market.events')
  async handleMarketEvent(@Payload() data: any) {
    await this.processMarketEvent(data, 'market.events');
  }

  @EventPattern('market.events.retry')
  async handleMarketEventRetry(@Payload() data: any) {
    await this.processMarketEvent(data, 'market.events');
  }

  @EventPattern('bet.placements')
  async handleBetPlacement(@Payload() data: any) {
    await this.processBetPlacement(data, 'bet.placements');
  }

  @EventPattern('bet.placements.retry')
  async handleBetPlacementRetry(@Payload() data: any) {
    await this.processBetPlacement(data, 'bet.placements');
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
  async handleNotification(@Payload() data: any) {
    await this.processNotificationDispatch(data, 'notification.dispatch');
  }

  @EventPattern('notification.dispatch.retry')
  async handleNotificationRetry(@Payload() data: any) {
    await this.processNotificationDispatch(data, 'notification.dispatch');
  }

  @EventPattern('comment.events')
  async handleCommentEvent(@Payload() data: any) {
    await this.processCommentEvent(data, 'comment.events');
  }

  @EventPattern('comment.events.retry')
  async handleCommentEventRetry(@Payload() data: any) {
    await this.processCommentEvent(data, 'comment.events');
  }

  private async processMarketEvent(data: any, topic: string) {
    await this.withRetryDlq(topic, data, async () => {
      const payload = data.payload || data;
      const eventType = payload.eventType || payload.type;
      this.logger.log(`WS broadcast market event: ${eventType}`);

      if (payload.marketId) {
        this.wsGateway.broadcastToRoom(`market:${payload.marketId}`, 'market_update', {
          type: eventType,
          ...payload,
        });
      }

      if (eventType === 'MARKET_SETTLED') {
        this.wsGateway.broadcastToRoom('leaderboard', 'leaderboard_update', {
          type: 'market_settled',
          marketId: payload.marketId,
          winnerCount: payload.winnerCount,
        });
      }
    });
  }

  private async processBetPlacement(data: any, topic: string) {
    await this.withRetryDlq(topic, data, async () => {
      const payload = data.payload || data;
      this.logger.log(`WS broadcast bet placement for market ${payload.marketId}`);

      if (payload.marketId) {
        this.wsGateway.broadcastToRoom(`market:${payload.marketId}`, 'bet_placed', {
          marketId: payload.marketId,
          amount: payload.amount,
          outcomeId: payload.outcomeId,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  private async processWalletTransaction(data: any, topic: string) {
    await this.withRetryDlq(topic, data, async () => {
      const payload = data.payload || data;
      this.logger.log(`WS broadcast wallet update for user ${payload.userId}`);

      if (payload.userId) {
        this.wsGateway.broadcastToUser(payload.userId, 'wallet_update', {
          type: payload.type,
          amount: payload.amount,
          currency: payload.currency,
          status: payload.status,
          description: payload.description,
        });
      }
    });
  }

  private async processNotificationDispatch(data: any, topic: string) {
    await this.withRetryDlq(topic, data, async () => {
      const payload = data.payload || data;
      this.logger.log(`WS broadcast notification for user ${payload.userId}`);

      if (payload.userId) {
        this.wsGateway.broadcastToUser(payload.userId, 'notification', {
          title: payload.title,
          message: payload.message,
          type: payload.type,
          actionUrl: payload.actionUrl,
        });
      }
    });
  }

  private async processCommentEvent(data: any, topic: string) {
    await this.withRetryDlq(topic, data, async () => {
      const payload = data.payload || data;
      const eventType = payload.eventType || data.eventName || 'unknown';
      this.logger.log(`WS broadcast comment event: ${eventType}`);

      if (payload.marketId) {
        this.wsGateway.broadcastToRoom(`market:${payload.marketId}`, 'comment_event', {
          eventType,
          ...payload,
        });
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
