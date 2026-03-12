import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import { UserSchema } from '../libs/database/src/schemas/user.schema';
import { MarketSchema } from '../libs/database/src/schemas/market.schema';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

// Curated Unsplash images per category
const IMAGES = {
  crypto: [
    'https://images.unsplash.com/photo-1622737133809-d95047b9e673?w=1200&q=80',
    'https://images.unsplash.com/photo-1640161704729-cbe966a08476?w=1200&q=80',
    'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=1200&q=80',
  ],
  sports: [
    'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1200&q=80',
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=80',
    'https://images.unsplash.com/photo-1540747913346-19212a4b423e?w=1200&q=80',
    'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&q=80',
    'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&q=80',
  ],
  finance: [
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&q=80',
    'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=1200&q=80',
    'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=1200&q=80',
  ],
  politics: [
    'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200&q=80',
    'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200&q=80',
  ],
  technology: [
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80',
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80',
  ],
  social: [
    'https://images.unsplash.com/photo-1611605698335-8b1569810432?w=1200&q=80',
  ],
};

function img(category: keyof typeof IMAGES, idx = 0) {
  const arr = IMAGES[category] || IMAGES.finance;
  return arr[idx % arr.length];
}

// Option-level images (flags, logos, etc.)
const FLAGS = {
  brazil: 'https://flagcdn.com/w320/br.png',
  argentina: 'https://flagcdn.com/w320/ar.png',
  france: 'https://flagcdn.com/w320/fr.png',
  germany: 'https://flagcdn.com/w320/de.png',
  spain: 'https://flagcdn.com/w320/es.png',
  england: 'https://flagcdn.com/w320/gb-eng.png',
  portugal: 'https://flagcdn.com/w320/pt.png',
  kenya: 'https://flagcdn.com/w320/ke.png',
  southafrica: 'https://flagcdn.com/w320/za.png',
  egypt: 'https://flagcdn.com/w320/eg.png',
  nigeria: 'https://flagcdn.com/w320/ng.png',
};

type SeedOutcome = {
  optionText: string;
  mediaUrl?: string;
  mediaType?: string;
};

type SeedMarket = {
  title: string;
  description: string;
  betType: 'consensus' | 'reflex' | 'ladder' | 'betrayal' | 'divergence' | 'prisoner_dilemma';
  buyInAmount: number;
  buyInCurrency: 'KSH' | 'USD';
  category: string;
  tags: string[];
  outcomes: SeedOutcome[];
  mediaUrl?: string;
  isFeatured?: boolean;
  isRecurring?: boolean;
  isTrending?: boolean;
  scenario?: string;
  closeDaysFromNow?: number;
};

