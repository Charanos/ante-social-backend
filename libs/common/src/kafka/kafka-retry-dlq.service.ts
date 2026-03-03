import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';

type KafkaEnvelope = {
  payload: unknown;
  meta?: {
    attempt?: number;
    [key: string]: unknown;
  };
};

@Injectable()
export class KafkaRetryDlqService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaRetryDlqService.name);
  private kafka?: Kafka;
  private producer?: Producer;
  private producerConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async routeFailure(baseTopic: string, rawMessage: unknown, error: unknown) {
    const retrySuffix = this.configService.get<string>('KAFKA_RETRY_SUFFIX') || '.retry';
    const dlqSuffix = this.configService.get<string>('KAFKA_DLQ_SUFFIX') || '.dlq';
    const maxRetries = Number(this.configService.get<string>('KAFKA_MAX_RETRIES') || 3);
    const previousAttempt = this.extractAttempt(rawMessage);
    const attempt = previousAttempt + 1;
    const targetTopic =
      attempt <= maxRetries ? `${baseTopic}${retrySuffix}` : `${baseTopic}${dlqSuffix}`;

    const errorMessage = error instanceof Error ? error.message : String(error);
    const envelope: KafkaEnvelope = {
      payload: this.extractPayload(rawMessage),
      meta: {
        ...this.extractMeta(rawMessage),
        attempt,
        failedTopic: baseTopic,
        failedAt: new Date().toISOString(),
        error: errorMessage,
      },
    };

    await this.publish(targetTopic, envelope);
    return { targetTopic, attempt, maxRetries };
  }

  async publish(topic: string, message: KafkaEnvelope) {
    const useKafka = this.configService.get<string>('ENABLE_KAFKA') !== 'false';
    if (!useKafka) {
      this.logger.debug(`Kafka disabled. Skipping publish to ${topic}`);
      return;
    }

    try {
      const producer = await this.getProducer();
      await producer.send({
        topic,
        messages: [
          {
            value: JSON.stringify(message),
          },
        ],
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to publish Kafka message to ${topic}: ${errorMessage}`);
    }
  }

  async onModuleDestroy() {
    if (this.producer && this.producerConnected) {
      try {
        await this.producer.disconnect();
      } catch {
        // No-op during shutdown.
      } finally {
        this.producerConnected = false;
      }
    }
  }

  private async getProducer() {
    if (!this.kafka) {
      const brokers = (this.configService.get<string>('KAFKA_BROKERS') || 'localhost:9092')
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean);

      this.kafka = new Kafka({
        clientId:
          this.configService.get<string>('KAFKA_CLIENT_ID') || 'ante-social-kafka-retry-publisher',
        brokers,
      });
    }

    if (!this.producer) {
      this.producer = this.kafka.producer();
    }

    if (!this.producerConnected) {
      await this.producer.connect();
      this.producerConnected = true;
    }

    return this.producer;
  }

  private extractAttempt(rawMessage: unknown) {
    const meta = this.extractMeta(rawMessage);
    return Number(meta?.attempt || 0);
  }

  private extractMeta(rawMessage: unknown) {
    if (!rawMessage || typeof rawMessage !== 'object') {
      return undefined;
    }
    return (rawMessage as KafkaEnvelope).meta;
  }

  private extractPayload(rawMessage: unknown) {
    if (!rawMessage || typeof rawMessage !== 'object') {
      return rawMessage;
    }
    const message = rawMessage as KafkaEnvelope;
    return message.payload !== undefined ? message.payload : rawMessage;
  }
}
