import { Controller, Delete, Get, Patch, Param, UseGuards, Query } from '@nestjs/common';
import { InAppService } from './channels/in-app.service';
import { JwtAuthGuard, CurrentUser } from '@app/common';
import { UserDocument } from '@app/database';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly inAppService: InAppService) {}

  @Get()
  async getNotifications(
    @CurrentUser() user: UserDocument,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.inAppService.getUserNotifications(user._id.toString(), Number(limit), Number(offset));
  }

  @Patch(':id/read')
  async markAsRead(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
  ) {
    return this.inAppService.markAsRead(user._id.toString(), id);
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: UserDocument) {
    return this.inAppService.markAllAsRead(user._id.toString());
  }

  @Delete(':id')
  async deleteNotification(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
  ) {
    return this.inAppService.deleteNotification(user._id.toString(), id);
  }
}
