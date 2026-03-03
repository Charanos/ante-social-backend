import { BaseEvent } from './base.event';

export interface NotificationDispatchPayload {
  userId: string;
  type: string;
  title: string;
  message: string;
  channels: string[]; // ['push', 'email', 'in_app']
  actionUrl?: string;
  icon?: string;
  relatedId?: string;
  metadata?: Record<string, any>;
}

export class NotificationDispatchEvent extends BaseEvent<NotificationDispatchPayload> {
  constructor(payload: NotificationDispatchPayload) {
    super('SEND_NOTIFICATION', payload);
  }
}
