import {
  IsEmail,
  IsString,
  IsIn,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { type UserRole } from '../../domain/user.entity';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'MANAGER', 'EMPLOYEE'])
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
