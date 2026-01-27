import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  ArrayMinSize,
  IsInt,
  Min,
  Max,
  IsEmail,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type WorkMode = 'REMOTE' | 'HYBRID' | 'ONSITE';
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export class CreateClientDto {
  @ApiProperty({ example: 'Tech Corp', description: 'Company name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'client@example.com',
    description: 'Company email (used for login)',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'securePassword123',
    description: 'Password (min 6 characters)',
  })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({
    example: '30-98765432-1',
    description: 'Tax ID (CUIT)',
  })
  @IsString()
  @IsOptional()
  taxId?: string;

  @ApiProperty({
    enum: ['REMOTE', 'HYBRID', 'ONSITE'],
    example: 'HYBRID',
    description: 'Work mode',
  })
  @IsEnum(['REMOTE', 'HYBRID', 'ONSITE'])
  workMode: WorkMode;

  @ApiProperty({
    example: [1, 2, 3, 4, 5],
    description: 'Office days (1=Monday, 7=Sunday)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  officeDays: DayOfWeek[];
}
