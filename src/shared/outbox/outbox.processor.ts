import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq, and, lte, sql, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../infrastructure/database/database.module';
import type { DrizzleClient } from '../infrastructure/database/drizzle.client';
import { outboxEvents, OutboxEvent } from '../infrastructure/database/schema';
import type { IEventBus, DomainEvent } from '../events';
import { EVENT_BUS } from '../events';
import { randomUUID } from 'crypto';

const DEFAULT_MAX_RETRIES = 5;
const BATCH_SIZE = 100;
const LOCK_TIMEOUT_MS = 60_000; // Consider lock stale after 1 minute
const BASE_BACKOFF_MS = 1000; // 1 second base for exponential backoff

/**
 * Calculate next attempt time using exponential backoff with jitter.
 * Formula: base * 2^retryCount + random jitter (0-1000ms)
 *
 * Retry 1: ~2s, Retry 2: ~4s, Retry 3: ~8s, Retry 4: ~16s, Retry 5: ~32s
 */
function calculateNextAttempt(retryCount: number): Date {
  const backoffMs = BASE_BACKOFF_MS * Math.pow(2, retryCount);
  const jitterMs = Math.random() * 1000;
  return new Date(Date.now() + backoffMs + jitterMs);
}

/**
 * OutboxProcessor - Production-ready implementation with:
 *
 * 1. SKIP LOCKED: Multiple instances can run without processing duplicates
 * 2. Exponential Backoff: Failed events wait longer between retries
 * 3. Dead Letter: Events that exceed max retries go to DEAD status
 * 4. Stale Lock Recovery: Detects and recovers from crashed processors
 */
