import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as qrcode from 'qrcode';
import { User, UserDocument } from '@app/database';
import { AuthService } from '../auth/auth.service';

type SpeakeasyModule = {
  generateSecret: (options: { name: string; issuer: string }) => { base32?: string; otpauth_url?: string };
  totp: {
    verify: (options: { secret: string; encoding: 'base32'; token: string; window?: number }) => boolean;
  };
};

let speakeasy: SpeakeasyModule | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  speakeasy = require('speakeasy') as SpeakeasyModule;
} catch {
  speakeasy = undefined;
}

// Backward-compatible fallback if speakeasy dependency is missing.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const otplibModule = require('otplib') as { authenticator?: any; default?: { authenticator?: any } };
const authenticator = otplibModule.authenticator || otplibModule.default?.authenticator;

@Injectable()
export class TwoFactorService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private authService: AuthService,
  ) {
    if (!speakeasy && authenticator) {
      authenticator.options = { window: 1 }; // Allow 30sec slack
    }
  }

  async generateSecret(userId: string) {
    if (!speakeasy && !authenticator) {
      throw new BadRequestException('2FA provider is not configured');
    }
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const secret = this.generate2faSecret(user.email);
    const otpauthUrl = this.buildOtpAuthUrl(user.email, secret);

    // Generate QR Code
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    // Save secret temporarily (or permanently if you prefer flow to be atomic)
    // For this flow, we'll save it but not enable it yet
    user.twoFactorSecret = secret;
    await user.save();

    return {
      secret,
      qrCodeDataUrl,
    };
  }

  async verifyAndEnable(userId: string, code: string) {
    if (!speakeasy && !authenticator) {
      throw new BadRequestException('2FA provider is not configured');
    }
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.twoFactorSecret) {
      throw new BadRequestException('2FA setup not initiated');
    }

    const isValid = this.verifyCode(user.twoFactorSecret, code);

    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    user.twoFactorEnabled = true;
    user.backupCodes = this.generateBackupCodes();
    await user.save();

    return { success: true, backupCodes: user.backupCodes };
  }

  async disable(userId: string, code: string) {
    if (!speakeasy && !authenticator) {
      throw new BadRequestException('2FA provider is not configured');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA is not enabled');
    }

    const isValid = this.verifyCode(user.twoFactorSecret, code);
    if (!isValid) {
      const hasBackupCode = user.backupCodes.includes(code);
      if (!hasBackupCode) {
        throw new UnauthorizedException('Invalid 2FA code');
      }
      user.backupCodes = user.backupCodes.filter((backupCode) => backupCode !== code);
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.backupCodes = [];
    await user.save();

    return { success: true };
  }

  async validateForLogin(userId: string, code: string) {
    if (!speakeasy && !authenticator) {
      throw new UnauthorizedException('2FA provider unavailable');
    }

    const user = await this.userModel.findById(userId);
    if (!user?.twoFactorSecret) {
      throw new UnauthorizedException('2FA not enabled');
    }

    const isValid = this.verifyCode(user.twoFactorSecret, code);

    if (!isValid) {
      // Check backup codes
      if (user.backupCodes.includes(code)) {
        // Consume backup code
        user.backupCodes = user.backupCodes.filter((c) => c !== code);
        await user.save();
        return this.authService.completeLogin(user);
      }
      throw new UnauthorizedException('Invalid 2FA code');
    }

    return this.authService.completeLogin(user);
  }

  private generateBackupCodes() {
    return Array.from({ length: 10 }, () => 
      Math.floor(100000 + Math.random() * 900000).toString()
    );
  }

  private generate2faSecret(email: string) {
    if (speakeasy) {
      const generated = speakeasy.generateSecret({
        name: email,
        issuer: 'AnteSocial',
      });
      if (!generated.base32) {
        throw new BadRequestException('Failed to generate 2FA secret');
      }
      return generated.base32;
    }

    if (!authenticator) {
      throw new BadRequestException('2FA provider is not configured');
    }

    return authenticator.generateSecret();
  }

  private buildOtpAuthUrl(email: string, secret: string) {
    if (speakeasy) {
      return `otpauth://totp/AnteSocial:${encodeURIComponent(email)}?secret=${secret}&issuer=AnteSocial`;
    }

    if (!authenticator) {
      throw new BadRequestException('2FA provider is not configured');
    }

    return authenticator.keyuri(email, 'AnteSocial', secret);
  }

  private verifyCode(secret: string, code: string) {
    if (speakeasy) {
      return speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: code,
        window: 1,
      });
    }

    if (!authenticator) {
      return false;
    }

    return authenticator.verify({
      token: code,
      secret,
    });
  }
}
