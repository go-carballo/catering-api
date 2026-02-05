import { IsString, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'abc123def456...',
    description: 'Reset token from email link',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    example: 'newSecurePassword123',
    description: 'New password (minimum 8 characters)',
  })
  @IsString()
  @MinLength(8, {
    message: 'New password must be at least 8 characters long',
  })
  password: string;
}
