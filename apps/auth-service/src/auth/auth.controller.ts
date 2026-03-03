import { Controller, Post, Body, UseGuards, Res, Req, Get, Delete, Param } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, CurrentUser, RefreshTokenDto, JwtAuthGuard } from '@app/common';
import { LocalAuthGuard } from '../guards/local-auth.guard';
import { UserDocument } from '@app/database';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.register(registerDto);
    this.setAuthCookies(response, result.access_token, result.refresh_token);

    return result;
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@CurrentUser() user: UserDocument, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(user);
    
    // If 2FA is required, don't set cookie yet
    if ('requires_2fa' in result) {
      return result;
    }

    this.setAuthCookies(response, result.access_token, result.refresh_token);

    return result;
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body?: Partial<RefreshTokenDto>,
  ) {
    const refreshToken = request.cookies?.refresh_token || body?.refreshToken;
    await this.authService.revokeRefreshToken(refreshToken);

    response.clearCookie('access_token');
    response.clearCookie('refresh_token');
    return { success: true };
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body?: Partial<RefreshTokenDto>,
  ) {
    const refreshToken = request.cookies?.refresh_token || body?.refreshToken;
    const result = await this.authService.refreshTokens(refreshToken || '');
    this.setAuthCookies(response, result.access_token, result.refresh_token);
    return result;
  }

  @Post('verify-email')
  async verifyEmail(@Body('email') email: string, @Body('token') token: string) {
    return this.authService.verifyEmail(email, token);
  }

  @Post('resend-otp')
  async resendOtp(@Body('email') email: string) {
    return this.authService.resendOtp(email);
  }

  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; newPassword: string }) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Post('password')
  async changePassword(
    @CurrentUser() user: UserDocument,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(
      user._id.toString(),
      body.currentPassword,
      body.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('settings/sessions')
  async getSessions(@CurrentUser() user: UserDocument) {
    return this.authService.getSessions(user._id.toString());
  }

  @UseGuards(JwtAuthGuard)
  @Delete('settings/sessions/:sessionId')
  async revokeSession(
    @CurrentUser() user: UserDocument,
    @Param('sessionId') sessionId: string,
  ) {
    return this.authService.revokeSession(user._id.toString(), sessionId);
  }

  private setAuthCookies(response: Response, accessToken: string, refreshToken: string) {
    const isProduction = process.env.NODE_ENV === 'production';

    response.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    response.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
}
