import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, isNull, gt, lte } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';
import type { DrizzleClient } from '../../../shared/infrastructure/database/drizzle.client';
import {
  passwordResetTokens,
  companies,
} from '../../../shared/infrastructure/database/schema';
import { EmailService } from '../../../shared/infrastructure/email/email.service';

@Injectable()
export class PasswordResetService {
  private readonly RESET_TOKEN_EXPIRY_MINUTES = 15;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Request password reset - generates token and sends email
   */
  async requestPasswordReset(email: string): Promise<void> {
    // Find company by email
    const [company] = await this.db
      .select()
      .from(companies)
      .where(eq(companies.email, email))
      .limit(1);

    if (!company) {
      // Don't reveal if email exists or not (security best practice)
      // Just silently return success
      return;
    }

    // Generate reset token
    const token = randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(token, 10);

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + this.RESET_TOKEN_EXPIRY_MINUTES,
    );

    // Store token
    await this.db.insert(passwordResetTokens).values({
      companyId: company.id,
      tokenHash,
      expiresAt,
    });

    // Send email with reset link
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    await this.emailService.sendPasswordResetEmail(
      company.email,
      resetUrl,
      company.name,
    );
  }

  /**
   * Validate reset token and return company ID
   */
  async validateResetToken(token: string): Promise<string | null> {
    // Get all valid (unused, not expired) reset tokens
    const results = await this.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          isNull(passwordResetTokens.usedAt), // Not used yet
          gt(passwordResetTokens.expiresAt, new Date()), // Not expired
        ),
      );

    // Find matching token by bcrypt comparison
    for (const record of results) {
      const isValid = await bcrypt.compare(token, record.tokenHash);
      if (isValid) {
        return record.companyId;
      }
    }

    return null;
  }

  /**
   * Reset password using token and new password
   */
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<string | null> {
    // Validate token
    const companyId = await this.validateResetToken(token);
    if (!companyId) {
      return null; // Invalid or expired token
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password and mark token as used
    const results = await this.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      );

    // Find and mark the matching token as used
    for (const record of results) {
      const isValid = await bcrypt.compare(token, record.tokenHash);
      if (isValid) {
        await this.db
          .update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(eq(passwordResetTokens.id, record.id));
        break;
      }
    }

    // Update company password
    await this.db
      .update(companies)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    return companyId;
  }

  /**
   * Clean up expired reset tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    // Just delete, we don't need to count in this simple implementation
    await this.db
      .delete(passwordResetTokens)
      .where(lte(passwordResetTokens.expiresAt, new Date()));

    return 0;
  }
}
