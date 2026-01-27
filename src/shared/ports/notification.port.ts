/**
 * Port for sending notifications (emails, SMS, push, etc.)
 *
 * This is a PORT - handlers depend on this interface, not concrete implementations.
 * The actual implementation (SMTP, SendGrid, etc.) lives in infrastructure.
 */
export interface NotificationPort {
  /**
   * Send a notification using a template.
   */
  send(notification: NotificationRequest): Promise<NotificationResult>;
}

export interface NotificationRequest {
  /** Notification channel */
  channel: 'email' | 'sms' | 'push';
  /** Recipient identifier (email address, phone number, device token) */
  to: string;
  /** Template identifier */
  template: string;
  /** Template data */
  data: Record<string, unknown>;
  /** Optional: idempotency key to prevent duplicate sends */
  idempotencyKey?: string;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');
