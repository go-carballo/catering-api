import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger('EmailService');
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    // Initialize email transporter
    // For development, we can use ethereal (test emails)
    // For production, use real SMTP config from env

    const emailHost = this.configService.get<string>('EMAIL_HOST');
    const emailPort = this.configService.get<number>('EMAIL_PORT') || 587;
    const emailUser = this.configService.get<string>('EMAIL_USER');
    const emailPassword = this.configService.get<string>('EMAIL_PASSWORD');
    const emailFrom = this.configService.get<string>(
      'EMAIL_FROM',
      'noreply@catering-api.com',
    );

    if (emailHost && emailUser && emailPassword) {
      // Production: Real SMTP
      this.transporter = nodemailer.createTransport({
        host: emailHost,
        port: emailPort,
        secure: emailPort === 465, // true for 465, false for other ports
        auth: {
          user: emailUser,
          pass: emailPassword,
        },
      });
    } else {
      // Development: Ethereal (test service)
      // This creates a fake SMTP server for testing
      this.initializeTestTransport();
    }
  }

  /**
   * Initialize test transport for development
   * Emails won't actually be sent, but you can see them in ethereal
   */
  private async initializeTestTransport(): Promise<void> {
    try {
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Could not initialize Ethereal test account, emails will fail: ${error}`,
      );
    }
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const emailFrom = this.configService.get<string>(
        'EMAIL_FROM',
        'noreply@catering-api.com',
      );

      const info = await this.transporter.sendMail({
        from: emailFrom,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      this.logger.log(`Email sent to ${options.to}: ${info.messageId}`);

      // For Ethereal test emails, print the preview URL
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    resetUrl: string,
    companyName: string,
  ): Promise<void> {
    const html = `
      <h2>Password Reset Request</h2>
      <p>Hi ${companyName},</p>
      <p>You requested to reset your password. Click the link below to proceed:</p>
      <a href="${resetUrl}" style="
        display: inline-block;
        background-color: #007bff;
        color: white;
        padding: 10px 20px;
        text-decoration: none;
        border-radius: 4px;
        margin: 20px 0;
      ">Reset Password</a>
      <p>This link will expire in 15 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
      <hr>
      <p>Catering App Team</p>
    `;

    const text = `
      Password Reset Request
      
      Hi ${companyName},
      
      You requested to reset your password. Copy and paste the link below in your browser:
      ${resetUrl}
      
      This link will expire in 15 minutes.
      
      If you didn't request this, please ignore this email.
      
      Catering App Team
    `;

    await this.sendEmail({
      to: email,
      subject: 'Password Reset Request - Catering App',
      html,
      text,
    });
  }
}
