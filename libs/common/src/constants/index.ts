// ─── Enums ──────────────────────────────────────────────────
export enum MarketType {
  CONSENSUS = 'consensus',
  REFLEX = 'reflex',
  LADDER = 'ladder',
  PRISONER_DILEMMA = 'prisoner_dilemma',
  BETRAYAL = 'betrayal',
}

export enum MarketStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  PUBLISHED = 'published',
  ACTIVE = 'active',
  CLOSED = 'closed',
  SETTLING = 'settling',
  SETTLED = 'settled',
  CANCELLED = 'cancelled',
}

export enum GroupMarketType {
  WINNER_TAKES_ALL = 'winner_takes_all',
  ODD_ONE_OUT = 'odd_one_out',
}

export enum GroupMarketStatus {
  ACTIVE = 'active',
  PENDING_CONFIRMATION = 'pending_confirmation',
  DISPUTED = 'disputed',
  SETTLED = 'settled',
  CANCELLED = 'cancelled',
}

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  BET_PLACED = 'bet_placed',
  BET_PAYOUT = 'bet_payout',
  REFUND = 'refund',
  PLATFORM_FEE = 'platform_fee',
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum UserTier {
  NOVICE = 'novice',
  HIGH_ROLLER = 'high_roller',
}

export enum UserRole {
  USER = 'user',
  MODERATOR = 'moderator',
  GROUP_ADMIN = 'group_admin',
  ADMIN = 'admin',
}

export enum Currency {
  USD = 'USD',
  KSH = 'KSH',
}

export enum OracleType {
  MANUAL = 'manual',
  AUTOMATED = 'automated',
  COMMUNITY_CONSENSUS = 'community_consensus',
}

export enum SettlementMethod {
  ADMIN_REPORT = 'admin_report',
  EXTERNAL_API = 'external_api',
}

export enum OddsType {
  FIXED = 'fixed',
  PARI_MUTUEL = 'pari_mutuel',
}

export enum NotificationType {
  BET_PLACED = 'bet_placed',
  MARKET_CLOSING_SOON = 'market_closing_soon',
  MARKET_SETTLED = 'market_settled',
  PAYOUT_RECEIVED = 'payout_received',
  DEPOSIT_CONFIRMED = 'deposit_confirmed',
  WITHDRAWAL_PROCESSED = 'withdrawal_processed',
  GROUP_INVITE = 'group_invite',
  ACHIEVEMENT_UNLOCKED = 'achievement_unlocked',
  SYSTEM = 'system',
}

// ─── Constants ──────────────────────────────────────────────
export const PLATFORM_FEE_RATE = 0.05; // 5%
export const MIN_AGE_YEARS = 18;

export const DAILY_LIMITS = {
  [UserTier.NOVICE]: {
    deposit: 500,
    withdrawal: 200,
  },
  [UserTier.HIGH_ROLLER]: {
    deposit: 5000,
    withdrawal: 2000,
  },
} as const;

export const RATE_LIMITS = {
  auth: { ttl: 60, limit: 5 },       // 5 login attempts per minute
  api: { ttl: 60, limit: 60 },       // 60 requests per minute
  wallet: { ttl: 60, limit: 10 },    // 10 wallet ops per minute
  market: { ttl: 60, limit: 30 },    // 30 market reads per minute
} as const;

export const REFLEX_MULTIPLIER_TIERS = [
  { maxPct: 45, multiplier: 2.0, tier: 'A' },
  { maxPct: 55, multiplier: 1.3, tier: 'B' },
  { maxPct: 70, multiplier: 1.05, tier: 'C' },
  { maxPct: 100, multiplier: 1.0, tier: 'RESET' },
] as const;

export const INTEGRITY_WEIGHT_RULES = {
  ESTABLISHED: 1.0,    // ≥30 days + ≥5 settled
  BUILDING: 0.95,      // ≥7 days + ≥1 settled
  UNPROVEN: 0.9,       // ≥7 days + 0 settled
  NEW: 0.85,           // <7 days
  FLAGGED: 0.8,        // Under review
} as const;

export const REPUTATION_WEIGHTS = {
  ACCURACY: 0.4,
  CONSISTENCY: 0.25,
  TENURE: 0.15,
  SOCIAL: 0.1,
  COMPLIANCE: 0.1,
} as const;

export const KAFKA_TOPICS = {
  MARKET_EVENTS: 'market.events',
  BET_PLACEMENTS: 'bet.placements',
  WALLET_TRANSACTIONS: 'wallet.transactions',
  USER_ACTIVITY: 'user.activity',
  NOTIFICATION_DISPATCH: 'notification.dispatch',
  COMPLIANCE_FLAGS: 'compliance.flags',
} as const;
