// ─── Gamma API Types ────────────────────────────────────────────────────────

export interface PolymarketToken {
  token_id: string;
  outcome: string;
  price: number;
  winner: boolean;
  index?: number;
}

export interface PolymarketMarket {
  id: string;
  condition_id: string;
  question_id: string;
  question: string;
  description: string;
  market_slug: string;
  end_date_iso: string;
  game_start_time?: string;
  seconds_delay?: number;
  fpmm?: string;
  maker_base_fee?: number;
  taker_base_fee?: number;
  notifications_enabled?: boolean;
  neg_risk?: boolean;
  neg_risk_market_id?: string;
  neg_risk_request_id?: string;
  is_50_50_nuance?: boolean;
  minimum_tick_size?: number;
  minimum_order_size?: number;
  rewards?: {
    rates: Record<string, number>;
    min_size: number;
    max_spread: number;
  };
  // Aggregated stats
  volume: number;
  volume_num_24hr?: number;
  volume_24hr?: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  archived?: boolean;
  new?: boolean;
  featured?: boolean;
  restricted?: boolean;
  // Outcomes
  outcomes: string;
  outcome_prices: string;
  tokens: PolymarketToken[];
  // Media
  image?: string;
  icon?: string;
  // Event linkage
  events?: PolymarketEvent[];
  // Tags
  tags?: PolymarketTag[];
  // Clob token IDs
  clob_token_ids?: string[];
  clobTokenIds?: string; // Stringified JSON array
  volume24hr?: number;
  endDate?: string;
  endDateIso?: string;
  accepting_orders?: boolean;
  accepting_order_timestamp?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  description?: string;
  start_date?: string;
  creation_date?: string;
  end_date?: string;
  image?: string;
  icon?: string;
  active: boolean;
  closed: boolean;
  archived?: boolean;
  new?: boolean;
  featured?: boolean;
  restricted?: boolean;
  liquidity?: number;
  volume?: number;
  competitive?: number;
  duration?: number;
  status?: string;
  resolution?: string;
  created_at?: string;
  updated_at?: string;
  markets: PolymarketMarket[];
  tags?: PolymarketTag[];
  series?: PolymarketSeries[];
  sports_event_id?: string;
  sports_metadata?: Record<string, unknown>;
  neg_risk_market_id?: string;
}

export interface PolymarketTag {
  id: string;
  label: string;
  slug: string;
  created_at?: string;
  updated_at?: string;
  featured?: boolean;
  forceShow?: boolean;
  publishedAt?: string;
}

export interface PolymarketSeries {
  id: string;
  title: string;
  slug: string;
  description?: string;
  image?: string;
  icon?: string;
  start_date?: string;
  end_date?: string;
}

export interface PolymarketComment {
  id: string;
  body: string;
  author: string;
  created_at: string;
  updated_at?: string;
  asset_id?: string;
  parent_id?: string;
}

export interface PolymarketSearchResult {
  events: PolymarketEvent[];
  tags: PolymarketTag[];
  profiles: PolymarketProfile[];
  total_results?: number;
  pagination?: {
    page: number;
    total_pages: number;
  };
}

