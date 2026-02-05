import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'abc123def456...',
    description: 'Refresh token from login response',
  })
  @IsString()
  refreshToken: string;
}
