import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class User {
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ required: true, unique: true, trim: true })
  username!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop()
  fullName?: string;

  @Prop()
  phone?: string;

  @Prop()
  location?: string;

  @Prop()
  bio?: string;

  @Prop({ default: 'en' })
  language!: string;

  @Prop()
  dateOfBirth?: Date;

  @Prop()
  avatarUrl?: string;

  @Prop({ type: Types.ObjectId, ref: 'Wallet' })
  walletId?: Types.ObjectId;

  // ─── Identity & Trust ───────────────────────────
  @Prop({ default: 'novice', enum: ['novice', 'high_roller'] })
  tier!: string;

  @Prop({ default: 'user', enum: ['user', 'moderator', 'group_admin', 'admin'] })
  role!: string;

  @Prop({ default: 100 })
  reputationScore!: number;

  @Prop({ default: 0 })
  signalAccuracy!: number;

  @Prop({ default: 1.0 })
  integrityWeight!: number;

  // ─── Stats ──────────────────────────────────────
  @Prop({ default: 0 })
  totalPositions!: number;

  @Prop({ default: 0 })
  positionsWon!: number;

  @Prop({ default: 0 })
  positionsLost!: number;

  @Prop({ default: 0 })
  activeDays!: number;

  @Prop({ default: 0 })
  followersCount!: number;

  @Prop({ default: 0 })
  followingCount!: number;

  @Prop({ default: 0 })
  groupMemberships!: number;

  // ─── Compliance ─────────────────────────────────
  @Prop({ default: false })
  emailVerified!: boolean;

  @Prop({ default: 'none', enum: ['none', 'pending', 'approved', 'rejected'] })
  kycStatus!: string;

  @Prop({ default: false })
  isVerified!: boolean;

  @Prop({ default: 0 })
  complianceViolations!: number;

  @Prop({ default: false })
  isFlagged!: boolean;

  // ─── 2FA ────────────────────────────────────────
  @Prop({ default: false })
  twoFactorEnabled!: boolean;

  @Prop()
  twoFactorSecret?: string;

  @Prop({ type: [String], default: [] })
  backupCodes!: string[];

  // ─── Preferences ────────────────────────────────
  @Prop({ default: 'USD', enum: ['USD', 'KSH'] })
  preferredCurrency!: string;

  @Prop({ default: 'UTC' })
  timezone!: string;

  @Prop({ default: true })
  notificationEmail!: boolean;

  @Prop({ default: true })
  notificationPush!: boolean;

  // ─── Activity Tracking ──────────────────────────
  @Prop()
  lastActiveAt?: Date;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  lastLoginIp?: string;

  // ─── FCM Token ──────────────────────────────────
  @Prop({ type: [String], default: [] })
  fcmTokens!: string[];

  // ─── Auth Tokens ────────────────────────────────
  @Prop()
  emailVerificationToken?: string;

  @Prop()
  passwordResetToken?: string;

  @Prop()
  passwordResetExpires?: Date;

  @Prop()
  refreshTokenHash?: string;

  @Prop()
  refreshTokenExpiresAt?: Date;

  @Prop({ default: false })
  isBanned!: boolean;

  @Prop()
  banReason?: string;

  // Timestamp fields are materialized by `timestamps: true` and added here for typing.
  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes
UserSchema.index({ role: 1 });
UserSchema.index({ reputationScore: -1 });
UserSchema.index({ tier: 1 });
UserSchema.index({ walletId: 1 }, { unique: true, sparse: true });