export interface PolymarketProfile {
  address: string;
  username?: string;
  name?: string;
  bio?: string;
  profile_image?: string;
  pnl?: number;
  volume?: number;
  positions_count?: number;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PolymarketPaginated<T> {
  data: T[];
  limit: number;
  offset: number;
  total?: number;
  next_cursor?: string;
  count?: number;
}

// ─── Data API Types ───────────────────────────────────────────────────────────

export interface PolymarketPosition {
  market: string;
  asset: string;
  outcome: string;
  outcome_index: number;
  size: number;
  avg_price: number;
  cur_price?: number;
  initial_value?: number;
  current_value?: number;
  cash_pnl?: number;
  percent_pnl?: number;
  total_bought?: number;
  total_sold?: number;
  realized_pnl?: number;
  unrealized_pnl?: number;
  question?: string;
  end_date_iso?: string;
  closing_date?: string;
  liquidating?: boolean;
  redeemable?: boolean;
  mergeable?: boolean;
}

export interface PolymarketClosedPosition {
  market: string;
  asset: string;
  outcome: string;
  size: number;
  avg_price: number;
  exit_price?: number;
  cash_pnl?: number;
  percent_pnl?: number;
  closed_at?: string;
  question?: string;
}

export type PolymarketTradeType =
  | 'TRADE'
  | 'SPLIT'
  | 'MERGE'
  | 'REDEEM'
  | 'REWARD'
  | 'CONVERSION';

export type PolymarketTradeSide = 'BUY' | 'SELL';

export interface PolymarketTrade {
  id: string;
  proxy_wallet_address: string;
  outcome: string;
  asset_id: string;
  matched_amount: number;
  price: number;
  side: PolymarketTradeSide;
  type: PolymarketTradeType;
  timestamp: string;
  transaction_hash?: string;
  fee_rate_bps?: number;
  status?: string;
}

export interface PolymarketActivity {
  id: string;
  user: string;
  market?: string;
  outcome?: string;
  side?: PolymarketTradeSide;
  type: PolymarketTradeType;
  amount: number;
  price?: number;
  timestamp: string;
  transaction_hash?: string;
}

export type PolymarketLeaderboardCategory =
  | 'OVERALL'
  | 'POLITICS'
  | 'SPORTS'
  | 'CRYPTO'
  | 'FINANCE'
  | 'NEWS';

export type PolymarketLeaderboardTimePeriod =
  | 'DAY'
  | 'WEEK'
  | 'MONTH'
  | 'ALL';

export type PolymarketLeaderboardOrderBy = 'PNL' | 'VOL';

export interface PolymarketLeaderboardEntry {
  rank: number;
  proxy_wallet_address: string;
  name?: string;
  username?: string;
  profile_image?: string;
  pnl: number;
  volume: number;
  positions_count?: number;
  markets_traded?: number;
}

export interface PolymarketHolderData {
  proxy_wallet_address: string;
  amount: number;
  outcome: string;
  current_price?: number;
}

export interface PolymarketOpenInterest {
  market: string;
  token_id: string;
  open_interest: number;
  yes_open_interest?: number;
  no_open_interest?: number;
}

// ─── CLOB API Types ───────────────────────────────────────────────────────────

export interface PolymarketPrice {
  asset_id?: string;
  token_id?: string;
  price: number;
  buy?: number;
  sell?: number;
}

export interface PolymarketMidpoint {
  asset_id?: string;
  token_id?: string;
  mid: number;
}

export interface PolymarketSpread {
  asset_id?: string;
  token_id?: string;
  spread: number;
}

export interface PolymarketOrderLevel {
  price: number;
  size: number;
}

export interface PolymarketOrderBook {
  market?: string;
  asset_id?: string;
  token_id?: string;
  hash?: string;
  timestamp?: string;
  bids: PolymarketOrderLevel[];
  asks: PolymarketOrderLevel[];
}

export interface PolymarketPricePoint {
  t: number; // Unix timestamp
  p: number; // Price (0-1)
}

export interface PolymarketPriceHistory {
  history: PolymarketPricePoint[];
}

// ─── Query Parameter Types (for strong typing) ───────────────────────────────

export interface GammaMarketsFilter {
  id?: string;
  ids?: string;
  slug?: string;
  closed?: boolean;
  active?: boolean;
  archived?: boolean;
  new?: boolean;
  featured?: boolean;
  tag_id?: string;
  tag_slug?: string;
  related_tags?: string;
  liquidity_min?: number;
  liquidity_max?: number;
  volume_min?: number;
  volume_max?: number;
  start_date_min?: string;
  start_date_max?: string;
  end_date_min?: string;
  end_date_max?: string;
  order?: string;
  ascending?: boolean;
  limit?: number;
  offset?: number;
}

export interface GammaEventsFilter {
  id?: string;
  ids?: string;
  slug?: string;
  closed?: boolean;
  active?: boolean;
  archived?: boolean;
  tag_slug?: string;
  tag_id?: string;
  start_date_min?: string;
  end_date_max?: string;
  limit?: number;
  offset?: number;
}

export interface GammaSearchOptions {
  q: string;
  events_status?: string;
  limit_per_type?: number;
  page?: number;
  include_tags?: boolean;
  include_profiles?: boolean;
  events_tag?: string;
}

export interface DataPositionsFilter {
  user: string;
  market?: string;
  sizeThreshold?: number;
  redeemable?: boolean;
  mergeable?: boolean;
  title?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
}

export interface DataTradesFilter {
  user?: string;
  market?: string;
  limit?: number;
  offset?: number;
  type?: PolymarketTradeType;
  side?: PolymarketTradeSide;
  start?: string;
  end?: string;
  sortBy?: 'TIMESTAMP' | 'TOKENS' | 'CASH';
  sortDirection?: 'ASC' | 'DESC';
}

export interface DataLeaderboardFilter {
  category?: PolymarketLeaderboardCategory;
  timePeriod?: PolymarketLeaderboardTimePeriod;
  orderBy?: PolymarketLeaderboardOrderBy;
  limit?: number;
  offset?: number;
  user?: string;
  userName?: string;
}

export interface ClobPriceHistoryOptions {
  token_id: string;
  interval?: 'max' | '1m' | '1w' | '1d' | '6h' | '1h';
  fidelity?: number;
  start_ts?: number;
  end_ts?: number;
}
