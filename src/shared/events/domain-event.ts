/**
 * Base interface for all domain events.
 * Every event MUST have these properties to be traceable and replayable.
 */
export interface DomainEvent<T = unknown> {
  /** Unique event type identifier (e.g., 'contract.created', 'service-day.confirmed') */
  readonly eventType: string;

  /** The aggregate/entity type that produced this event */
  readonly aggregateType: string;

  /** The ID of the aggregate/entity instance */
  readonly aggregateId: string;

  /** Event payload - the actual data */
  readonly payload: T;

  /** When the event occurred */
  readonly occurredAt: Date;

  /** Optional correlation ID for tracing across services */
  readonly correlationId?: string;
}

/**
 * Abstract base class for domain events.
 * Extend this to create concrete event types with type-safe payloads.
 */
export abstract class BaseDomainEvent<T = unknown> implements DomainEvent<T> {
  abstract readonly eventType: string;
  abstract readonly aggregateType: string;
  readonly occurredAt: Date;
  readonly correlationId?: string;

  constructor(
    readonly aggregateId: string,
    readonly payload: T,
    correlationId?: string,
  ) {
    this.occurredAt = new Date();
    this.correlationId = correlationId;
  }

  /**
   * Serialize the event for storage in the outbox.
   */
  toJSON(): Record<string, unknown> {
    return {
      eventType: this.eventType,
      aggregateType: this.aggregateType,
      aggregateId: this.aggregateId,
      payload: this.payload,
      occurredAt: this.occurredAt.toISOString(),
      correlationId: this.correlationId,
    };
  }
}
