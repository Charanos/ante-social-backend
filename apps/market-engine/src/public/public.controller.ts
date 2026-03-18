import { Controller, Get, Post, Param, Query } from '@nestjs/common';
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
  @RateLimit({ limit: 1000, ttl: 60 })
  async getPublicDepositMetrics() {
    return this.publicService.getPublicDepositMetrics();
  }

  @Get('metrics/landing')
  @RateLimit({ limit: 1000, ttl: 60 })
  async getPublicLandingMetrics() {
    return this.publicService.getPublicLandingMetrics();
  }

  @Get('leaderboard')
  @RateLimit({ limit: 500, ttl: 60 })
  async getLeaderboard(
    @Query('limit') limit = 10,
    @Query('timePeriod') timePeriod?: string,
  ) {
    return this.publicService.getPublicLeaderboard(Number(limit), timePeriod);
  }

  @Get('blogs')
  @RateLimit({ limit: 500, ttl: 60 })
  async getPublishedBlogs(
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.publicService.getPublicBlogs(Number(limit), Number(offset));
  }

  @Get('blogs/:slug')
  async getBlogBySlug(@Param('slug') slug: string) {
    return this.publicService.getPublicBlogBySlug(slug);
  }

  @Post('blogs/:slug/view')
  async incrementBlogViews(@Param('slug') slug: string) {
    return this.publicService.incrementPublicBlogViews(slug);
  }
}
