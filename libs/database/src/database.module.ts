import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User, UserSchema } from './schemas/user.schema';
import { Wallet, WalletSchema } from './schemas/wallet.schema';
import { Market, MarketSchema } from './schemas/market.schema';
import { MarketBet, MarketBetSchema } from './schemas/market-bet.schema';
import { Group, GroupSchema } from './schemas/group.schema';
import { GroupBet, GroupBetSchema } from './schemas/group-bet.schema';
import { Transaction, TransactionSchema } from './schemas/transaction.schema';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { DailyLimit, DailyLimitSchema } from './schemas/daily-limit.schema';
import { ComplianceFlag, ComplianceFlagSchema } from './schemas/compliance-flag.schema';
import { ExchangeRate, ExchangeRateSchema } from './schemas/exchange-rate.schema';
import { ActivityLog, ActivityLogSchema } from './schemas/activity-log.schema';
import {
  RecurringMarketTemplate,
  RecurringMarketTemplateSchema,
} from './schemas/recurring-market-template.schema';
import { Blog, BlogSchema } from './schemas/blog.schema';
import { NewsletterSubscriber, NewsletterSubscriberSchema } from './schemas/newsletter-subscriber.schema';
import { LandingPage, LandingPageSchema } from './schemas/landing-page.schema';
import { UserRepository } from './repositories/user.repository';
import { WalletRepository } from './repositories/wallet.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { MarketRepository } from './repositories/market.repository';

const schemas = [
  { name: User.name, schema: UserSchema },
  { name: Wallet.name, schema: WalletSchema },
  { name: Market.name, schema: MarketSchema },
  { name: MarketBet.name, schema: MarketBetSchema },
  { name: Group.name, schema: GroupSchema },
  { name: GroupBet.name, schema: GroupBetSchema },
  { name: Transaction.name, schema: TransactionSchema },
  { name: Notification.name, schema: NotificationSchema },
  { name: AuditLog.name, schema: AuditLogSchema },
  { name: DailyLimit.name, schema: DailyLimitSchema },
  { name: ComplianceFlag.name, schema: ComplianceFlagSchema },
  { name: ExchangeRate.name, schema: ExchangeRateSchema },
  { name: ActivityLog.name, schema: ActivityLogSchema },
  { name: RecurringMarketTemplate.name, schema: RecurringMarketTemplateSchema },
  { name: Blog.name, schema: BlogSchema },
  { name: NewsletterSubscriber.name, schema: NewsletterSubscriberSchema },
  { name: LandingPage.name, schema: LandingPageSchema },
];

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('MONGODB_URI') || config.get<string>('DATABASE_URL');

        if (!uri) {
          throw new Error('Missing MongoDB connection string. Set MONGODB_URI or DATABASE_URL.');
        }

        return {
          uri,
          retryAttempts: 3,
          retryDelay: 1000,
        };
      },
    }),
    MongooseModule.forFeature(schemas),
  ],
  providers: [UserRepository, WalletRepository, TransactionRepository, MarketRepository],
  exports: [
    MongooseModule,
    UserRepository,
    WalletRepository,
    TransactionRepository,
    MarketRepository,
  ],
})
export class DatabaseModule {}
