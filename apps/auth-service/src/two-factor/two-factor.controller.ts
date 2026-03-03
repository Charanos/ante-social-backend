import { Controller, Post, Body, UseGuards, Res } from '@nestjs/common';
import { TwoFactorService } from './two-factor.service';
import { JwtAuthGuard, CurrentUser, Verify2FADto } from '@app/common';
import { Response } from 'express';

@Controller('auth/2fa')
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  @UseGuards(JwtAuthGuard)
  @Post('setup')
  async setup(@CurrentUser('userId') userId: string) {
    return this.twoFactorService.generateSecret(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('enable')
  async enable(@CurrentUser('userId') userId: string, @Body() body: Verify2FADto) {
    return this.twoFactorService.verifyAndEnable(userId, body.token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('disable')
  async disable(@CurrentUser('userId') userId: string, @Body() body: Verify2FADto) {
    return this.twoFactorService.disable(userId, body.token);
  }

  @Post('verify')
  async verify(@Body() body: { userId: string; token: string }, @Res({ passthrough: true }) response: Response) {
    // This endpoint handles the 2nd step of login
    const result = await this.twoFactorService.validateForLogin(body.userId, body.token);
    const isProduction = process.env.NODE_ENV === 'production';

    response.cookie('access_token', result.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });
    response.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return result;
  }
}
