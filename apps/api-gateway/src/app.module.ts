import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { RequestLoggingMiddleware } from './middleware/request-logging.middleware';
import { RateLimitMiddleware } from './middleware/rate-limit.middleware';
import { validateEnv } from '@app/common';

function handleProxyError(_err: unknown, _req: unknown, res: any) {
  if (res?.headersSent) return;
  res.statusCode = 502;
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      success: false,
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Backend service unavailable',
      },
    }),
  );
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local', '.env.production'],
      validate: validateEnv,
    }),
  ],
  providers: [RequestLoggingMiddleware, RateLimitMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Request Logging (applies to all routes)
    consumer
      .apply(RequestLoggingMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });

    // Gateway-level flood control before proxying upstream.
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });

    // Auth Service Proxy
    consumer
      .apply(
        createProxyMiddleware({
          target: process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:3002',
          changeOrigin: true,
          timeout: 5000,
          proxyTimeout: 5000,
          on: {
            proxyReq: fixRequestBody as any,
            error: handleProxyError as any,
          },
          pathRewrite: {
            '^/api/v1/auth': '/auth',
            '^/api/v1/user': '/user',
            '^/api/v1/users': '/users',
          },
        }),
      )
      .forRoutes(
        { path: 'api/v1/auth*', method: RequestMethod.ALL },
        { path: 'api/v1/user*', method: RequestMethod.ALL },
        { path: 'api/v1/users*', method: RequestMethod.ALL },
      );

    // Market Engine Proxy
    consumer
      .apply(
        createProxyMiddleware({
          target: process.env.MARKET_SERVICE_URL || 'http://127.0.0.1:3003',
          changeOrigin: true,
          timeout: 5000,
          proxyTimeout: 5000,
          on: {
            proxyReq: fixRequestBody as any,
            error: handleProxyError as any,
          },
          pathRewrite: {
            '^/api/v1/markets': '/markets',
            '^/api/v1/predictions': '/predictions',
            '^/api/v1/groups': '/groups',
          },
        }),
      )
      .forRoutes(
        { path: 'api/v1/markets*', method: RequestMethod.ALL },
        { path: 'api/v1/predictions*', method: RequestMethod.ALL },
        { path: 'api/v1/groups*', method: RequestMethod.ALL },
      );

    // Polymarket API Proxy — forwards to the market-engine which calls Polymarket externally
    consumer
      .apply(
        createProxyMiddleware({
          target: process.env.MARKET_SERVICE_URL || 'http://127.0.0.1:3003',
          changeOrigin: true,
          timeout: 10000,
          proxyTimeout: 10000,
          on: {
            proxyReq: fixRequestBody as any,
            error: handleProxyError as any,
          },
          pathRewrite: {
            '^/api/v1/polymarket': '/polymarket',
          },
        }),
      )
      .forRoutes(
        { path: 'api/v1/polymarket*', method: RequestMethod.ALL },
      );

    // Wallet Service Proxy
    consumer
      .apply(
        createProxyMiddleware({
          target: process.env.WALLET_SERVICE_URL || 'http://127.0.0.1:3004',
          changeOrigin: true,
          timeout: 5000,
          proxyTimeout: 5000,
          on: {
            proxyReq: fixRequestBody as any,
            error: handleProxyError as any,
          },
          pathRewrite: { '^/api/v1/wallet': '/wallet' },
        }),
      )
      .forRoutes({ path: 'api/v1/wallet*', method: RequestMethod.ALL });

    // Notification Service Proxy
    consumer
      .apply(
        createProxyMiddleware({
          target: process.env.NOTIFICATION_SERVICE_URL || 'http://127.0.0.1:3005',
          changeOrigin: true,
          timeout: 5000,
          proxyTimeout: 5000,
          on: {
            proxyReq: fixRequestBody as any,
            error: handleProxyError as any,
          },
          pathRewrite: { '^/api/v1/notifications': '/notifications' },
        }),
      )
      .forRoutes({ path: 'api/v1/notifications*', method: RequestMethod.ALL });

    // Admin Service Proxy
    consumer
      .apply(
        createProxyMiddleware({
          target: process.env.ADMIN_SERVICE_URL || 'http://127.0.0.1:3007',
          changeOrigin: true,
          timeout: 5000,
          proxyTimeout: 5000,
          on: {
            proxyReq: fixRequestBody as any,
            error: handleProxyError as any,
          },
          pathRewrite: {
            '^/api/v1/admin': '/admin',
            '^/api/v1/public': '/public',
          },
        }),
      )
      .forRoutes(
        { path: 'api/v1/admin*', method: RequestMethod.ALL },
        { path: 'api/v1/public*', method: RequestMethod.ALL },
      );

    // WebSocket Gateway Proxy
    consumer
      .apply(
        createProxyMiddleware({
          target: process.env.WEBSOCKET_GATEWAY_URL || 'http://127.0.0.1:3006',
          changeOrigin: true,
          ws: true,
          on: {
            proxyReq: fixRequestBody as any,
            error: handleProxyError as any,
          },
        }),
      )
      .forRoutes({ path: 'socket.io*', method: RequestMethod.ALL });
  }
}
