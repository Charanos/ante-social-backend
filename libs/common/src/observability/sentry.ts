export function initSentry(serviceName: string, dsn?: string) {
  if (!dsn) {
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
      initialScope: {
        tags: {
          service: serviceName,
        },
      },
    });
    return true;
  } catch {
    return false;
  }
}
