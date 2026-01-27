import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export type WorkMode = 'REMOTE' | 'HYBRID' | 'ONSITE';
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export class UpdateClientDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  taxId?: string | null;

  @IsEnum(['REMOTE', 'HYBRID', 'ONSITE'])
  @IsOptional()
  workMode?: WorkMode;

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @IsOptional()
  officeDays?: DayOfWeek[];

  @IsIn(['ACTIVE', 'INACTIVE'])
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';
}
