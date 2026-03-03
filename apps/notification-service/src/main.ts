import { NestFactory } from '@nestjs/core';
import { NotificationModule } from './notification.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
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
  const app = await NestFactory.create(NotificationModule);
  const configService = app.get(ConfigService);
  app.useLogger(new JsonLogger('notification-service'));
  const logger = new Logger('NotificationService');
  initSentry('notification-service', configService.get<string>('SENTRY_DSN'));

  const httpPort = configService.get<number>('NOTIFICATION_SERVICE_PORT') || 3005;
  const rpcPort =
    configService.get<number>('NOTIFICATION_RPC_PORT') || 4005;
  const kafkaBrokers =
    (configService.get<string>('KAFKA_BROKERS') || 'localhost:9092')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);
  const enableKafkaConsumer =
    configService.get<string>('ENABLE_NOTIFICATION_KAFKA') !== undefined
      ? configService.get<string>('ENABLE_NOTIFICATION_KAFKA') === 'true'
      : configService.get<string>('NODE_ENV') === 'production';

  if (enableKafkaConsumer) {
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.KAFKA,
      options: {
        client: {
          brokers: kafkaBrokers,
        },
        consumer: {
          groupId: 'notification-service-group',
        },
      },
    });
  } else {
    logger.warn(
      'Kafka consumer disabled for local development (ENABLE_NOTIFICATION_KAFKA=false).',
    );
  }

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
  registerHealthAndMetrics(app, 'notification-service');

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: rpcPort,
    },
  });

  await app.startAllMicroservices();
  await app.listen(httpPort);
  logger.log(`Notification Service running on HTTP ${httpPort}, RPC ${rpcPort}`);
}
bootstrap();
