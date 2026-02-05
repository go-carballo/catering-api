import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, isNull, gt, lte } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';
import type { DrizzleClient } from '../../../shared/infrastructure/database/drizzle.client';
import { refreshTokens } from '../../../shared/infrastructure/database/schema';

export interface RefreshTokenPayload {
  companyId: string;
  tokenHash: string;
}

@Injectable()
export class RefreshTokenService {
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7; // Refresh token valid for 7 days
  private readonly REMEMBER_ME_EXPIRY_DAYS = 30; // Remember me valid for 30 days

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate a new refresh token and store it in the database
   * @param companyId - Company ID
   * @param rememberMe - If true, token expires in 30 days instead of 7 (default: false)
   */
  async generateRefreshToken(
    companyId: string,
    rememberMe = false,
  ): Promise<string> {
    // Generate a random token (256 bits = 32 bytes)
    const token = randomBytes(32).toString('hex');

    // Hash the token before storing (security best practice)
    const tokenHash = await bcrypt.hash(token, 10);

    // Calculate expiry date based on rememberMe flag
    const expiresAt = new Date();
    const expiryDays = rememberMe
      ? this.REMEMBER_ME_EXPIRY_DAYS
      : this.REFRESH_TOKEN_EXPIRY_DAYS;
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    // Store in database
    await this.db.insert(refreshTokens).values({
      companyId,
      tokenHash,
      expiresAt,
    });

    // Return the raw token (not the hash) to send to client
    return token;
  }

  /**
   * Validate a refresh token and return the company ID if valid
   */
  async validateRefreshToken(token: string): Promise<string | null> {
    // Get all valid tokens for this token's hash
    const results = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          isNull(refreshTokens.revokedAt), // Not revoked
          gt(refreshTokens.expiresAt, new Date()), // Not expired
        ),
      );

    // Find the matching token by comparing with bcrypt
    for (const record of results) {
      const isValid = await bcrypt.compare(token, record.tokenHash);
      if (isValid) {
        return record.companyId;
      }
    }

    return null;
  }

  /**
   * Revoke a refresh token (logout)
   */
  async revokeRefreshToken(token: string): Promise<boolean> {
    // Get all valid tokens
    const results = await this.db
      .select()
      .from(refreshTokens)
      .where(isNull(refreshTokens.revokedAt));

    // Find and revoke the matching token
    for (const record of results) {
      const isValid = await bcrypt.compare(token, record.tokenHash);
      if (isValid) {
        await this.db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.id, record.id));
        return true;
      }
    }

    return false;
  }

  /**
   * Clean up expired refresh tokens (run periodically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.db
      .delete(refreshTokens)
      .where(lte(refreshTokens.expiresAt, new Date()));

    return (result as any).rowCount || 0;
  }

  /**
   * Revoke all tokens for a company (useful for security events)
   */
  async revokeAllTokensForCompany(companyId: string): Promise<number> {
    const result = await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.companyId, companyId),
          isNull(refreshTokens.revokedAt),
        ),
      );

    return (result as any).rowCount || 0;
  }
}
