import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  IsEmail,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCateringDto {
  @ApiProperty({ example: 'Catering Deluxe', description: 'Company name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'catering@example.com',
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
    example: '30-12345678-9',
    description: 'Tax ID (CUIT)',
  })
  @IsString()
  @IsOptional()
  taxId?: string;

  @ApiProperty({ example: 500, description: 'Maximum meals per day capacity' })
  @IsInt()
  @Min(1)
  dailyCapacity: number;
}
