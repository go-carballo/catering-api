import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
