/**
 * Seeds the Ante Social AI Agent system user into MongoDB.
 * This user is used by the standalone ante-social-ai-agent service
 * to POST markets to the market-engine API.
 *
 * Usage:
 *   cd ante-social-backend
 *   npx ts-node -r tsconfig-paths/register scripts/seed-ai-agent.ts
 */

import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import { UserSchema } from '../libs/database/src/schemas/user.schema';
import { WalletSchema } from '../libs/database/src/schemas/wallet.schema';

// Load .env.local first, then .env as fallback
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

async function seedAiAgent() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in .env / .env.local');
  }

  console.log('🔌 Connecting to MongoDB Atlas...');
  await mongoose.connect(MONGODB_URI);

  const UserModel = mongoose.model('User', UserSchema, 'users');
  const WalletModel = mongoose.model('Wallet', WalletSchema, 'wallets');

  const EMAIL = 'ante-agent@antesocial.co.ke';
  const USERNAME = 'ante-agent';
  const PASSWORD = '4lofrw;AUzBcz.8x';

  // Check if ai-agent user already exists
  const existing = await UserModel.findOne({
    $or: [{ email: EMAIL }, { username: USERNAME }],
  });

  if (existing) {
    console.log(`⚠️  AI Agent user already exists (id: ${existing._id})`);
    console.log(`   email:    ${existing.email}`);
    console.log(`   username: ${existing.username}`);
    console.log(`   role:     ${existing.role}`);
    console.log('');
    console.log('✅ Copy this value to your .env / .env.local:');
    console.log(`AI_AGENT_USER_ID=${existing._id}`);
    await mongoose.disconnect();
    return;
  }

  console.log('🤖 Creating AI Agent system user...');
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const user = await UserModel.create({
    email: EMAIL,
    username: USERNAME,
    fullName: 'Ante Agent',
    passwordHash,
    role: 'admin',
    tier: 'high_roller',
    isVerified: true,
    emailVerified: true,
    reputationScore: 1000,
    integrityWeight: 1.0,
    timezone: 'Africa/Nairobi',
    preferredCurrency: 'USD',
    bio: 'Automated AI market agent for Ante Social. Creates and resolves Kenyan prediction markets.',
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=ante-agent',
  });

  // Create a wallet for the AI agent (needed for any wallet-service interactions)
  const wallet = await WalletModel.create({
    userId: user._id,
    balanceUsd: 0,
    balanceKsh: 0,
  });

  // Link wallet back to user
  await UserModel.findByIdAndUpdate(user._id, { walletId: wallet._id });

  console.log('');
  console.log('✅ AI Agent user created successfully!');
  console.log('─────────────────────────────────────────');
  console.log(`Email:    ${EMAIL}`);
  console.log(`Username: ${USERNAME}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Role:     admin`);
  console.log(`User ID:  ${user._id}`);
  console.log('');
  console.log('📋 Add these to ante-social-ai-agent/.env:');
  console.log(`AI_AGENT_USER_ID=${user._id}`);
  console.log('AI_AGENT_JWT=<get from login step below>');
  console.log('');
  console.log('🔑 Get your JWT by calling:');
  console.log('  POST http://localhost:3002/auth/login');
  console.log(`  Body: { "email": "${EMAIL}", "password": "${PASSWORD}" }`);
  console.log('  Copy the access_token → set as AI_AGENT_JWT');
  console.log('─────────────────────────────────────────');

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB.');
}

seedAiAgent()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  });
