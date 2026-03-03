import { BaseEvent } from './base.event';

export interface MarketCreatedPayload {
  marketId: string;
  type: string;
  title: string;
  category: string;
  createdBy: string;
  opensAt: string;
  closesAt: string;
}

export class MarketCreatedEvent extends BaseEvent<MarketCreatedPayload> {
  constructor(payload: MarketCreatedPayload) {
    super('MARKET_CREATED', payload);
  }
}

export interface MarketClosedPayload {
  marketId: string;
  type: string;
  totalPool: number;
  participantCount: number;
  closedAt: string;
}

export class MarketClosedEvent extends BaseEvent<MarketClosedPayload> {
  constructor(payload: MarketClosedPayload) {
    super('MARKET_CLOSED', payload);
  }
}
