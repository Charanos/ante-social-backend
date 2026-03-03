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
  app.useLogger(new JsonLogger('market-engine'));
  const port = configService.get<number>('MARKET_ENGINE_PORT') || 3003;
  const rpcPort =
    configService.get<number>('MARKET_ENGINE_RPC_PORT') || 4003;
  const logger = new Logger('MarketEngine');
  initSentry('market-engine', configService.get<string>('SENTRY_DSN'));

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

  // Global Pipes & Filters
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  registerHealthAndMetrics(app, 'market-engine');

  await app.startAllMicroservices();
  await app.listen(port);
  logger.log(`Market Engine running on HTTP ${port}, RPC ${rpcPort}`);
}
bootstrap();
