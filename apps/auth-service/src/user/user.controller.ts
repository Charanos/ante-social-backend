import { Controller, Get, Patch, Body, Param, Query, UseGuards, Delete } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard, CurrentUser } from '@app/common';
import { UserDocument } from '@app/database';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
@SkipThrottle()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('user/profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: UserDocument) {
    return this.userService.getProfile(user._id.toString());
  }

  @Patch('user/profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: UserDocument,
    @Body() body: Record<string, any>,
  ) {
    return this.userService.updateProfile(user._id.toString(), body);
  }

  @Delete('user/profile')
  @UseGuards(JwtAuthGuard)
  async deleteProfile(@CurrentUser() user: UserDocument) {
    return this.userService.deleteProfile(user._id.toString());
  }

  @Get('user/activity')
  @UseGuards(JwtAuthGuard)
  async getActivity(
    @CurrentUser() user: UserDocument,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.userService.getActivity(user._id.toString(), Number(limit), Number(offset));
  }

  @Get('users/:userId/profile')
  async getPublicProfile(@Param('userId') userId: string) {
    return this.userService.getPublicProfile(userId);
  }

  @Get('users/:username/public-profile')
  async getPublicProfileByUsername(@Param('username') username: string) {
    return this.userService.getPublicProfile(username);
  }

  @Get('users/:username/achievements')
  async getPublicAchievements(@Param('username') username: string) {
    return this.userService.getPublicAchievements(username);
  }

  @Get('users/:username/stats')
  async getPublicStats(@Param('username') username: string) {
    return this.userService.getPublicStats(username);
  }
}
