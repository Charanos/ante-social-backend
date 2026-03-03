import { Injectable, ConflictException, UnauthorizedException, BadRequestException, Inject, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserDocument, Wallet, WalletDocument } from '@app/database';
import { RegisterDto, LoginDto, UserRole, UserTier, JwtPayload, MIN_AGE_YEARS } from '@app/common';

import { ClientKafka } from '@nestjs/microservices';
import { UserCreatedEvent } from '@app/kafka';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async register(registerDto: RegisterDto) {
    // Age validation (18+)
    const dob = new Date(registerDto.dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    if (age < MIN_AGE_YEARS) {
      throw new BadRequestException(`You must be at least ${MIN_AGE_YEARS} years old to register`);
    }

    // Check if user exists
    const existing = await this.userModel.findOne({
      $or: [{ email: registerDto.email }, { username: registerDto.username }],
    });

    if (existing) {
      throw new ConflictException('Email or Username already taken');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(registerDto.password, 12);

    // Generate 6-digit OTP for email verification
    const emailVerificationToken = Math.floor(100000 + Math.random() * 900000).toString();

    // Create User
    const user = new this.userModel({
      ...registerDto,
      passwordHash,
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(registerDto.username)}`,
      tier: UserTier.NOVICE,
      role: UserRole.USER,
      reputationScore: 100,
      integrityWeight: 0.85,
      emailVerificationToken,
      emailVerified: false,
    });

    const savedUser = await user.save();

    // Create Wallet
    const wallet = new this.walletModel({
      userId: savedUser._id,
      balanceUsd: 0,
      balanceKsh: 0,
    });
    const savedWallet = await wallet.save();

    savedUser.walletId = savedWallet._id;
    await savedUser.save();

    // Emit Kafka Event
    this.kafkaClient.emit(
      'user.created',
      new UserCreatedEvent({
        userId: savedUser._id.toString(),
        email: savedUser.email,
        username: savedUser.username,
        tier: UserTier.NOVICE,
        verificationToken: emailVerificationToken,
      }),
    );

    return this.issueAuthTokens(savedUser);
  }

  async validateUser(email: string, pass: string): Promise<UserDocument | null> {
    const user = await this.userModel.findOne({ email });
    if (user && (await bcrypt.compare(pass, user.passwordHash))) {
      return user;
    }
    return null;
  }

  async validateUserById(userId: string): Promise<UserDocument | null> {
    return this.userModel.findById(userId);
  }

  async login(user: UserDocument) {
    // Check if user is banned
    if (user.isBanned) {
      throw new UnauthorizedException('Account has been suspended');
    }

    // Check 2FA requirement
    if (user.twoFactorEnabled) {
      return {
        requires_2fa: true,
        userId: user._id.toString(),
        message: 'Please provide your 2FA code to complete login',
      };
    }

    return this.completeLogin(user);
  }

  async completeLogin(user: UserDocument) {
    user.lastLoginAt = new Date();
    await user.save();
    return this.issueAuthTokens(user);
  }

  async refreshTokens(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    let payload: { sub?: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub?: string }>(refreshToken, {
        secret: this.getRefreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const userId = payload.sub;
    if (!userId) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    const user = await this.userModel.findById(userId);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token is revoked');
    }

    if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt <= new Date()) {
      await this.clearRefreshToken(user);
      throw new UnauthorizedException('Refresh token has expired');
    }

    const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isValid) {
      await this.clearRefreshToken(user);
      throw new UnauthorizedException('Refresh token is invalid');
    }

    return this.issueAuthTokens(user);
  }

  async revokeRefreshToken(rawRefreshToken?: string) {
    if (!rawRefreshToken) {
      return { success: true };
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub?: string }>(rawRefreshToken, {
        secret: this.getRefreshSecret(),
      });

      if (payload?.sub) {
        const user = await this.userModel.findById(payload.sub);
        if (user) {
          await this.clearRefreshToken(user);
        }
      }
    } catch {
      // Token may be invalid/expired; we still clear cookies client-side.
    }

    return { success: true };
  }

  // ─── Email Verification ────────────────────────────
  async verifyEmail(email: string, token: string) {
    const user = await this.userModel.findOne({ email, emailVerificationToken: token });
    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    return { success: true, message: 'Email verified successfully' };
  }

  async resendOtp(email: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Generate new 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailVerificationToken = otp;
    await user.save();

    // Emit Kafka Event for notification
    this.kafkaClient.emit('auth.resend-otp', {
      email: user.email,
      token: otp,
    });

    return { success: true, message: 'Verification code resent' };
  }

  // ─── Forgot Password ──────────────────────────────
  async forgotPassword(email: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) {
      // Don't reveal whether the email exists
      return { success: true, message: 'If the email exists, a reset link has been sent' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.passwordResetToken = resetTokenHash;
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 min
    await user.save();

    // Emit notification for password reset email
    this.kafkaClient.emit('notification.dispatch', {
      userId: user._id.toString(),
      type: 'password_reset',
      title: 'Password Reset Request',
      message: `Your password reset token: ${resetToken}`,
      channels: ['email'],
    });

    return { success: true, message: 'If the email exists, a reset link has been sent' };
  }

  // ─── Reset Password ───────────────────────────────
  async resetPassword(token: string, newPassword: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userModel.findOne({
      passwordResetToken: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return { success: true, message: 'Password reset successfully' };
  }

  // ─── Token Generation ─────────────────────────────
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await this.clearRefreshToken(user);
    await user.save();

    return { success: true, message: 'Password changed successfully' };
  }

  async getSessions(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('lastLoginAt lastLoginIp refreshTokenHash refreshTokenExpiresAt createdAt updatedAt');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.refreshTokenHash) {
      return { data: [], meta: { total: 0 } };
    }

    const referenceTime =
      user.lastLoginAt ||
      user.updatedAt ||
      user.createdAt ||
      new Date();

    return {
      data: [
        {
          id: 'current',
          device: 'Current session',
          ipAddress: user.lastLoginIp || null,
          createdAt: referenceTime.toISOString(),
          lastActiveAt: referenceTime.toISOString(),
          expiresAt: user.refreshTokenExpiresAt
            ? user.refreshTokenExpiresAt.toISOString()
            : null,
          current: true,
        },
      ],
      meta: { total: 1 },
    };
  }

  async revokeSession(userId: string, sessionId: string) {
    if (sessionId !== 'current') {
      throw new NotFoundException('Session not found');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.clearRefreshToken(user);
    return { success: true };
  }

  private async issueAuthTokens(user: UserDocument) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      username: user.username,
      role: user.role,
      tier: user.tier,
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(
      { sub: user._id.toString() },
      {
        secret: this.getRefreshSecret(),
        expiresIn: this.getRefreshExpiration(),
      },
    );

    await this.persistRefreshToken(user, refreshToken);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        tier: user.tier,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    };
  }

  private async persistRefreshToken(user: UserDocument, refreshToken: string) {
    user.refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    user.refreshTokenExpiresAt = this.calculateExpiryDate(this.getRefreshExpiration());
    await user.save();
  }

  private async clearRefreshToken(user: UserDocument) {
    user.refreshTokenHash = undefined;
    user.refreshTokenExpiresAt = undefined;
    await user.save();
  }

  private getRefreshSecret() {
    return this.configService.get<string>('JWT_REFRESH_SECRET') || this.configService.get<string>('JWT_SECRET') || 'refresh-secret';
  }

  private getRefreshExpiration() {
    return this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';
  }

  private calculateExpiryDate(duration: string) {
    const now = Date.now();
    const match = /^(\d+)([smhd])$/i.exec(duration);
    if (!match) {
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const unitMs: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return new Date(now + value * unitMs[unit]);
  }
}
