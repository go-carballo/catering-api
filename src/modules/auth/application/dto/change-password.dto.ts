import { IsString, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'oldPassword123',
    description: 'Current password',
  })
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @ApiProperty({
    example: 'newPassword456',
    description: 'New password (minimum 8 characters)',
  })
  @IsString()
  @MinLength(8, {
    message: 'New password must be at least 8 characters long',
  })
  newPassword: string;

  @ApiProperty({
    example: 'newPassword456',
    description: 'Confirm new password',
  })
  @IsString()
  @IsNotEmpty()
  passwordConfirmation: string;
}
