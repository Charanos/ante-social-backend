import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transport } from '@nestjs/microservices';
import {
  GlobalExceptionFilter,
  JsonLogger,
  initSentry,
  sanitizeRequestMiddleware,
  registerHealthAndMetrics,
} from '@app/common';
import helmet from 'helmet';
import compression from 'compression';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port =
    configService.get<number>('PORT') ||
    configService.get<number>('AUTH_SERVICE_PORT') ||
    3002;
  const rpcPort =
    configService.get<number>('AUTH_SERVICE_RPC_PORT') || 4002;
  const logger = new Logger('AuthService');
  initSentry('auth-service', configService.get<string>('SENTRY_DSN'));

  // Connect Microservice (TCP)
  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: rpcPort,
    },
  });

  app.use(helmet());
  app.use(compression());
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  app.use(sanitizeRequestMiddleware);

  // Global Pipes & Filters for HTTP
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  registerHealthAndMetrics(app, 'auth-service');

  await app.startAllMicroservices();
  await app.listen(port);
  logger.log(`Auth Service running on HTTP ${port}, RPC ${rpcPort}`);
}
bootstrap();
