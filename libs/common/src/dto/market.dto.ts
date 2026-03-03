import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsDateString,
  IsInt,
  ArrayMinSize,
  IsUrl,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MarketType, SettlementMethod, OddsType } from '../constants';

export class MarketOutcomeDto {
  @IsString()
  @IsNotEmpty()
  optionText!: string;

  @IsOptional()
  @IsNumber()
  fixedOdds?: number;

  @IsOptional()
  @IsUrl()
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

  @IsString()
  @IsIn([...Object.values(MarketType), 'syndicate'])
  betType!: MarketType | 'syndicate';

  @IsNumber()
  @Min(0.01)
  buyInAmount!: number;

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
  @IsUrl()
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
