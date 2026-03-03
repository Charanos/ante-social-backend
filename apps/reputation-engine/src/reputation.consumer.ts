import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { KafkaRetryDlqService } from '@app/common';
import { ReputationService } from './reputation.service';

@Controller()
export class ReputationConsumer {
  private readonly logger = new Logger(ReputationConsumer.name);

  constructor(
    private readonly reputationService: ReputationService,
    private readonly kafkaRetryDlqService: KafkaRetryDlqService,
  ) {}

  @EventPattern('market.events')
  async handleMarketSettled(@Payload() data: any) {
    await this.processMarketEvent(data, 'market.events');
  }

  @EventPattern('market.events.retry')
  async handleMarketSettledRetry(@Payload() data: any) {
    await this.processMarketEvent(data, 'market.events');
  }

  @EventPattern('bet.placements')
  async handleBetPlaced(@Payload() data: any) {
    await this.processBetPlaced(data, 'bet.placements');
  }

  @EventPattern('bet.placements.retry')
  async handleBetPlacedRetry(@Payload() data: any) {
    await this.processBetPlaced(data, 'bet.placements');
  }

  @EventPattern('user.created')
  async handleUserCreated(@Payload() data: any) {
    await this.processUserCreated(data, 'user.created');
  }

  @EventPattern('user.created.retry')
  async handleUserCreatedRetry(@Payload() data: any) {
    await this.processUserCreated(data, 'user.created');
  }

  private async processMarketEvent(data: any, topic: string) {
    await this.withRetryDlq(topic, data, async () => {
      const payload = data.payload || data;
      if (payload.eventType === 'MARKET_SETTLED' || payload.type === 'MARKET_SETTLED') {
        this.logger.log(`Market settled: ${payload.marketId}. Recalculating participant scores.`);
        // TODO: recalculate scores for all market participants.
      }
    });
  }

  private async processBetPlaced(data: any, topic: string) {
    await this.withRetryDlq(topic, data, async () => {
      const payload = data.payload || data;
      const userId = payload.userId;

      if (userId) {
        this.logger.log(`Bet placed by ${userId}. Updating integrity weight.`);
        await this.reputationService.calculateIntegrityWeight(userId);
      }
    });
  }

  private async processUserCreated(data: any, topic: string) {
    await this.withRetryDlq(topic, data, async () => {
      const payload = data.payload || data;
      this.logger.log(`New user ${payload.userId}. Setting cold-start reputation.`);
      // Cold-start score is seeded during registration.
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
