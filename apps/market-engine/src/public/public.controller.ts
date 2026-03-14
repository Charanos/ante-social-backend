import { Controller, Get, Query } from '@nestjs/common';
import { RateLimit } from '@app/common';
import { PublicService } from './public.service';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('content/landing-page')
  @RateLimit({ limit: 500, ttl: 60 })
  async getLandingPageSettings(@Query('key') key?: string) {
    return this.publicService.getLandingPageSettings(key);
  }

  @Get('metrics/deposits')
  @RateLimit({ limit: 200, ttl: 60 })
  async getPublicDepositMetrics() {
    return this.publicService.getPublicDepositMetrics();
  }

  @Get('metrics/landing')
  @RateLimit({ limit: 200, ttl: 60 })
  async getPublicLandingMetrics() {
    return this.publicService.getPublicLandingMetrics();
  }
}
