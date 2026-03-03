import { BaseEvent } from './base.event';

export interface BetEditedPayload {
  betId: string;
  marketId: string;
  userId: string;
  previousOptionId: string;
  newOptionId: string;
  stake: number;
  currency: string;
  editedAt: string;
}

export class BetEditedEvent extends BaseEvent<BetEditedPayload> {
  constructor(payload: BetEditedPayload) {
    super('BET_EDITED', payload);
  }
}

export interface BetCancelledPayload {
  betId: string;
  marketId: string;
  userId: string;
  refundAmount: number;
  currency: string;
  cancelledAt: string;
}

export class BetCancelledEvent extends BaseEvent<BetCancelledPayload> {
  constructor(payload: BetCancelledPayload) {
    super('BET_CANCELLED', payload);
  }
}
