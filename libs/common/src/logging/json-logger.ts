import { LoggerService } from '@nestjs/common';

type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

export class JsonLogger implements LoggerService {
  constructor(private readonly service: string) {}

  log(message: any, context?: string) {
    this.write('log', message, context);
  }

  error(message: any, trace?: string, context?: string) {
    this.write('error', message, context, trace);
  }

  warn(message: any, context?: string) {
    this.write('warn', message, context);
  }

  debug?(message: any, context?: string) {
    this.write('debug', message, context);
  }

  verbose?(message: any, context?: string) {
    this.write('verbose', message, context);
  }

  private write(level: LogLevel, message: any, context?: string, trace?: string) {
    const payload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      context,
      message: typeof message === 'string' ? message : JSON.stringify(message),
    };

    if (trace) {
      payload.trace = trace;
    }

    const line = JSON.stringify(payload);
    if (level === 'error') {
      process.stderr.write(`${line}\n`);
      return;
    }
    process.stdout.write(`${line}\n`);
  }
}
