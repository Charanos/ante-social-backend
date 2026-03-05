import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import { UserSchema } from '../libs/database/src/schemas/user.schema';
import { MarketSchema } from '../libs/database/src/schemas/market.schema';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

type SeedMarket = {
  title: string;
  description: string;
  betType: 'consensus' | 'reflex' | 'ladder' | 'prisoner_dilemma' | 'divergence';
  buyInAmount: number;
  tags: string[];
  outcomes: Array<{ optionText: string }>;
  mediaUrl?: string;
};

const DEFAULT_MARKETS: SeedMarket[] = [
  {
    title: 'Will Ethereum cross $4k by the end of the month?',
    description: 'Community consensus on ETH price movement for the current month.',
    betType: 'consensus',
    buyInAmount: 25,
    tags: ['crypto', 'eth', 'monthly'],
    outcomes: [{ optionText: 'Yes' }, { optionText: 'No' }],
    mediaUrl:
      'https://images.unsplash.com/photo-1622737133809-d95047b9e673?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Reflex: Market drops 10% in an hour. Your move?',
    description:
      'Fast-response reflex market: test your instinct during a sudden market dip.',
    betType: 'reflex',
    buyInAmount: 10,
    tags: ['reflex', 'trading'],
    outcomes: [
      { optionText: 'Panic Sell' },
      { optionText: 'Buy the Dip' },
      { optionText: 'HODL' },
    ],
    mediaUrl:
      'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Ladder: Top Tech Stocks for 2026',
    description: 'Rank the following tech giants by expected performance this year.',
    betType: 'ladder',
    buyInAmount: 15,
    tags: ['tech', 'stocks', 'ladder'],
    outcomes: [
      { optionText: 'Nvidia' },
      { optionText: 'Microsoft' },
      { optionText: 'Apple' },
    ],
    mediaUrl:
      'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: "Prisoner's Dilemma: The Creator Collab",
    description: 'Two creators collab. Share profits equally, or try to steal the audience?',
    betType: 'prisoner_dilemma',
    buyInAmount: 50,
    tags: ['social', 'dilemma', 'creators'],
    outcomes: [
      { optionText: 'Share (Cooperate)' },
      { optionText: 'Steal (Betray)' },
    ],
    mediaUrl:
      'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Divergence: The Next Big Social Network',
    description: 'Which platform will dominate next? Go with the obvious choice or the underdog.',
    betType: 'divergence',
    buyInAmount: 20,
    tags: ['social', 'trends', 'divergence'],
    outcomes: [
      { optionText: 'The Established App' },
      { optionText: 'The Niche Underdog' },
    ],
    mediaUrl:
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&auto=format&fit=crop&q=80',
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
