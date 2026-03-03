import { BaseEvent } from './base.event';

export interface MarketSettledPayload {
  marketId: string;
  type: string;
  winningOptionId?: string;
  totalPool: number;
  platformFee: number;
  prizePool: number;
  winnerCount: number;
  settledAt: string;
}

export class MarketSettledEvent extends BaseEvent<MarketSettledPayload> {
  constructor(payload: MarketSettledPayload) {
    super('MARKET_SETTLED', payload);
  }
}
