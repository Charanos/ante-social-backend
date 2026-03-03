import { BaseEvent } from './base.event';
import { KAFKA_TOPICS } from '@app/common';

export class BetPlacedEvent extends BaseEvent<{
  betId: string;
  marketId: string;
  userId: string;
  amount: number;
  outcomeId: string;
}> {
  constructor(payload: { betId: string; marketId: string; userId: string; amount: number; outcomeId: string }) {
    super(KAFKA_TOPICS.BET_PLACEMENTS, payload);
  }
}
