export { DatabaseModule } from './database.module';

// Schemas
export { User, UserSchema, UserDocument } from './schemas/user.schema';
export { Wallet, WalletSchema, WalletDocument } from './schemas/wallet.schema';
export { Market, MarketSchema, MarketDocument, MarketOption, MarketOptionSchema } from './schemas/market.schema';
export { MarketBet, MarketBetSchema, MarketBetDocument } from './schemas/market-bet.schema';
export { Group, GroupSchema, GroupDocument, GroupMember, GroupMemberSchema } from './schemas/group.schema';
export { GroupBet, GroupBetSchema, GroupBetDocument } from './schemas/group-bet.schema';
export { Transaction, TransactionSchema, TransactionDocument } from './schemas/transaction.schema';
export { Notification, NotificationSchema, NotificationDocument } from './schemas/notification.schema';
export { AuditLog, AuditLogSchema, AuditLogDocument } from './schemas/audit-log.schema';

// New schemas
export { DailyLimit, DailyLimitSchema, DailyLimitDocument } from './schemas/daily-limit.schema';
export { ComplianceFlag, ComplianceFlagSchema, ComplianceFlagDocument, FlagStatus, FlagReason } from './schemas/compliance-flag.schema';
export { ExchangeRate, ExchangeRateSchema, ExchangeRateDocument } from './schemas/exchange-rate.schema';
export { ActivityLog, ActivityLogSchema, ActivityLogDocument, ActivityType } from './schemas/activity-log.schema';
export {
  RecurringMarketTemplate,
  RecurringMarketTemplateSchema,
  RecurringMarketTemplateDocument,
} from './schemas/recurring-market-template.schema';
export { Blog, BlogSchema, BlogDocument } from './schemas/blog.schema';
export { NewsletterSubscriber, NewsletterSubscriberSchema, NewsletterSubscriberDocument } from './schemas/newsletter-subscriber.schema';
export { LandingPage, LandingPageSchema, LandingPageDocument } from './schemas/landing-page.schema';

// Repositories
export * from './repositories';
