import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength, IsDateString, IsOptional, IsEnum, Matches } from 'class-validator';
import { Currency } from '../constants';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username must be alphanumeric with underscores only' })
  username!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: 'Password must contain uppercase, lowercase, and number' })
  password!: string;

  @IsDateString()
  @IsNotEmpty()
  dateOfBirth!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;
}

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class Setup2FADto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class Verify2FADto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
