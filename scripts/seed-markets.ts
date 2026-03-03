import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import { UserSchema } from '../libs/database/src/schemas/user.schema';
import { MarketSchema } from '../libs/database/src/schemas/market.schema';

dotenv.config({ path: '../.env' });

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

type SeedMarket = {
  title: string;
  description: string;
  betType: 'consensus' | 'reflex' | 'ladder' | 'prisoner_dilemma' | 'syndicate';
  buyInAmount: number;
  tags: string[];
  outcomes: Array<{ optionText: string }>;
  mediaUrl?: string;
};

const DEFAULT_MARKETS: SeedMarket[] = [
  {
    title: 'Will BTC close above $110k this week?',
    description: 'Community market forecasting weekly BTC close against the $110k threshold.',
    betType: 'consensus',
    buyInAmount: 25,
    tags: ['crypto', 'btc', 'weekly'],
    outcomes: [{ optionText: 'Yes' }, { optionText: 'No' }],
    mediaUrl:
      'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Which team wins Sunday Night Football?',
    description: 'Single-game market for SNF winner prediction.',
    betType: 'consensus',
    buyInAmount: 10,
    tags: ['sports', 'nfl', 'snf'],
    outcomes: [{ optionText: 'Home Team' }, { optionText: 'Away Team' }],
    mediaUrl:
      'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Reflex: First reaction to market crash headline',
    description:
      'Fast-response reflex market: pick your instinctive reaction to a breaking market crash alert.',
    betType: 'reflex',
    buyInAmount: 5,
    tags: ['reflex', 'behavioral'],
    outcomes: [
      { optionText: 'Buy the dip' },
      { optionText: 'Sell immediately' },
      { optionText: 'Wait and watch' },
    ],
    mediaUrl:
      'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Ladder: Rank AI companies by 2026 revenue growth',
    description: 'Rank the listed companies in the exact order the majority expects.',
    betType: 'ladder',
    buyInAmount: 15,
    tags: ['ai', 'ladder', 'business'],
    outcomes: [
      { optionText: 'Company A' },
      { optionText: 'Company B' },
      { optionText: 'Company C' },
    ],
    mediaUrl:
      'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&auto=format&fit=crop&q=80',
  },
];

async function seedMarkets() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI (or DATABASE_URL) is not defined in .env');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);

  const UserModel = mongoose.model('User', UserSchema);
  const MarketModel = mongoose.model('Market', MarketSchema);

  try {
    const adminUser =
      (await UserModel.findOne({ role: 'admin' }).sort({ createdAt: 1 })) ||
      (await UserModel.findOne().sort({ createdAt: 1 }));

    if (!adminUser) {
      throw new Error('No users found. Run seed-admin.ts first.');
    }

    console.log('Clearing existing markets...');
    await MarketModel.deleteMany({});

    const now = Date.now();
    let createdCount = 0;

    for (let i = 0; i < DEFAULT_MARKETS.length; i += 1) {
      const seed = DEFAULT_MARKETS[i];
      const exists = await MarketModel.findOne({ title: seed.title, isDeleted: { $ne: true } });
      if (exists) {
        console.log(`Skipping existing market: ${seed.title}`);
        continue;
      }

      const closeTime = new Date(now + (i + 1) * 24 * 60 * 60 * 1000);
      const settlementTime = new Date(closeTime.getTime() + 60 * 60 * 1000);

      await MarketModel.create({
        title: seed.title,
        description: seed.description,
        betType: seed.betType,
        marketDuration: 'daily',
        buyInAmount: seed.buyInAmount,
        minParticipants: 2,
        maxParticipants: 5000,
        closeTime,
        settlementTime,
        status: 'active',
        settlementMethod: 'admin_report',
        oddsType: 'pari_mutuel',
        outcomes: seed.outcomes.map((outcome) => ({
          optionText: outcome.optionText,
          participantCount: 0,
          totalAmount: 0,
          mediaType: 'none',
        })),
        tags: seed.tags,
        mediaUrl: seed.mediaUrl,
        mediaType: seed.mediaUrl ? 'image' : 'none',
        regionsAllowed: [],
        regionsBlocked: [],
        ageRestriction: 18,
        requiresIdentityCheck: false,
        createdBy: adminUser._id,
        lastEditedBy: adminUser._id,
      });

      createdCount += 1;
      console.log(`Created market: ${seed.title}`);
    }

    console.log(`Seed complete. New markets created: ${createdCount}`);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

seedMarkets()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Market seeding failed:', error);
    process.exit(1);
  });