const SEED_MARKETS: SeedMarket[] = [
  // ─── FEATURED & TRENDING ──────────────────────────────────────────────────
  {
    title: "Newcomb's Paradox: The $1,000,000 Dilemma",
    description: "A near-perfect predictor tests your rationality. Box A ($1,000) or Box B ($1,000,000)?",
    scenario: "In this famous thought experiment, a Predictor presents you with two boxes. Box A always contains $1,000. Box B contains either $1,000,000 or nothing. The Predictor has already made their move based on whether they predict you will take both boxes or only Box B. This explores the tension between Causal and Evidential decision theories, much like the logic of nuclear deterrence (MAD).",
    betType: 'reflex',
    buyInAmount: 100,
    buyInCurrency: 'KSH',
    category: 'social',
    tags: ['philosophy', 'game-theory', 'reflex', 'newcomb', 'deterrence'],
    isFeatured: true,
    isTrending: true,
    isRecurring: false,
    closeDaysFromNow: 30,
    mediaUrl: 'https://images.unsplash.com/photo-1518133910546-b6c2fb7d79e3?w=1200&q=80', // Books/Knowledge
    outcomes: [
      { optionText: 'One-Box (Box B only)', mediaUrl: 'https://img.icons8.com/emoji/96/package.png', mediaType: 'image' },
      { optionText: 'Two-Box (Box A + Box B)', mediaUrl: 'https://img.icons8.com/emoji/96/box-is-open.png', mediaType: 'image' },
    ],
  },
  // ─── CONSENSUS ──────────────────────────────────────────────────────────────
  {
    title: 'Will NVIDIA stock close above $150 by March 31, 2026?',
    description: 'NVIDIA\'s stock price at market close on March 31, 2026. Settled using official NASDAQ closing price.',
    betType: 'consensus',
    buyInAmount: 100,
    buyInCurrency: 'KSH',
    category: 'finance',
    tags: ['stocks', 'nvidia', 'tech'],
    isFeatured: true,
    isRecurring: false,
    closeDaysFromNow: 25,
    mediaUrl: img('finance', 0),
    outcomes: [
      { optionText: 'Yes, above $150', mediaUrl: 'https://logo.clearbit.com/nvidia.com', mediaType: 'image' },
      { optionText: 'No, $150 or below', mediaUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&q=80', mediaType: 'image' },
    ],
  },
  {
    title: 'Which country will host the 2026 African Union Summit?',
    description: 'Official AU announcement for 2026 summit host nation. Settled using official AU press release.',
    betType: 'consensus',
    buyInAmount: 50,
    buyInCurrency: 'KSH',
    category: 'politics',
    tags: ['africa', 'politics', 'au'],
    isFeatured: true,
    isRecurring: false,
    closeDaysFromNow: 10,
    mediaUrl: img('politics', 0),
    outcomes: [
      { optionText: 'Kenya', mediaUrl: FLAGS.kenya, mediaType: 'image' },
      { optionText: 'South Africa', mediaUrl: FLAGS.southafrica, mediaType: 'image' },
      { optionText: 'Egypt', mediaUrl: FLAGS.egypt, mediaType: 'image' },
      { optionText: 'Nigeria', mediaUrl: FLAGS.nigeria, mediaType: 'image' },
      { optionText: 'Other', mediaType: 'none' },
    ],
  },
  {
    title: 'Which team will win the 2026 FIFA World Cup?',
    description: 'Winner of the 2026 FIFA World Cup final. Settled after the final match result.',
    betType: 'consensus',
    buyInAmount: 200,
    buyInCurrency: 'KSH',
    category: 'sports',
    tags: ['football', 'worldcup', 'fifa'],
    isFeatured: true,
    isRecurring: false,
    closeDaysFromNow: 134,
    mediaUrl: img('sports', 0),
    outcomes: [
      { optionText: 'Brazil', mediaUrl: FLAGS.brazil, mediaType: 'image' },
      { optionText: 'Argentina', mediaUrl: FLAGS.argentina, mediaType: 'image' },
      { optionText: 'France', mediaUrl: FLAGS.france, mediaType: 'image' },
      { optionText: 'Germany', mediaUrl: FLAGS.germany, mediaType: 'image' },
      { optionText: 'Spain', mediaUrl: FLAGS.spain, mediaType: 'image' },
      { optionText: 'England', mediaUrl: FLAGS.england, mediaType: 'image' },
      { optionText: 'Portugal', mediaUrl: FLAGS.portugal, mediaType: 'image' },
    ],
  },
  {
    title: 'Will Bitcoin be above $100,000 by end of March 2026?',
    description: 'Bitcoin price at midnight UTC on March 31, 2026. Settled using CoinMarketCap average.',
    betType: 'consensus',
    buyInAmount: 100,
    buyInCurrency: 'KSH',
    category: 'crypto',
    tags: ['bitcoin', 'crypto', 'price'],
    isFeatured: true,
    isRecurring: true,
    closeDaysFromNow: 25,
    mediaUrl: img('crypto', 0),
    outcomes: [
      { optionText: 'Yes, above $100k', mediaUrl: 'https://images.unsplash.com/photo-1640161704729-cbe966a08476?w=200&q=80', mediaType: 'image' },
      { optionText: 'No, below $100k', mediaUrl: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=200&q=80', mediaType: 'image' },
    ],
  },
  {
    title: 'Which Kenyan politician gains most Twitter followers this week?',
    description: 'Track social media growth for Kenya\'s top political figures. Settled via public follower count snapshots.',
    betType: 'consensus',
    buyInAmount: 20,
    buyInCurrency: 'KSH',
    category: 'politics',
    tags: ['kenya', 'politics', 'social-media'],
    isFeatured: false,
    isRecurring: true,
    closeDaysFromNow: 7,
    mediaUrl: img('politics', 1),
    outcomes: [
      { optionText: 'William Ruto' },
      { optionText: 'Raila Odinga' },
      { optionText: 'Kalonzo Musyoka' },
      { optionText: 'Martha Karua' },
    ],
  },

  // ─── REFLEX ─────────────────────────────────────────────────────────────────
  {
    title: 'Champions League 2025/26 Final Winner — Contrarian Bet',
    description: 'Bet against the crowd! Smaller winning group = bigger payout. Settled after UCL Final.',
    betType: 'reflex',
    buyInAmount: 250,
    buyInCurrency: 'KSH',
    category: 'sports',
    tags: ['football', 'ucl', 'reflex'],
    isFeatured: true,
    isRecurring: false,
    closeDaysFromNow: 85,
    mediaUrl: img('sports', 1),
    outcomes: [
      { optionText: 'Real Madrid', mediaUrl: 'https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg', mediaType: 'image' },
      { optionText: 'Manchester City', mediaUrl: 'https://upload.wikimedia.org/wikipedia/en/e/eb/Manchester_City_FC_badge.svg', mediaType: 'image' },
      { optionText: 'Bayern Munich', mediaUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/1b/FC_Bayern_M%C3%BCnchen_logo_%282002%E2%80%932017%29.svg', mediaType: 'image' },
      { optionText: 'PSG', mediaUrl: 'https://upload.wikimedia.org/wikipedia/en/a/a7/Paris_Saint-Germain_F.C..svg', mediaType: 'image' },
      { optionText: 'Liverpool', mediaUrl: 'https://upload.wikimedia.org/wikipedia/en/0/0c/Liverpool_FC.svg', mediaType: 'image' },
      { optionText: 'Arsenal', mediaUrl: 'https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg', mediaType: 'image' },
    ],
  },
  {
    title: 'Which party wins US House majority in 2026 midterms? (Minority wins big)',
    description: 'Contrarian bet on 2026 US midterm results. Smaller winning group gets exponential returns.',
    betType: 'reflex',
    buyInAmount: 150,
    buyInCurrency: 'KSH',
    category: 'politics',
    tags: ['usa', 'politics', 'midterms'],
    isFeatured: false,
    isRecurring: false,
    closeDaysFromNow: 242,
    mediaUrl: img('politics', 0),
    outcomes: [
      { optionText: 'Democrats' },
      { optionText: 'Republicans' },
      { optionText: 'Tied / No Clear Majority' },
    ],
  },
  {
    title: 'Tesla Stock: Biggest % Move in Q1 2026? (Bet the unexpected)',
    description: 'What is Tesla\'s biggest Q1 move? Contrarians win big. Settled using Q1 high/low vs Dec 31 close.',
    betType: 'reflex',
    buyInAmount: 100,
    buyInCurrency: 'KSH',
    category: 'finance',
    tags: ['tesla', 'stocks', 'reflex'],
    isFeatured: false,
    isRecurring: true,
    closeDaysFromNow: 25,
    mediaUrl: img('finance', 1),
    outcomes: [
      { optionText: 'Up 20%+', mediaUrl: 'https://logo.clearbit.com/tesla.com', mediaType: 'image' },
      { optionText: 'Down 20%+', mediaUrl: 'https://logo.clearbit.com/tesla.com', mediaType: 'image' },
      { optionText: 'Flat (-10% to +10%)', mediaUrl: 'https://logo.clearbit.com/tesla.com', mediaType: 'image' },
      { optionText: 'Moderate (10-20% either way)', mediaUrl: 'https://logo.clearbit.com/tesla.com', mediaType: 'image' },
    ],
  },
  {
    title: 'Will Arsenal FINALLY win the Premier League 2025/26? (Contrarian)',
    description: 'Bet against the majority! Arsenal\'s title drought continues or ends? Minority wins multiply.',
    betType: 'reflex',
    buyInAmount: 200,
    buyInCurrency: 'KSH',
    category: 'sports',
    tags: ['arsenal', 'premier-league', 'reflex'],
    isFeatured: false,
    isRecurring: false,
    closeDaysFromNow: 78,
    mediaUrl: img('sports', 2),
    outcomes: [
      { optionText: 'Yes, Arsenal wins', mediaUrl: 'https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg', mediaType: 'image' },
      { optionText: 'No, someone else wins', mediaUrl: 'https://img.icons8.com/color/96/football2.png', mediaType: 'image' },
    ],
  },
  {
    title: 'SpaceX Mars Mission 2026 — Long shot pays big',
    description: 'Predict the unpredictable! Smallest winning group gets massive returns.',
    betType: 'reflex',
    buyInAmount: 50,
    buyInCurrency: 'KSH',
    category: 'technology',
    tags: ['spacex', 'mars', 'tech'],
    isFeatured: false,
    isRecurring: false,
    closeDaysFromNow: 300,
    mediaUrl: img('technology', 0),
    outcomes: [
      { optionText: 'Successful landing', mediaUrl: 'https://logo.clearbit.com/spacex.com', mediaType: 'image' },
      { optionText: 'Launch but no landing', mediaUrl: 'https://logo.clearbit.com/spacex.com', mediaType: 'image' },
      { optionText: 'No launch attempt', mediaUrl: 'https://logo.clearbit.com/spacex.com', mediaType: 'image' },
      { optionText: 'Mission scrubbed', mediaUrl: 'https://logo.clearbit.com/spacex.com', mediaType: 'image' },
    ],
  },

  // ─── LADDER ─────────────────────────────────────────────────────────────────
  {
    title: 'Premier League 2025/26 Final Standings — Exact Top 4 Order',
    description: 'Predict EXACT finishing order of top 4 teams. All 4 must be correct to win.',
    betType: 'ladder',
    buyInAmount: 500,
    buyInCurrency: 'KSH',
    category: 'sports',
    tags: ['premier-league', 'ladder', 'football'],
    isFeatured: true,
    isRecurring: false,
    closeDaysFromNow: 78,
    mediaUrl: img('sports', 3),
    outcomes: [
      { optionText: 'Man City', mediaUrl: 'https://upload.wikimedia.org/wikipedia/en/e/eb/Manchester_City_FC_badge.svg', mediaType: 'image' },
      { optionText: 'Arsenal', mediaUrl: 'https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg', mediaType: 'image' },
      { optionText: 'Liverpool', mediaUrl: 'https://upload.wikimedia.org/wikipedia/en/0/0c/Liverpool_FC.svg', mediaType: 'image' },
      { optionText: 'Chelsea', mediaUrl: 'https://upload.wikimedia.org/wikipedia/en/c/cc/Chelsea_FC.svg', mediaType: 'image' },
    ],
  },
  {
    title: 'NBA 2026 Playoffs — Predict Conference Finals Winners in Order',
    description: 'Predict exact sequence: East champ, West champ, Finals winner. All 3 must be right.',
    betType: 'ladder',
    buyInAmount: 1000,
    buyInCurrency: 'KSH',
    category: 'sports',
    tags: ['nba', 'basketball', 'ladder'],
    isFeatured: false,
    isRecurring: false,
    closeDaysFromNow: 110,
    mediaUrl: img('sports', 4),
    outcomes: [
      { optionText: 'Lakers' },
      { optionText: 'Celtics' },
      { optionText: 'Nuggets' },
      { optionText: 'Bucks' },
      { optionText: 'Warriors' },
      { optionText: 'Heat' },
    ],
  },
  {
    title: 'FAANG Q1 2026 Earnings — Rank by Revenue Growth %',
    description: 'Predict exact ranking of FAANG by Q1 YoY revenue growth. Settled after earnings reports.',
    betType: 'ladder',
    buyInAmount: 500,
    buyInCurrency: 'KSH',
    category: 'finance',
    tags: ['faang', 'earnings', 'ladder'],
    isFeatured: false,
    isRecurring: true,
    closeDaysFromNow: 55,
    mediaUrl: img('finance', 2),
    outcomes: [
      { optionText: 'Meta', mediaUrl: 'https://logo.clearbit.com/meta.com', mediaType: 'image' },
      { optionText: 'Apple', mediaUrl: 'https://logo.clearbit.com/apple.com', mediaType: 'image' },
      { optionText: 'Amazon', mediaUrl: 'https://logo.clearbit.com/amazon.com', mediaType: 'image' },
      { optionText: 'Netflix', mediaUrl: 'https://logo.clearbit.com/netflix.com', mediaType: 'image' },
      { optionText: 'Google', mediaUrl: 'https://logo.clearbit.com/google.com', mediaType: 'image' },
    ],
  },
  {
    title: 'Top 5 Crypto by Market Cap — Exact Order June 2026',
    description: 'Predict exact top 5 ranking. Perfect sequence required. Settled via CoinMarketCap.',
    betType: 'ladder',
    buyInAmount: 250,
    buyInCurrency: 'KSH',
    category: 'crypto',
    tags: ['crypto', 'market-cap', 'ladder'],
    isFeatured: false,
    isRecurring: true,
    closeDaysFromNow: 116,
    mediaUrl: img('crypto', 1),
    outcomes: [
      { optionText: 'Bitcoin', mediaUrl: 'https://cryptologos.cc/logos/bitcoin-btc-logo.png', mediaType: 'image' },
      { optionText: 'Ethereum', mediaUrl: 'https://cryptologos.cc/logos/ethereum-eth-logo.png', mediaType: 'image' },
      { optionText: 'BNB', mediaUrl: 'https://cryptologos.cc/logos/bnb-bnb-logo.png', mediaType: 'image' },
      { optionText: 'Solana', mediaUrl: 'https://cryptologos.cc/logos/solana-sol-logo.png', mediaType: 'image' },
      { optionText: 'XRP', mediaUrl: 'https://cryptologos.cc/logos/xrp-xrp-logo.png', mediaType: 'image' },
    ],
  },
  {
    title: 'African Elections 2026 — Predict Exact Winner Sequence',
    description: 'Predict winners in exact sequence for Ghana, Zambia, Somalia. All 3 must be correct.',
    betType: 'ladder',
    buyInAmount: 1000,
    buyInCurrency: 'KSH',
    category: 'politics',
    tags: ['africa', 'elections', 'ladder'],
    isFeatured: false,
    isRecurring: false,
    closeDaysFromNow: 300,
    mediaUrl: img('politics', 0),
    outcomes: [
      { optionText: 'Ghana — NPP wins' },
      { optionText: 'Ghana — NDC wins' },
      { optionText: 'Zambia — UPND wins' },
      { optionText: 'Zambia — PF wins' },
    ],
  },

  // ─── BETRAYAL ────────────────────────────────────────────────────────────────
  {
    title: 'Kenya GDP Growth 2026 — Cooperate or Betray?',
    description: 'Will Kenya\'s GDP grow 5%+ in 2026? Classic betrayal: cooperators share, betrayers steal if right.',
    betType: 'betrayal',
    buyInAmount: 1000,
    buyInCurrency: 'KSH',
    category: 'finance',
    tags: ['kenya', 'gdp', 'betrayal'],
    isFeatured: true,
    isRecurring: false,
    closeDaysFromNow: 300,
    mediaUrl: img('finance', 0),
    outcomes: [
      { optionText: 'Cooperate (Yes — GDP grows 5%+)' },
      { optionText: 'Betray (Yes — GDP grows 5%+)' },
      { optionText: 'Cooperate (No — GDP under 5%)' },
      { optionText: 'Betray (No — GDP under 5%)' },
    ],
  },
  {
    title: 'Bitcoin hits $100k in 2026 — Trust others or Betray?',
    description: 'Game theory at its finest. Cooperators share evenly if right. Betrayers steal from cooperators.',
    betType: 'betrayal',
    buyInAmount: 500,
    buyInCurrency: 'KSH',
    category: 'crypto',
    tags: ['bitcoin', 'betrayal', 'game-theory'],
    isFeatured: true,
    isRecurring: false,
    closeDaysFromNow: 300,
    mediaUrl: img('crypto', 2),
    outcomes: [
      { optionText: 'Cooperate (Yes)' },
      { optionText: 'Betray (Yes)' },
      { optionText: 'Cooperate (No)' },
      { optionText: 'Betray (No)' },
    ],
  },
  {
    title: 'UCL Final 2026 Total Goals — Cooperate or Defect?',
    description: 'Trust the crowd or go rogue? Betrayers take cooperators\' money if right. Universal betrayal = chaos.',
    betType: 'betrayal',
    buyInAmount: 300,
    buyInCurrency: 'KSH',
    category: 'sports',
    tags: ['ucl', 'football', 'betrayal'],
    isFeatured: false,
    isRecurring: false,
    closeDaysFromNow: 85,
    mediaUrl: img('sports', 0),
    outcomes: [
      { optionText: 'Cooperate (Over 2.5 goals)' },
      { optionText: 'Betray (Over 2.5 goals)' },
      { optionText: 'Cooperate (Under 2.5 goals)' },
      { optionText: 'Betray (Under 2.5 goals)' },
    ],
  },
  {
    title: 'US Inflation Below 3% by June 2026 — Trust or Betray?',
    description: 'Economic game theory. Cooperate for fair split or betray for winner-takes-all.',
    betType: 'betrayal',
    buyInAmount: 750,
    buyInCurrency: 'KSH',
    category: 'finance',
    tags: ['inflation', 'usa', 'betrayal'],
    isFeatured: false,
    isRecurring: false,
    closeDaysFromNow: 116,
    mediaUrl: img('finance', 1),
    outcomes: [
      { optionText: 'Cooperate (Yes, below 3%)' },
      { optionText: 'Betray (Yes, below 3%)' },
      { optionText: 'Cooperate (No, above 3%)' },
      { optionText: 'Betray (No, above 3%)' },
    ],
  },
  {
    title: 'Haaland wins Golden Boot 2025/26 — Cooperate or Betray?',
    description: 'Classic prisoner\'s dilemma in sports betting. Cooperators share, betrayers steal if correct.',
    betType: 'betrayal',
    buyInAmount: 400,
    buyInCurrency: 'KSH',
    category: 'sports',
    tags: ['haaland', 'premier-league', 'betrayal'],
    isFeatured: false,
    isRecurring: false,
    closeDaysFromNow: 78,
    mediaUrl: img('sports', 2),
    outcomes: [
      { optionText: 'Cooperate (Yes, Haaland wins)' },
      { optionText: 'Betray (Yes, Haaland wins)' },
      { optionText: 'Cooperate (No, someone else)' },
      { optionText: 'Betray (No, someone else)' },
    ],
  },

  // ─── DIVERGENCE ──────────────────────────────────────────────────────────────
  {
    title: 'Next Social Media App to Hit 1B Users?',
    description: 'Go with the obvious choice or the underdog. Minority picks earn a multiplier bonus.',
    betType: 'divergence',
    buyInAmount: 200,
    buyInCurrency: 'KSH',
    category: 'technology',
    tags: ['social-media', 'tech', 'divergence'],
    isFeatured: true,
    isRecurring: false,
    closeDaysFromNow: 200,
    mediaUrl: img('technology', 1),
    outcomes: [
      { optionText: 'TikTok', mediaUrl: 'https://logo.clearbit.com/tiktok.com', mediaType: 'image' },
      { optionText: 'Instagram Threads', mediaUrl: 'https://logo.clearbit.com/threads.net', mediaType: 'image' },
      { optionText: 'X (Twitter)', mediaUrl: 'https://logo.clearbit.com/twitter.com', mediaType: 'image' },
      { optionText: 'Bluesky', mediaUrl: 'https://logo.clearbit.com/bsky.app', mediaType: 'image' },
      { optionText: 'None of the above' },
    ],
  },
  {
    title: 'Which AI tool replaces human jobs the most in 2026?',
    description: 'Bet on the minority view. Least popular correct answer multiplies your winnings.',
    betType: 'divergence',
    buyInAmount: 150,
    buyInCurrency: 'KSH',
    category: 'technology',
    tags: ['ai', 'jobs', 'divergence'],
    isFeatured: false,
    isRecurring: true,
    closeDaysFromNow: 300,
    mediaUrl: img('technology', 0),
    outcomes: [
      { optionText: 'ChatGPT / OpenAI', mediaUrl: 'https://logo.clearbit.com/openai.com', mediaType: 'image' },
      { optionText: 'Google Gemini', mediaUrl: 'https://logo.clearbit.com/google.com', mediaType: 'image' },
      { optionText: 'GitHub Copilot', mediaUrl: 'https://logo.clearbit.com/github.com', mediaType: 'image' },
      { optionText: 'Midjourney / DALL-E', mediaUrl: 'https://logo.clearbit.com/midjourney.com', mediaType: 'image' },
      { optionText: 'Autonomous Agents', mediaUrl: 'https://logo.clearbit.com/anthropic.com', mediaType: 'image' },
    ],
  },
  {
    title: 'Ethereum vs Solana — Which dominates DeFi in H1 2026?',
    description: 'Minority position wins multiplier. Go with the contrarian view on the DeFi race.',
    betType: 'divergence',
    buyInAmount: 300,
    buyInCurrency: 'KSH',
    category: 'crypto',
    tags: ['ethereum', 'solana', 'defi', 'divergence'],
    isFeatured: false,
    isRecurring: false,
    closeDaysFromNow: 116,
    mediaUrl: img('crypto', 0),
    outcomes: [
      { optionText: 'Ethereum by a mile', mediaUrl: 'https://cryptologos.cc/logos/ethereum-eth-logo.png', mediaType: 'image' },
      { optionText: 'Solana overtakes', mediaUrl: 'https://cryptologos.cc/logos/solana-sol-logo.png', mediaType: 'image' },
      { optionText: 'New chain emerges', mediaUrl: 'https://cryptologos.cc/logos/avalanche-avax-logo.png', mediaType: 'image' },
      { optionText: 'Neither — DeFi collapses', mediaUrl: 'https://img.icons8.com/emoji/96/face-screaming-in-fear.png', mediaType: 'image' },
    ],
  },
  {
    title: 'Which Premier League club sells for most in Jan 2026 transfer window?',
    description: 'Go against the crowd: rare correct minority picks earn big bonuses.',
    betType: 'divergence',
    buyInAmount: 200,
    buyInCurrency: 'KSH',
    category: 'sports',
    tags: ['football', 'transfers', 'divergence'],
    isFeatured: false,
    isRecurring: false,
    closeDaysFromNow: 305,
    mediaUrl: img('sports', 1),
    outcomes: [
      { optionText: 'Chelsea' },
      { optionText: 'Manchester United' },
      { optionText: 'Arsenal' },
      { optionText: 'Liverpool' },
      { optionText: 'Tottenham' },
    ],
  },
  {
    title: 'Nairobi housing prices by end of 2026 — Consensus vs contrarian',
    description: 'Real estate divergence bet. Minority correct answer earns multiplied returns.',
    betType: 'divergence',
    buyInAmount: 100,
    buyInCurrency: 'KSH',
    category: 'finance',
    tags: ['real-estate', 'kenya', 'divergence'],
    isFeatured: false,
    isRecurring: false,
    closeDaysFromNow: 300,
    mediaUrl: img('finance', 0),
    outcomes: [
      { optionText: 'Rise 10%+', mediaUrl: 'https://img.icons8.com/emoji/96/chart-increasing.png', mediaType: 'image' },
      { optionText: 'Rise 1-10%', mediaUrl: 'https://img.icons8.com/emoji/96/chart-increasing.png', mediaType: 'image' },
      { optionText: 'Stay flat', mediaUrl: 'https://img.icons8.com/emoji/96/minus.png', mediaType: 'image' },
      { optionText: 'Fall slightly (1-10%)', mediaUrl: 'https://img.icons8.com/emoji/96/chart-decreasing.png', mediaType: 'image' },
      { optionText: 'Fall 10%+', mediaUrl: 'https://img.icons8.com/emoji/96/chart-decreasing.png', mediaType: 'image' },
    ],
  },
];

async function seedMarkets() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined in .env');

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);

  const UserModel = mongoose.model('User', UserSchema);
  const MarketModel = mongoose.model('Market', MarketSchema);

  try {
    const adminUser =
      (await UserModel.findOne({ role: 'admin' }).sort({ createdAt: 1 })) ||
      (await UserModel.findOne().sort({ createdAt: 1 }));

    if (!adminUser) throw new Error('No users found. Run seed-admin.ts first.');

    console.log('Clearing existing markets...');
    await MarketModel.deleteMany({});

    const now = Date.now();
    let createdCount = 0;

    for (const seed of SEED_MARKETS) {
      const days = seed.closeDaysFromNow ?? 7;
      const closeTime = new Date(now + days * 24 * 60 * 60 * 1000);
      const settlementTime = new Date(closeTime.getTime() + 60 * 60 * 1000);

      await MarketModel.create({
        title: seed.title,
        description: seed.description,
        betType: seed.betType,
        category: seed.category,
        tags: seed.tags,
        isFeatured: seed.isFeatured ?? false,
        isRecurring: seed.isRecurring ?? false,
        isTrending: seed.isTrending ?? false,
        buyInAmount: seed.buyInAmount,
        buyInCurrency: seed.buyInCurrency,
        marketDuration: 'daily',
        minParticipants: 2,
        maxParticipants: 10000,
        closeTime,
        settlementTime,
        status: 'active',
        settlementMethod: 'admin_report',
        oddsType: 'pari_mutuel',
        outcomes: seed.outcomes.map((o) => ({
          optionText: o.optionText,
          mediaUrl: o.mediaUrl,
          mediaType: o.mediaType || (o.mediaUrl ? 'image' : 'none'),
          participantCount: 0,
          totalAmount: 0,
        })),
        mediaUrl: seed.mediaUrl,
        mediaType: seed.mediaUrl ? 'image' : 'none',
        scenario: seed.scenario,
        regionsAllowed: [],
        regionsBlocked: [],
        ageRestriction: 18,
        requiresIdentityCheck: false,
        createdBy: adminUser._id,
        lastEditedBy: adminUser._id,
      });

      createdCount += 1;
      console.log(`✅  ${seed.betType.toUpperCase()} — ${seed.title}`);
    }

    console.log(`\n🎉 Seeded ${createdCount} markets (${SEED_MARKETS.filter((m) => m.isFeatured).length} featured, ${SEED_MARKETS.filter((m) => m.isRecurring).length} recurring)`);
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
