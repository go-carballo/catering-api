import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from '../application/auth.service';
import { LoginDto } from '../application/dto/login.dto';
import { RefreshTokenDto } from '../application/dto/refresh-token.dto';
import { ChangePasswordDto } from '../application/dto/change-password.dto';
import { ForgotPasswordDto } from '../application/dto/forgot-password.dto';
import { ResetPasswordDto } from '../application/dto/reset-password.dto';
import { Public } from '../../../shared/decorators/public.decorator';
import { GetCompany } from '../../../shared/decorators/get-company.decorator';
import type { CurrentCompany } from '../../../shared/decorators/get-company.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({
    status: 200,
    description: 'Returns JWT access token and refresh token',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token using refresh token',
    description:
      'Use this endpoint to get a new access token without re-logging in. Refresh token is valid for 7 days.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns new access token',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout and revoke refresh token',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
  })
  async logout(
    @Body() dto: RefreshTokenDto,
    @GetCompany() company: CurrentCompany,
  ) {
    await this.authService.logout(dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change password for authenticated user',
    description:
      'Requires providing current password and new password. All other refresh tokens will be revoked for security.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request (passwords do not match or too short)',
  })
  @ApiResponse({
    status: 401,
    description: 'Current password is incorrect',
  })
  async changePassword(
    @GetCompany() company: CurrentCompany,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(company.id, dto);
    return { message: 'Password changed successfully' };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Send a password reset email to the provided email address. Email will contain a link with a reset token valid for 15 minutes.',
  })
  @ApiResponse({
    status: 200,
    description:
      'If email exists, reset email will be sent (silently returns success for security)',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.requestPasswordReset(dto.email);
    return {
      message:
        'If an account exists with this email, a reset link has been sent',
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password using token from email',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired reset token',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
    return { message: 'Password reset successfully' };
  }

  @Get('session-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get current session status and last activity time',
    description:
      'Returns the last activity timestamp for the authenticated user. Used to detect session timeouts on the frontend.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session is active',
    schema: {
      example: {
        isActive: true,
        lastActivityAt: '2026-02-05T15:30:00Z',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getSessionStatus(@GetCompany() company: CurrentCompany) {
    return {
      isActive: true,
      lastActivityAt: company.lastActivityAt || new Date().toISOString(),
    };
  }
}
