import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController, PublicController } from './admin.controller';
import { AnalyticsService } from '../analytics/analytics.service';
import { ComplianceService } from '../compliance/compliance.service';
import { DatabaseModule } from '@app/database';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    DatabaseModule,
    ClientsModule.registerAsync([
      {
        name: 'WALLET_SERVICE',
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('WALLET_SERVICE_HOST') || 'localhost',
            port:
              configService.get('WALLET_RPC_PORT') ||
              configService.get('WALLET_SERVICE_PORT') ||
              4004,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [AdminController, PublicController],
  providers: [AdminService, AnalyticsService, ComplianceService],
})
export class AdminModule {}
