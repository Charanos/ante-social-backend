import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka } from 'kafkajs';
import { KAFKA_TOPICS } from '@app/common';

@Injectable()
export class KafkaTopicBootstrapService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaTopicBootstrapService.name);
  private kafka?: Kafka;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const enabled = this.configService.get<string>('KAFKA_AUTO_CREATE_TOPICS') !== 'false';
    if (!enabled) {
      return;
    }

    const brokers = (this.configService.get<string>('KAFKA_BROKERS') || 'localhost:9092')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);

    if (!brokers.length) {
      this.logger.warn('Kafka topic bootstrap skipped: no brokers configured');
      return;
    }

    const clientId = this.configService.get<string>('KAFKA_CLIENT_ID') || 'ante-social-backend';
    const partitions = Number(this.configService.get<string>('KAFKA_TOPIC_PARTITIONS') || 1);
    const replicationFactor = Number(
      this.configService.get<string>('KAFKA_TOPIC_REPLICATION_FACTOR') || 1,
    );
    const retrySuffix = this.configService.get<string>('KAFKA_RETRY_SUFFIX') || '.retry';
    const dlqSuffix = this.configService.get<string>('KAFKA_DLQ_SUFFIX') || '.dlq';
    const configuredTopics = (this.configService.get<string>('KAFKA_TOPICS') || '')
      .split(',')
      .map((topic) => topic.trim())
      .filter(Boolean);

    const baseTopics = Array.from(
      new Set([
        ...Object.values(KAFKA_TOPICS),
        ...configuredTopics,
      ]),
    );
    const allTopics = Array.from(
      new Set([
        ...baseTopics,
        ...baseTopics.map((topic) => `${topic}${retrySuffix}`),
        ...baseTopics.map((topic) => `${topic}${dlqSuffix}`),
      ]),
    );

    this.kafka = new Kafka({ clientId, brokers });
    const admin = this.kafka.admin();

    try {
      await admin.connect();
      await admin.createTopics({
        waitForLeaders: true,
        topics: allTopics.map((topic) => ({
          topic,
          numPartitions: partitions,
          replicationFactor,
        })),
      });
      this.logger.log(`Kafka topics bootstrapped (${allTopics.length})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Kafka topic bootstrap skipped: ${message}`);
    } finally {
      await admin.disconnect();
    }
  }

  async onModuleDestroy() {
    this.kafka = undefined;
  }
}
