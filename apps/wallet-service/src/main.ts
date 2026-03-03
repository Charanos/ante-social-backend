import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
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
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  app.useLogger(new JsonLogger('wallet-service'));
  const port = configService.get<number>('WALLET_SERVICE_PORT') || 3004;
  const rpcPort =
    configService.get<number>('WALLET_RPC_PORT') || 4004;
  const logger = new Logger('WalletService');
  initSentry('wallet-service', configService.get<string>('SENTRY_DSN'));

  // Connect TCP Microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: rpcPort,
    },
  });

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
  registerHealthAndMetrics(app, 'wallet-service');

  // Start HTTP and Microservice
  await app.startAllMicroservices();
  await app.listen(port);
  logger.log(`Wallet Service running on HTTP ${port}, RPC ${rpcPort}`);
}
bootstrap();
