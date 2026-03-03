import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from '@app/database';

@Injectable()
export class InAppService {
  private readonly logger = new Logger(InAppService.name);

  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
  ) {}

  async create(userId: string, title: string, message: string, type: string) {
    const notification = new this.notificationModel({
      userId,
      title,
      message,
      type,
      isRead: false,
    });
    await notification.save();
    this.logger.log(`Created in-app notification for ${userId}: ${title}`);
    return notification;
  }

  async getUserNotifications(userId: string, limit = 20, offset = 0) {
    const notifications = await this.notificationModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .exec();

    const total = await this.notificationModel.countDocuments({ userId });
    const unreadCount = await this.notificationModel.countDocuments({ userId, isRead: false });

    return { data: notifications, meta: { total, unreadCount, limit, offset } };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true },
      { new: true },
    );
    return notification;
  }

  async markAllAsRead(userId: string) {
    const result = await this.notificationModel.updateMany(
      { userId, isRead: false },
      { isRead: true },
    );
    return { success: true, modifiedCount: result.modifiedCount };
  }

  async deleteNotification(userId: string, notificationId: string) {
    if (!Types.ObjectId.isValid(notificationId)) {
      return { success: false };
    }
    const deleted = await this.notificationModel.findOneAndDelete({
      _id: new Types.ObjectId(notificationId),
      userId: new Types.ObjectId(userId),
    });
    return { success: Boolean(deleted) };
  }
}
