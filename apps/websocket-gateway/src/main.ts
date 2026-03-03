import { NestFactory } from '@nestjs/core';
import { WsModule } from './ws.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisIoAdapter } from './redis-io.adapter';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
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
  const app = await NestFactory.create(WsModule);
  const configService = app.get(ConfigService);
  app.useLogger(new JsonLogger('websocket-gateway'));
  const port = configService.get<number>('WEBSOCKET_GATEWAY_PORT') || 3006;
  const logger = new Logger('WebSocketGateway');
  initSentry('websocket-gateway', configService.get<string>('SENTRY_DSN'));
  const kafkaBrokers = (configService.get<string>('KAFKA_BROKERS') || 'localhost:9092')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);
  const enableKafkaConsumer =
    configService.get<string>('ENABLE_WS_KAFKA') !== undefined
      ? configService.get<string>('ENABLE_WS_KAFKA') === 'true'
      : configService.get<string>('NODE_ENV') === 'production';

  if (enableKafkaConsumer) {
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: configService.get<string>('WS_KAFKA_CLIENT_ID') || 'websocket-gateway',
          brokers: kafkaBrokers,
        },
        consumer: {
          groupId:
            configService.get<string>('WS_KAFKA_CONSUMER_GROUP') ||
            'websocket-gateway-consumer',
        },
      },
    });
  } else {
    logger.warn('Kafka consumer disabled for local development (ENABLE_WS_KAFKA=false).');
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
  registerHealthAndMetrics(app, 'websocket-gateway');

  // Redis adapter is optional in local development.
  const redisIoAdapter = new RedisIoAdapter(app);
  try {
    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);
    logger.log('Redis adapter connected');
  } catch {
    logger.warn('Redis unavailable. Falling back to in-memory socket adapter.');
  }

  await app.startAllMicroservices();
  await app.listen(port);
  logger.log(`WebSocket Gateway running on port ${port}`);
}
bootstrap();
