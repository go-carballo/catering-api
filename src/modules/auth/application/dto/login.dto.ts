import {
  IsEmail,
  IsString,
  MinLength,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({
    example: 'catering@example.com',
    description: 'Company email',
  })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', description: 'Company password' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({
    example: false,
    description:
      'Remember this device for 30 days (optional, defaults to false)',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  rememberMe?: boolean;
}
