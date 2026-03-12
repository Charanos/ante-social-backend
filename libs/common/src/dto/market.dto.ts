import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  IsDateString,
  IsInt,
  ArrayMinSize,
  IsUrl,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MarketType, SettlementMethod, OddsType, UserTier } from '../constants';

export class MarketOutcomeDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  _id?: string;

  @IsString()
  @IsNotEmpty()
  optionText!: string;

  @IsOptional()
  @IsNumber()
  fixedOdds?: number;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  mediaType?: string;
}

export class CreateMarketDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsString()
  scenario?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsBoolean()
  isTrending?: boolean;

  @IsString()
  @IsIn([...Object.values(MarketType), 'syndicate'])
  betType!: MarketType | 'syndicate';

  @IsNumber()
  @Min(0.01)
  buyInAmount!: number;

  @IsOptional()
  @IsString()
  @IsIn(['USD', 'KSH'])
  buyInCurrency?: string;

  @IsDateString()
  closeTime!: string;

  @IsDateString()
  settlementTime!: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  scheduledPublishTime?: string;

  @IsOptional()
  @IsString()
  marketDuration?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  minParticipants?: number;

  @IsOptional()
  @IsInt()
  maxParticipants?: number;

  @IsOptional()
  @IsEnum(UserTier)
  minimumTier?: UserTier;

  @IsOptional()
  @IsEnum(SettlementMethod)
  settlementMethod?: SettlementMethod;

  @IsOptional()
  @IsString()
  externalApiEndpoint?: string;

  @IsOptional()
  @IsEnum(OddsType)
  oddsType?: OddsType;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => MarketOutcomeDto)
  outcomes!: MarketOutcomeDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  mediaType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  regionsAllowed?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  regionsBlocked?: string[];

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  externalSource?: string;
}

export class PlacePredictionDto {
  @IsString()
  @IsNotEmpty()
  marketId!: string;

  @IsString()
  @IsNotEmpty()
  outcomeId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  rankedOutcomeIds?: string[];
}

export class EditPredictionDto {
  @IsOptional()
  @IsString()
  outcomeId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;
}

export class LadderPredictionDto {
  @IsString()
  @IsNotEmpty()
  marketId!: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  rankedOutcomeIds!: string[];

  @IsNumber()
  @Min(0.01)
  amount!: number;
}
