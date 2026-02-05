import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'company@example.com',
    description: 'Company email address',
  })
  @IsEmail()
  email: string;
}
