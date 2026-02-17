import { IsEmail, IsString, IsIn } from 'class-validator';
import { type UserRole } from '../../domain/user.entity';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsIn(['ADMIN', 'MANAGER', 'EMPLOYEE'])
  role!: UserRole;
}
