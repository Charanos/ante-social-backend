import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import { UserSchema } from '../libs/database/src/schemas/user.schema';
import { WalletSchema } from '../libs/database/src/schemas/wallet.schema';

dotenv.config({ path: '../.env' });

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

async function seedAdmin() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI (or DATABASE_URL) is not defined in .env');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);

  const UserModel = mongoose.model('User', UserSchema);
  const WalletModel = mongoose.model('Wallet', WalletSchema);

  console.log('Deleting all existing users and wallets...');
  await UserModel.deleteMany({});
  await WalletModel.deleteMany({});
  console.log('Database cleared of users and wallets.');

  const adminData = {
    fullName: 'Main Admin',
    username: 'admin',
    email: 'admin@antesocial.com',
    phone: '',
    dateOfBirth: new Date('1990-01-01'),
    password: '4lofrw;AUzBcz.8x',
    avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=admin`,
    role: 'admin',
    tier: 'high_roller',
    emailVerified: true,
    isVerified: true,
    reputationScore: 1000,
    integrityWeight: 1.0,
  };

  console.log('Creating new main admin user...');
  const passwordHash = await bcrypt.hash(adminData.password, 12);

  const user = await UserModel.create({
    ...adminData,
    passwordHash,
  });

  await WalletModel.create({
    userId: user._id,
    balanceUsd: 10000,
    balanceKsh: 1000000,
  });

  console.log('Main Admin user created successfully.');
  console.log('Credentials:', {
    email: adminData.email,
    password: adminData.password,
  });

  await mongoose.disconnect();
  console.log('Disconnected.');
}

seedAdmin()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
