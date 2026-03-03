import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import {
  JsonLogger,
  initSentry,
  sanitizeRequestMiddleware,
  registerHealthAndMetrics,
} from '@app/common';

async function bootstrap() {
  // Gateway is a pure proxy layer; keep raw request streams for forwarding.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.useLogger(new JsonLogger('api-gateway'));
  const logger = new Logger('ApiGateway');
  initSentry('api-gateway', process.env.SENTRY_DSN);
  
  // Security & Performance
  app.use(helmet());
  app.use(compression());
  app.use(sanitizeRequestMiddleware);
  
  // Global Exception Filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // CORS
  const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  registerHealthAndMetrics(app, 'api-gateway');

  const port = process.env.PORT || process.env.API_GATEWAY_PORT || 3001;
  await app.listen(port);
  logger.log(`API Gateway running on port ${port}`);
}
bootstrap();
