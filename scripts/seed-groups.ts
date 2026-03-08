import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import { UserSchema } from '../libs/database/src/schemas/user.schema';
import { GroupSchema } from '../libs/database/src/schemas/group.schema';
import { GroupBetSchema } from '../libs/database/src/schemas/group-bet.schema';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
dotenv.config({ path: '../.env' });

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

type GroupSeed = {
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  isPublic: boolean;
};

function slugify(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

const PRIVATE_GROUPS: GroupSeed[] = [
  {
    name: 'Alpha Signals Private',
    description: 'High-conviction private forecasts and disciplined sizing.',
    category: 'Finance',
    imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&q=80',
    isPublic: false,
  },
  {
    name: 'Insider Pitch Room',
    description: 'Private sports position room focused on sharp market entries.',
    category: 'Sports',
    imageUrl: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&q=80',
    isPublic: false,
  },
  {
    name: 'Macro Pulse Collective',
    description: 'Private macro and policy crowd calls with strict accountability.',
    category: 'Politics',
    imageUrl: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200&q=80',
    isPublic: false,
  },
  {
    name: 'Contrarian Lab',
    description: 'Private contrarian desk for reflex and divergence markets.',
    category: 'Technology',
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80',
    isPublic: false,
  },
];

const PUBLIC_GROUPS: GroupSeed[] = [
  {
    name: 'Public Crypto Arena',
    description: 'Open discussion and prediction arena for crypto narratives.',
    category: 'Crypto',
    imageUrl: 'https://images.unsplash.com/photo-1640161704729-cbe966a08476?w=1200&q=80',
    isPublic: true,
  },
  {
    name: 'Premier League Hub',
    description: 'Open football forecasts, match ladders, and weekly recap plays.',
    category: 'Sports',
    imageUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=80',
    isPublic: true,
  },
  {
    name: 'Nairobi Markets Forum',
    description: 'Local market sentiment and one-time opportunity tracking.',
    category: 'Social',
    imageUrl: 'https://images.unsplash.com/photo-1611605698335-8b1569810432?w=1200&q=80',
    isPublic: true,
  },
  {
    name: 'Global Policy Watch',
    description: 'Open policy and election market debates across regions.',
    category: 'Politics',
    imageUrl: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200&q=80',
    isPublic: true,
  },
  {
    name: 'Tech Frontier Bets',
    description: 'Open tech product and AI adoption forecast market threads.',
    category: 'Technology',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80',
    isPublic: true,
  },
  {
    name: 'Open Odds Lounge',
    description: 'General public market lounge for mixed-category forecasting.',
    category: 'General',
    imageUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1200&q=80',
    isPublic: true,
  },
];

async function seedGroups() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI (or DATABASE_URL) is not defined.');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);

  const UserModel = mongoose.model('User', UserSchema);
  const GroupModel = mongoose.model('Group', GroupSchema);
  const GroupBetModel = mongoose.model('GroupBet', GroupBetSchema);

  try {
    const adminUser =
      (await UserModel.findOne({ role: 'admin' }).sort({ createdAt: 1 }).select('_id username email')) ||
      (await UserModel.findOne().sort({ createdAt: 1 }).select('_id username email'));

    if (!adminUser) {
      throw new Error('No users found. Seed users first (npm run seed:admin).');
    }

    const nonAdminUsers = await UserModel.find({ _id: { $ne: adminUser._id } })
      .sort({ createdAt: 1 })
      .select('_id username email')
      .limit(20);

    const publicCreators =
      nonAdminUsers.length > 0
        ? nonAdminUsers
        : [adminUser];

    console.log('Clearing existing groups and group markets...');
    await GroupBetModel.deleteMany({});
    await GroupModel.deleteMany({});
    await UserModel.updateMany({}, { $set: { groupMemberships: 0 } });

    const createdGroups: Array<{
      _id: mongoose.Types.ObjectId;
      name: string;
      isPublic: boolean;
      createdBy: mongoose.Types.ObjectId;
      slug: string;
    }> = [];

    for (let i = 0; i < PRIVATE_GROUPS.length; i += 1) {
      const seed = PRIVATE_GROUPS[i];
      const inviteCode = `PRV${String(i + 1).padStart(5, '0')}`;
      const doc = await GroupModel.create({
        name: seed.name,
        slug: slugify(seed.name),
        description: seed.description,
        category: seed.category,
        imageUrl: seed.imageUrl,
        isPublic: seed.isPublic,
        inviteCode,
        createdBy: adminUser._id,
        members: [
          {
            userId: adminUser._id,
            role: 'admin',
            joinedAt: new Date(),
          },
        ],
        memberCount: 1,
      });
      createdGroups.push({
        _id: doc._id,
        name: doc.name,
        isPublic: doc.isPublic,
        createdBy: adminUser._id,
        slug: doc.slug || slugify(doc.name),
      });
    }

    for (let i = 0; i < PUBLIC_GROUPS.length; i += 1) {
      const seed = PUBLIC_GROUPS[i];
      const creator = publicCreators[i % publicCreators.length];
      const doc = await GroupModel.create({
        name: seed.name,
        slug: slugify(seed.name),
        description: seed.description,
        category: seed.category,
        imageUrl: seed.imageUrl,
        isPublic: seed.isPublic,
        createdBy: creator._id,
        members: [
          {
            userId: creator._id,
            role: 'admin',
            joinedAt: new Date(),
          },
        ],
        memberCount: 1,
      });
      createdGroups.push({
        _id: doc._id,
        name: doc.name,
        isPublic: doc.isPublic,
        createdBy: creator._id,
        slug: doc.slug || slugify(doc.name),
      });
    }

    const betTemplates = [
      {
        title: 'Who tops this week?',
        description: 'Pick the strongest performer this week.',
        marketType: 'winner_takes_all',
        marketSubtype: 'poll',
        options: ['Team A', 'Team B', 'Team C'],
        buyInAmount: 250,
      },
      {
        title: 'Rank this quarter outcome',
        description: 'Order the outcomes from most to least likely.',
        marketType: 'odd_one_out',
        marketSubtype: 'ladder',
        options: ['Growth', 'Flat', 'Decline', 'Volatile'],
        buyInAmount: 300,
      },
      {
        title: 'Contrarian call check',
        description: 'Find the option the crowd underestimates.',
        marketType: 'odd_one_out',
        marketSubtype: 'divergence',
        options: ['Option X', 'Option Y', 'Option Z'],
        buyInAmount: 200,
      },
    ] as const;

    for (const group of createdGroups) {
      let activeBetsCount = 0;
      const seededBets = await Promise.all(
        betTemplates.map(async (template, index) => {
          const isSettled = index === 2;
          const status = isSettled ? 'settled' : 'active';
          if (!isSettled) {
            activeBetsCount += 1;
          }
          const betSlug = `${slugify(group.slug)}-${slugify(template.title)}-${index + 1}`;
          const now = new Date();
          return GroupBetModel.create({
            groupId: group._id,
            title: template.title,
            slug: betSlug,
            description: template.description,
            marketType: template.marketType,
            marketSubtype: template.marketSubtype,
            buyInAmount: template.buyInAmount,
            status,
            createdBy: group.createdBy,
            options: template.options,
            participants: [
              {
                userId: group.createdBy,
                selectedOption: template.options[0],
                hasConfirmed: false,
                hasDisagreed: false,
                isWinner: isSettled,
                payoutAmount: isSettled ? template.buyInAmount * 0.95 : 0,
                joinedAt: now,
              },
            ],
            totalPool: template.buyInAmount,
            platformFeeCollected: template.buyInAmount * 0.05,
            prizePoolAfterFees: template.buyInAmount * 0.95,
            payoutProcessed: isSettled,
            declaredWinnerId: isSettled ? group.createdBy : undefined,
            confirmations: isSettled ? 1 : 0,
            disagreements: 0,
          });
        }),
      );

      await GroupModel.updateOne(
        { _id: group._id },
        {
          $set: {
            totalBets: seededBets.length,
            activeBetsCount,
            totalVolume: seededBets.reduce((sum: number, bet: any) => sum + Number(bet.totalPool || 0), 0),
          },
        },
      );
    }

    const seededGroups = await GroupModel.find({})
      .select('members')
      .lean()
      .exec();

    const membershipCounts = new Map<string, number>();
    seededGroups.forEach((group: any) => {
      const members = Array.isArray(group.members) ? group.members : [];
      members.forEach((member: any) => {
        const userId = String(member?.userId || '').trim();
        if (!userId) return;
        membershipCounts.set(userId, (membershipCounts.get(userId) || 0) + 1);
      });
    });

    const bulkOps = Array.from(membershipCounts.entries()).map(([userId, count]) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(userId) },
        update: { $set: { groupMemberships: count } },
      },
    }));
    if (bulkOps.length > 0) {
      await UserModel.bulkWrite(bulkOps);
    }

    const privateCount = createdGroups.filter((group) => !group.isPublic).length;
    const publicCount = createdGroups.filter((group) => group.isPublic).length;

    console.log(`Seeded ${createdGroups.length} groups (${privateCount} private, ${publicCount} public).`);
    console.log(`Admin owner for private groups: ${adminUser.username} (${adminUser.email})`);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

seedGroups()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Group seeding failed:', error);
    process.exit(1);
  });
