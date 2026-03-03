// ─── Common Library Barrel Export ────────────────────────────

// Constants & Enums
export * from './constants';

// DTOs
export * from './dto/auth.dto';
export * from './dto/market.dto';
export * from './dto/wallet.dto';

// Interfaces
export * from './interfaces';

// Guards
export { JwtAuthGuard } from './guards/jwt-auth.guard';
export { RolesGuard } from './guards/roles.guard';
export { RateLimitGuard } from './guards/rate-limit.guard';

// Decorators
export { CurrentUser } from './decorators/current-user.decorator';
export { Roles, ROLES_KEY } from './decorators/roles.decorator';
export { RateLimit, RATE_LIMIT_KEY } from './decorators/rate-limit.decorator';

// Filters
export { GlobalExceptionFilter } from './filters/global-exception.filter';

// Middleware
export { sanitizeRequestMiddleware } from './middleware/sanitize.middleware';

// Config validation
export { validateEnv } from './config/env.validation';

// Bootstrap helpers
export { registerHealthAndMetrics } from './bootstrap/health-metrics';

// Logging / observability
export { JsonLogger } from './logging/json-logger';
export { initSentry } from './observability/sentry';

// Kafka resiliency
export { KafkaRetryDlqService } from './kafka/kafka-retry-dlq.service';
