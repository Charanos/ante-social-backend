import { BaseEvent } from './base.event';

export interface ComplianceFlagPayload {
  userId: string;
  flagId: string;
  reason: string;
  action: string; // 'ACCOUNT_FLAGGED' | 'ACCOUNT_FROZEN' | 'ACCOUNT_UNFROZEN'
  description: string;
  triggeredBy: string; // system or adminUserId
  metadata?: Record<string, any>;
}

export class ComplianceFlagEvent extends BaseEvent<ComplianceFlagPayload> {
  constructor(payload: ComplianceFlagPayload) {
    super(payload.action, payload);
  }
}
