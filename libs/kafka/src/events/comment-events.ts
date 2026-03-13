import { BaseEvent } from './base.event';
import { KAFKA_TOPICS } from '@app/common';

export interface CommentPayload {
  commentId: string;
  marketId: string;
  userId: string;
  username: string;
  body: string;
  parentId?: string;
  createdAt: string;
  editedAt?: string;
  status?: string;
  likes: number;
}

export class CommentCreatedEvent extends BaseEvent<CommentPayload> {
  constructor(payload: CommentPayload) {
    super(KAFKA_TOPICS.COMMENT_EVENTS, payload);
  }
}

export class CommentEditedEvent extends BaseEvent<CommentPayload> {
  constructor(payload: CommentPayload) {
    super(KAFKA_TOPICS.COMMENT_EVENTS, payload);
  }
}

export class CommentDeletedEvent extends BaseEvent<{ commentId: string; marketId: string }> {
  constructor(payload: { commentId: string; marketId: string }) {
    super(KAFKA_TOPICS.COMMENT_EVENTS, payload);
  }
}
