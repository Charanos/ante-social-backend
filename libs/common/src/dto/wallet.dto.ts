import { IsNumber, IsEnum, IsOptional, IsString, Min, IsNotEmpty } from 'class-validator';
import { Currency } from '../constants';

export class DepositDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsEnum(Currency)
  currency!: Currency;

  @IsOptional()
  @IsString()
  phoneNumber?: string; // Required for M-Pesa
}

export class WithdrawDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsEnum(Currency)
  currency!: Currency;

  @IsOptional()
  @IsString()
  phoneNumber?: string; // Required for M-Pesa

  @IsOptional()
  @IsString()
  cryptoAddress?: string; // Required for crypto
}

export class TransferDto {
  @IsString()
  @IsNotEmpty()
  toUserId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(Currency)
  currency!: Currency;
}
