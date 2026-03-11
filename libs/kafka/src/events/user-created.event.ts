import { BaseEvent } from './base.event';
import { KAFKA_TOPICS, UserTier } from '@app/common';

export class UserCreatedEvent extends BaseEvent<{
  userId: string;
  email: string;
  username: string;
  tier: UserTier;
  verificationToken?: string;
  emailVerified?: boolean;
}> {
  constructor(payload: {
    userId: string;
    email: string;
    username: string;
    tier: UserTier;
    verificationToken?: string;
    emailVerified?: boolean;
  }) {
    super(KAFKA_TOPICS.USER_ACTIVITY, payload);
  }
}
