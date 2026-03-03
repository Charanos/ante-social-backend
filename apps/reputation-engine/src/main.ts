import { NestFactory } from '@nestjs/core';
import { ReputationModule } from './reputation.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GlobalExceptionFilter,
  JsonLogger,
  initSentry,
  sanitizeRequestMiddleware,
  registerHealthAndMetrics,
} from '@app/common';
import helmet from 'helmet';
import compression from 'compression';

async function bootstrap() {
  const logger = new Logger('ReputationEngine');
  const port = parseInt(process.env.REPUTATION_ENGINE_PORT || process.env.PORT || '3008', 10);
  const kafkaBrokers =
    process.env.KAFKA_BROKERS?.split(',').map((broker) => broker.trim()).filter(Boolean) ||
    [process.env.KAFKA_BROKER || 'localhost:9092'];
  const enableKafkaConsumer =
    process.env.ENABLE_REPUTATION_KAFKA !== undefined
      ? process.env.ENABLE_REPUTATION_KAFKA === 'true'
      : process.env.NODE_ENV === 'production';

  const app = await NestFactory.create(ReputationModule);
  const configService = app.get(ConfigService);
  app.useLogger(new JsonLogger('reputation-engine'));
  initSentry('reputation-engine', configService.get<string>('SENTRY_DSN'));

  app.use(helmet());
  app.use(compression());
  app.use(sanitizeRequestMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  registerHealthAndMetrics(app, 'reputation-engine');

  if (enableKafkaConsumer) {
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'reputation-engine',
          brokers: kafkaBrokers,
        },
        consumer: {
          groupId: 'reputation-consumer',
        },
      },
    });

    await app.startAllMicroservices();
  } else {
    logger.warn('Kafka consumer disabled for local development (ENABLE_REPUTATION_KAFKA=false).');
  }

  await app.listen(port);
  logger.log(`Reputation Engine running on port ${port}`);
}
bootstrap();