@Injectable()
export class OutboxProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly processorId = randomUUID();
  private isProcessing = false;
  private isShuttingDown = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {
    this.logger.log(`OutboxProcessor initialized with ID: ${this.processorId}`);
  }

  onModuleDestroy() {
    this.isShuttingDown = true;
    this.logger.log('OutboxProcessor shutting down gracefully...');
  }

  /**
   * Main processing loop - runs every 5 seconds.
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async processOutbox(): Promise<void> {
    if (this.isProcessing || this.isShuttingDown) {
      return;
    }

    this.isProcessing = true;

    try {
      // First, recover any stale locks from crashed processors
      await this.recoverStaleLocks();

      // Then process pending events
      await this.processPendingEvents();
    } catch (error) {
      this.logger.error(
        `Outbox processing failed: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Recover events that were locked by crashed processors.
   * If an event has been locked for longer than LOCK_TIMEOUT_MS, release it.
   */
  private async recoverStaleLocks(): Promise<void> {
    const staleThreshold = new Date(Date.now() - LOCK_TIMEOUT_MS);

    const result = await this.db
      .update(outboxEvents)
      .set({
        status: 'PENDING',
        lockedAt: null,
        lockedBy: null,
      })
      .where(
        and(
          eq(outboxEvents.status, 'PROCESSING'),
          lte(outboxEvents.lockedAt, staleThreshold),
        ),
      )
      .returning({ id: outboxEvents.id });

    if (result.length > 0) {
      this.logger.warn(`Recovered ${result.length} stale locked events`);
    }
  }

  /**
   * Claim and process pending events using transaction isolation.
   * This ensures multiple processor instances don't grab the same events.
   */
  private async processPendingEvents(): Promise<void> {
    const now = new Date();

    // Attempt to claim events atomically
    try {
      const claimedEvents = await this.db.transaction(async (tx) => {
        // Select pending events first
        const pendingEvents = await tx
          .select()
          .from(outboxEvents)
          .where(
            and(
              eq(outboxEvents.status, 'PENDING'),
              lte(outboxEvents.nextAttemptAt, now),
            ),
          )
          .orderBy(outboxEvents.nextAttemptAt)
          .limit(BATCH_SIZE);

        if (pendingEvents.length === 0) {
          return [];
        }

        const eventIds = pendingEvents.map((e) => e.id);

        // Try to claim all events atomically
        const updated = await tx
          .update(outboxEvents)
          .set({
            status: 'PROCESSING',
            lockedAt: now,
            lockedBy: this.processorId,
          })
          .where(
            and(
              inArray(outboxEvents.id, eventIds),
              eq(outboxEvents.status, 'PENDING'), // Ensure still pending
            ),
          )
          .returning();

        return updated;
      });

      if (claimedEvents.length === 0) {
        return;
      }

      this.logger.log(`Claimed ${claimedEvents.length} events for processing`);

      for (const outboxEvent of claimedEvents) {
        if (this.isShuttingDown) {
          await this.releaseEvent(outboxEvent.id);
          this.logger.log('Shutdown requested, releasing remaining events');
          break;
        }

        await this.processEvent(outboxEvent);
      }
    } catch (error) {
      this.logger.error(
        `Failed to claim events: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Release an event back to PENDING (used during shutdown).
   */
  private async releaseEvent(eventId: string): Promise<void> {
    await this.db
      .update(outboxEvents)
      .set({
        status: 'PENDING',
        lockedAt: sql`NULL`,
        lockedBy: sql`NULL`,
      })
      .where(eq(outboxEvents.id, eventId));
  }

  /**
   * Process a single event: publish to bus and update status.
   */
  private async processEvent(outboxEvent: OutboxEvent): Promise<void> {
    try {
      const domainEvent = this.deserializeEvent(outboxEvent);

      await this.eventBus.publish(domainEvent);

      // Mark as processed
      await this.db
        .update(outboxEvents)
        .set({
          status: 'PROCESSED',
          processedAt: new Date(),
          lockedAt: sql`NULL`,
          lockedBy: sql`NULL`,
        })
        .where(eq(outboxEvents.id, outboxEvent.id));

      this.logger.debug(
        `Event ${outboxEvent.eventType}#${outboxEvent.id} processed successfully`,
      );
    } catch (error) {
      await this.handleEventFailure(outboxEvent, error);
    }
  }

  /**
   * Handle event processing failure with exponential backoff.
   * After max retries, event goes to DEAD status (poison pill).
   */
  private async handleEventFailure(
    outboxEvent: OutboxEvent,
    error: unknown,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const newRetryCount = outboxEvent.retryCount + 1;
    const maxRetries = outboxEvent.maxRetries ?? DEFAULT_MAX_RETRIES;

    const isPoison = newRetryCount >= maxRetries;
    const newStatus = isPoison ? 'DEAD' : 'PENDING';
    const nextAttempt = isPoison
      ? undefined
      : calculateNextAttempt(newRetryCount);

    await this.db
      .update(outboxEvents)
      .set({
        status: newStatus,
        retryCount: newRetryCount,
        lastError: errorMessage,
        nextAttemptAt: nextAttempt,
        lockedAt: sql`NULL`,
        lockedBy: sql`NULL`,
      })
      .where(eq(outboxEvents.id, outboxEvent.id));

    if (isPoison) {
      this.logger.error(
        `☠️  POISON PILL: Event ${outboxEvent.eventType}#${outboxEvent.id} moved to DEAD after ${maxRetries} retries. Last error: ${errorMessage}`,
      );
    } else {
      const nextAttemptIn = nextAttempt
        ? Math.round((nextAttempt.getTime() - Date.now()) / 1000)
        : 0;
      this.logger.warn(
        `Event ${outboxEvent.eventType}#${outboxEvent.id} failed (retry ${newRetryCount}/${maxRetries}). Next attempt in ${nextAttemptIn}s. Error: ${errorMessage}`,
      );
    }
  }

  /**
   * Convert stored outbox event back to a DomainEvent.
   */
  private deserializeEvent(outboxEvent: OutboxEvent): DomainEvent {
    const parsedPayload = JSON.parse(outboxEvent.payload);

    return {
      eventType: outboxEvent.eventType,
      aggregateType: outboxEvent.aggregateType,
      aggregateId: outboxEvent.aggregateId,
      payload: parsedPayload.payload ?? parsedPayload,
      occurredAt: new Date(parsedPayload.occurredAt ?? outboxEvent.createdAt),
      correlationId: parsedPayload.correlationId,
    };
  }

  /**
   * Manual trigger for processing (useful for testing).
   */
  async processNow(): Promise<number> {
    if (this.isProcessing) {
      throw new Error('Processing already in progress');
    }

    this.isProcessing = true;
    let processedCount = 0;

    try {
      await this.recoverStaleLocks();

      const now = new Date();
      const claimedEvents = await this.db.transaction(async (tx) => {
        // Select pending events first
        const pendingEvents = await tx
          .select()
          .from(outboxEvents)
          .where(
            and(
              eq(outboxEvents.status, 'PENDING'),
              lte(outboxEvents.nextAttemptAt, now),
            ),
          )
          .orderBy(outboxEvents.nextAttemptAt)
          .limit(BATCH_SIZE);

        if (pendingEvents.length === 0) {
          return [];
        }

        const eventIds = pendingEvents.map((e) => e.id);

        // Try to claim all events atomically
        const updated = await tx
          .update(outboxEvents)
          .set({
            status: 'PROCESSING',
            lockedAt: now,
            lockedBy: this.processorId,
          })
          .where(
            and(
              inArray(outboxEvents.id, eventIds),
              eq(outboxEvents.status, 'PENDING'),
            ),
          )
          .returning();

        return updated;
      });

      for (const event of claimedEvents) {
        await this.processEvent(event);
        processedCount++;
      }

      return processedCount;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get statistics about the outbox (useful for monitoring).
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    processed: number;
    failed: number;
    dead: number;
  }> {
    const result = await this.db
      .select({
        status: outboxEvents.status,
        count: sql<number>`count(*)::int`,
      })
      .from(outboxEvents)
      .groupBy(outboxEvents.status);

    const stats = {
      pending: 0,
      processing: 0,
      processed: 0,
      failed: 0,
      dead: 0,
    };

    for (const row of result) {
      if (row.status === 'PENDING') stats.pending = row.count;
      if (row.status === 'PROCESSING') stats.processing = row.count;
      if (row.status === 'PROCESSED') stats.processed = row.count;
      if (row.status === 'FAILED') stats.failed = row.count;
      if (row.status === 'DEAD') stats.dead = row.count;
    }

    return stats;
  }

  /**
   * Retry dead events manually (for ops intervention).
   */
  async retryDeadEvents(eventIds: string[]): Promise<number> {
    if (eventIds.length === 0) return 0;

    const result = await this.db
      .update(outboxEvents)
      .set({
        status: 'PENDING',
        retryCount: 0,
        nextAttemptAt: new Date(),
        lastError: null,
      })
      .where(
        and(
          eq(outboxEvents.status, 'DEAD'),
          inArray(outboxEvents.id, eventIds),
        ),
      )
      .returning({ id: outboxEvents.id });

    this.logger.log(`Requeued ${result.length} dead events for retry`);
    return result.length;
  }

  /**
   * Get dead events for inspection (ops dashboard).
   */
  async getDeadEvents(limit = 100): Promise<OutboxEvent[]> {
    return this.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.status, 'DEAD'))
      .orderBy(outboxEvents.createdAt)
      .limit(limit);
  }
}
