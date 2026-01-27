import { DomainEvent, BaseDomainEvent } from '../events';
import { outboxEvents } from '../infrastructure/database/schema';

/**
 * Serialize an event to JSON string for storage.
 */
function serializeEvent(event: DomainEvent): string {
  if (event instanceof BaseDomainEvent) {
    return JSON.stringify(event.toJSON());
  }
  return JSON.stringify({
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload,
    occurredAt: event.occurredAt.toISOString(),
    correlationId: event.correlationId,
  });
}

/**
 * Outbox Repository - handles persisting events to the outbox table.
 *
 * IMPORTANT: This is designed to work WITHIN an existing transaction,
 * ensuring atomicity between your business operation and the event.
 */
export class OutboxRepository {
  /**
   * Store an event in the outbox table within the given transaction.
   *
   * @param tx - The Drizzle transaction context
   * @param event - The domain event to store
   */
  static async storeEvent(tx: any, event: DomainEvent): Promise<void> {
    await tx.insert(outboxEvents).values({
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: serializeEvent(event),
      status: 'PENDING',
      retryCount: 0,
    });
  }

  /**
   * Store multiple events in the outbox table within the given transaction.
   *
   * @param tx - The Drizzle transaction context
   * @param events - The domain events to store
   */
  static async storeEvents(tx: any, events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    await tx.insert(outboxEvents).values(
      events.map((event) => ({
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: serializeEvent(event),
        status: 'PENDING' as const,
        retryCount: 0,
      })),
    );
  }
}
