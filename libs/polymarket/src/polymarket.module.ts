import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GammaClient } from './gamma-client';
import { DataClient } from './data-client';
import { ClobClient } from './clob-client';

export interface PolymarketModuleOptions {
  gammaBaseUrl?: string;
  dataBaseUrl?: string;
  clobBaseUrl?: string;
  timeoutMs?: number;
}

@Module({})
export class PolymarketModule {
  /**
   * Register with explicit options.
   */
  static register(options: PolymarketModuleOptions = {}): DynamicModule {
    const providers = PolymarketModule.buildProviders(options);
    return {
      module: PolymarketModule,
      providers,
      exports: providers,
    };
  }

  /**
   * Register reading config from NestJS ConfigService (uses env vars).
   * Expected env vars: POLYMARKET_GAMMA_API_URL, POLYMARKET_DATA_API_URL,
   * POLYMARKET_CLOB_API_URL, POLYMARKET_API_TIMEOUT_MS
   */
  static registerAsync(): DynamicModule {
    const gammaProvider = {
      provide: GammaClient,
      useFactory: (config: ConfigService) =>
        new GammaClient({
          baseUrl: config.get<string>('POLYMARKET_GAMMA_API_URL'),
          timeoutMs: Number(config.get('POLYMARKET_API_TIMEOUT_MS') || 12000),
        }),
      inject: [ConfigService],
    };

    const dataProvider = {
      provide: DataClient,
      useFactory: (config: ConfigService) =>
        new DataClient({
          baseUrl: config.get<string>('POLYMARKET_DATA_API_URL'),
          timeoutMs: Number(config.get('POLYMARKET_API_TIMEOUT_MS') || 12000),
        }),
      inject: [ConfigService],
    };

    const clobProvider = {
      provide: ClobClient,
      useFactory: (config: ConfigService) =>
        new ClobClient({
          baseUrl: config.get<string>('POLYMARKET_CLOB_API_URL'),
          timeoutMs: Number(config.get('POLYMARKET_API_TIMEOUT_MS') || 12000),
        }),
      inject: [ConfigService],
    };

    return {
      module: PolymarketModule,
      providers: [gammaProvider, dataProvider, clobProvider],
      exports: [GammaClient, DataClient, ClobClient],
    };
  }

  private static buildProviders(options: PolymarketModuleOptions) {
    return [
      {
        provide: GammaClient,
        useValue: new GammaClient({
          baseUrl: options.gammaBaseUrl,
          timeoutMs: options.timeoutMs,
        }),
      },
      {
        provide: DataClient,
        useValue: new DataClient({
          baseUrl: options.dataBaseUrl,
          timeoutMs: options.timeoutMs,
        }),
      },
      {
        provide: ClobClient,
        useValue: new ClobClient({
          baseUrl: options.clobBaseUrl,
          timeoutMs: options.timeoutMs,
        }),
      },
    ];
  }
}
