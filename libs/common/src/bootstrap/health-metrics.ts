import { INestApplication } from '@nestjs/common';

export function registerHealthAndMetrics(app: INestApplication, serviceName: string) {
  const http = app.getHttpAdapter().getInstance();
  const startedAt = Date.now();

  http.get('/health', (_req: any, res: any) => {
    res.status(200).json({
      status: 'ok',
      service: serviceName,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  http.get('/metrics', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.end(
      [
        '# HELP service_up Service liveness indicator',
        '# TYPE service_up gauge',
        `service_up{service="${serviceName}"} 1`,
        '# HELP service_uptime_seconds Service uptime in seconds',
        '# TYPE service_uptime_seconds gauge',
        `service_uptime_seconds{service="${serviceName}"} ${Math.floor((Date.now() - startedAt) / 1000)}`,
      ].join('\n'),
    );
  });
}
