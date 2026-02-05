import {
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  Min,
  Max,
  IsDateString,
  IsUUID,
} from 'class-validator';

export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export class CreateContractDto {
  @IsUUID()
  cateringCompanyId: string;

  @IsUUID()
  clientCompanyId: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsNumber()
  @Min(0)
  pricePerService: number;

  @IsBoolean()
  @IsOptional()
  flexibleQuantity?: boolean;

  @IsInt()
  @Min(0)
  minDailyQuantity: number;

  @IsInt()
  @Min(0)
  maxDailyQuantity: number;

  @IsInt()
  @Min(0)
  noticePeriodHours: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  serviceDays: DayOfWeek[];
}
