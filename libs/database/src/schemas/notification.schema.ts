import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ collection: 'notifications', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Notification {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  type!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ default: false })
  isRead!: boolean;

  @Prop()
  icon?: string;

  @Prop()
  amount?: number;

  @Prop({ type: Types.ObjectId })
  marketId?: Types.ObjectId;

  @Prop()
  marketTitle?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  // ─── Delivery status ──────────────────────────
  @Prop({ default: false })
  pushSent!: boolean;

  @Prop({ default: false })
  emailSent!: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Indexes
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });
