// ─── Shared Polymarket API Client Library ─────────────────────────────────────
// @app/polymarket
//
// Provides three injectable services wrapping the three Polymarket public APIs:
//   - GammaClient   → https://gamma-api.polymarket.com
//   - DataClient    → https://data-api.polymarket.com
//   - ClobClient    → https://clob.polymarket.com
//
// Usage in a NestJS module:
//   imports: [PolymarketModule.registerAsync()]
// Then inject: GammaClient, DataClient, ClobClient

export * from './types';
export * from './gamma-client';
export * from './data-client';
export * from './clob-client';
export * from './polymarket.module';
