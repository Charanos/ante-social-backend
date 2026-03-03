import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { registerHealthAndMetrics } from '../../libs/common/src/bootstrap/health-metrics';

test('health and metrics endpoints are exposed', async () => {
  const app = express();
  const fakeNestApp = {
    getHttpAdapter: () => ({
      getInstance: () => app,
    }),
  } as any;

  registerHealthAndMetrics(fakeNestApp, 'test-service');

  const server = await new Promise<import('http').Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Server did not bind to a port');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthBody = (await healthRes.json()) as { status: string; service: string };
    assert.equal(healthRes.status, 200);
    assert.equal(healthBody.status, 'ok');
    assert.equal(healthBody.service, 'test-service');

    const metricsRes = await fetch(`${baseUrl}/metrics`);
    const metricsText = await metricsRes.text();
    assert.equal(metricsRes.status, 200);
    assert.match(metricsText, /service_up\{service="test-service"\} 1/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
