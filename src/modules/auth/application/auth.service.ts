import {
  Injectable,
  Inject,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';
import type { DrizzleClient } from '../../../shared/infrastructure/database/drizzle.client';
import { companies } from '../../../shared/infrastructure/database/schema';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenService } from './refresh-token.service';
import { PasswordResetService } from './password-reset.service';

export interface JwtPayload {
  sub: string; // company ID
  email: string;
  companyType: 'CATERING' | 'CLIENT';
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // in seconds
  company: {
    id: string;
    name: string;
    email: string;
    companyType: 'CATERING' | 'CLIENT';
  };
}

@Injectable()
export class AuthService {
  private readonly ACCESS_TOKEN_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    const [company] = await this.db
      .select()
      .from(companies)
      .where(eq(companies.email, dto.email))
      .limit(1);

    if (!company) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      company.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (company.status !== 'ACTIVE') {
      throw new UnauthorizedException('Company account is inactive');
    }

    const payload: JwtPayload = {
      sub: company.id,
      email: company.email,
      companyType: company.companyType,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.refreshTokenService.generateRefreshToken(
      company.id,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.ACCESS_TOKEN_EXPIRY_SECONDS,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        companyType: company.companyType,
      },
    };
  }

  async validateCompany(payload: JwtPayload) {
    const [company] = await this.db
      .select({
        id: companies.id,
        email: companies.email,
        name: companies.name,
        companyType: companies.companyType,
        status: companies.status,
      })
      .from(companies)
      .where(eq(companies.id, payload.sub))
      .limit(1);

    if (!company || company.status !== 'ACTIVE') {
      return null;
    }

    return company;
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthResponse> {
    // Validate refresh token
    const companyId =
      await this.refreshTokenService.validateRefreshToken(refreshToken);

    if (!companyId) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Get company info
    const [company] = await this.db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company || company.status !== 'ACTIVE') {
      throw new UnauthorizedException('Company account is no longer active');
    }

    // Generate new access token
    const payload: JwtPayload = {
      sub: company.id,
      email: company.email,
      companyType: company.companyType,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      refreshToken, // Return the same refresh token (it's still valid)
      expiresIn: this.ACCESS_TOKEN_EXPIRY_SECONDS,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        companyType: company.companyType,
      },
    };
  }

  /**
   * Logout by revoking the refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokenService.revokeRefreshToken(refreshToken);
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(
    companyId: string,
    dto: ChangePasswordDto,
  ): Promise<void> {
    // Validate passwords match
    if (dto.newPassword !== dto.passwordConfirmation) {
      throw new BadRequestException('Passwords do not match');
    }

    // Validate new password is different from old
    if (dto.oldPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    // Get company with password hash
    const [company] = await this.db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      throw new UnauthorizedException('Company not found');
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(
      dto.oldPassword,
      company.passwordHash,
    );

    if (!isOldPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await this.hashPassword(dto.newPassword);

    // Update password in database
    await this.db
      .update(companies)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    // Optional: Revoke all existing refresh tokens for security
    // This forces the user to login again from other devices
    await this.refreshTokenService.revokeAllTokensForCompany(companyId);
  }

  /**
   * Request password reset - sends email with reset link
   */
  async requestPasswordReset(email: string): Promise<void> {
    await this.passwordResetService.requestPasswordReset(email);
  }

  /**
   * Reset password using token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const companyId = await this.passwordResetService.resetPassword(
      token,
      newPassword,
    );

    if (!companyId) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Revoke all refresh tokens for security
    // User must login again after password reset
    await this.refreshTokenService.revokeAllTokensForCompany(companyId);
  }
}
