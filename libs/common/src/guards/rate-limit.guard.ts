import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import { createClient } from 'redis';
import { ConfigService } from '@nestjs/config';
import { RATE_LIMITS } from '../constants';

@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitGuard.name);
  private redis: ReturnType<typeof createClient>;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    const redisUrl =
      this.configService.get<string>('REDIS_URL') ||
      this.configService.get<string>('REDIS_URI');

    const redisHost = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const redisPort = Number(this.configService.get<number>('REDIS_PORT') || 6379);
    const redisUsername = this.configService.get<string>('REDIS_USERNAME');
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');

    this.redis = redisUrl
      ? createClient({ url: redisUrl })
      : createClient({
          username: redisUsername,
          password: redisPassword,
          socket: {
            host: redisHost,
            port: redisPort,
          },
        });

    this.redis.on('error', err => this.logger.error('Redis Client Error', err));
  }

  async onModuleInit() {
    if (!this.redis.isOpen) {
      await this.redis.connect();
    }
  }

  async onModuleDestroy() {
    if (this.redis.isOpen) {
      await this.redis.quit();
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() !== 'http') {
      return true;
    }

    const configuredRateLimit = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const rateLimit: RateLimitOptions = configuredRateLimit ?? {
      ttl: this.configService.get<number>('DEFAULT_RATE_LIMIT_TTL') || RATE_LIMITS.api.ttl,
      limit: this.configService.get<number>('DEFAULT_RATE_LIMIT_LIMIT') || RATE_LIMITS.api.limit,
    };

    const request = context.switchToHttp().getRequest();
    const forwardedIp = request.headers?.['x-forwarded-for'] as string | undefined;
    const ip = forwardedIp?.split(',')?.[0]?.trim() || request.ip || request.connection.remoteAddress;
    const userId = request.user?.userId || request.user?.id || request.user?._id;
    const subject = userId ? `user:${userId}` : `ip:${ip}`;
    const key = `ratelimit:${subject}:${context.getClass().name}:${context.getHandler().name}`;

    try {
      if (!this.redis.isOpen) {
        await this.redis.connect();
      }

      const current = await this.redis.incr(key);
      
      if (current === 1) {
        await this.redis.expire(key, rateLimit.ttl);
      }

      if (current > rateLimit.limit) {
        this.logger.warn(`Rate limit exceeded for ${subject} on ${key}`);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests, please try again later.',
            retryAfter: await this.redis.ttl(key),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Rate limit error: ${errorMessage}`);
      // Fail open if Redis is down
      return true;
    }
  }
}
