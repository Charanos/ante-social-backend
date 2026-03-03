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
  app.useLogger(new JsonLogger('admin-service'));
  const port = configService.get<number>('ADMIN_SERVICE_PORT') || 3007;
  const rpcPort =
    configService.get<number>('ADMIN_SERVICE_RPC_PORT') || 4007;
  const logger = new Logger('AdminService');
  initSentry('admin-service', configService.get<string>('SENTRY_DSN'));

  // TCP Microservice for internal calls
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
  registerHealthAndMetrics(app, 'admin-service');

  await app.startAllMicroservices();
  await app.listen(port);
  logger.log(`Admin Service running on HTTP ${port}, RPC ${rpcPort}`);
}
bootstrap();
