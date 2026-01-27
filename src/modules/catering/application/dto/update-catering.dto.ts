import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCateringDto {
  @ApiPropertyOptional({
    example: 'Catering Premium',
    description: 'Company name',
  })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    example: '30-12345678-9',
    description: 'Tax ID (CUIT)',
  })
  @IsString()
  @IsOptional()
  taxId?: string | null;

  @ApiPropertyOptional({
    example: 600,
    description: 'Maximum meals per day capacity',
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  dailyCapacity?: number;

  @ApiPropertyOptional({
    enum: ['ACTIVE', 'INACTIVE'],
    description: 'Company status',
  })
  @IsIn(['ACTIVE', 'INACTIVE'])
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';
}
