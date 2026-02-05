import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './application/auth.service';
import { RefreshTokenService } from './application/refresh-token.service';
import { PasswordResetService } from './application/password-reset.service';
import { AuthController } from './infrastructure/auth.controller';
import { JwtStrategy } from './infrastructure/jwt.strategy';
import { DatabaseModule } from '../../shared/infrastructure/database/database.module';
import { EmailModule } from '../../shared/infrastructure/email/email.module';

@Module({
  imports: [
    DatabaseModule,
    EmailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_SECRET') || 'default-secret-change-me',
        signOptions: {
          expiresIn: '24h' as const,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenService,
    PasswordResetService,
    JwtStrategy,
  ],
  exports: [AuthService, RefreshTokenService, PasswordResetService, JwtModule],
})
export class AuthModule {}
