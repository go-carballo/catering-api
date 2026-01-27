import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../infrastructure/database/database.module';
import type { DrizzleClient } from '../infrastructure/database/drizzle.client';
import { processedEvents } from '../infrastructure/database/schema';

/**
 * IdempotencyService - Ensures handlers don't process the same event twice.
 *
 * Usage in handlers:
 * ```typescript
 * async handleEvent(event: DomainEvent) {
 *   if (await this.idempotency.isProcessed(event.id, 'MyHandler')) {
 *     return; // Already processed, skip
 *   }
 *
 *   // Do the actual work...
 *   await this.emailService.send(...);
 *
 *   // Mark as processed AFTER successful completion
 *   await this.idempotency.markProcessed(event.id, 'MyHandler');
 * }
 * ```
 *
 * For handlers that need atomicity (e.g., database writes), use markProcessedInTx
 * to include the idempotency record in the same transaction.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleClient) {}

  /**
   * Check if an event has already been processed by a specific handler.
   */
  async isProcessed(eventId: string, handlerName: string): Promise<boolean> {
    const result = await this.db
      .select({ id: processedEvents.id })
      .from(processedEvents)
      .where(
        and(
          eq(processedEvents.eventId, eventId),
          eq(processedEvents.handlerName, handlerName),
        ),
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Mark an event as processed by a handler.
   * Use this AFTER successfully completing the handler's work.
   *
   * @param eventId - The outbox event ID
   * @param handlerName - Unique identifier for the handler
   * @param metadata - Optional JSON metadata (for debugging)
   */
  async markProcessed(
    eventId: string,
    handlerName: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.db.insert(processedEvents).values({
        eventId,
        handlerName,
        metadata: metadata ? JSON.stringify(metadata) : null,
      });
    } catch (error: unknown) {
      // Unique constraint violation = already processed (race condition)
      // This is fine, we just log and continue
      if (this.isUniqueViolation(error)) {
        this.logger.debug(
          `Event ${eventId} already marked as processed by ${handlerName}`,
        );
        return;
      }
      throw error;
    }
  }

  /**
   * Mark as processed within an existing transaction.
   * Use this when your handler does DB writes and you want atomicity.
   */
  async markProcessedInTx(
    tx: any,
    eventId: string,
    handlerName: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(processedEvents).values({
      eventId,
      handlerName,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  }

  /**
   * Process an event idempotently with a single call.
   * This is a convenience method that wraps the check-process-mark pattern.
   *
   * @returns true if the handler ran, false if it was skipped (already processed)
   */
  async processOnce<T>(
    eventId: string,
    handlerName: string,
    handler: () => Promise<T>,
    metadata?: Record<string, unknown>,
  ): Promise<{ executed: boolean; result?: T }> {
    if (await this.isProcessed(eventId, handlerName)) {
      this.logger.debug(
        `Skipping ${handlerName} for event ${eventId} (already processed)`,
      );
      return { executed: false };
    }

    const result = await handler();
    await this.markProcessed(eventId, handlerName, metadata);

    return { executed: true, result };
  }

  private isUniqueViolation(error: unknown): boolean {
    // PostgreSQL unique violation error code
    return (
      error instanceof Error &&
      'code' in error &&
      (error as any).code === '23505'
    );
  }
}
