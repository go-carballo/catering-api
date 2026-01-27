import { Injectable, Logger } from '@nestjs/common';
import { IEventBus, EventHandler } from './event-bus.interface';
import { DomainEvent } from './domain-event';

/**
 * In-memory implementation of EventBus.
 * Perfect for single-instance deployments or as a starting point.
 *
 * For distributed systems, swap this with Redis Pub/Sub, RabbitMQ, etc.
 */
@Injectable()
export class InMemoryEventBus implements IEventBus {
  private readonly logger = new Logger(InMemoryEventBus.name);
  private readonly handlers = new Map<string, Set<EventHandler>>();

  async publish(event: DomainEvent): Promise<void> {
    const eventHandlers = this.handlers.get(event.eventType);

    if (!eventHandlers || eventHandlers.size === 0) {
      this.logger.debug(`No handlers registered for event: ${event.eventType}`);
      return;
    }

    this.logger.log(
      `Publishing event ${event.eventType} for ${event.aggregateType}#${event.aggregateId}`,
    );

    const promises = Array.from(eventHandlers).map(async (handler) => {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(
          `Handler failed for event ${event.eventType}: ${error instanceof Error ? error.message : error}`,
        );
        throw error; // Re-throw to let OutboxProcessor handle retries
      }
    });

    // Wait for all handlers to complete
    // If any fails, the event will be retried by OutboxProcessor
    await Promise.all(promises);
  }

  subscribe<T = unknown>(eventType: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as EventHandler);
    this.logger.log(`Handler subscribed to: ${eventType}`);
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    const eventHandlers = this.handlers.get(eventType);
    if (eventHandlers) {
      eventHandlers.delete(handler);
      if (eventHandlers.size === 0) {
        this.handlers.delete(eventType);
      }
    }
  }

  hasHandlers(eventType: string): boolean {
    const eventHandlers = this.handlers.get(eventType);
    return !!eventHandlers && eventHandlers.size > 0;
  }

  /**
   * Get all registered event types (useful for debugging)
   */
  getRegisteredEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
