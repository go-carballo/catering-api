import { DomainEvent } from './domain-event';

/**
 * Handler function type for processing domain events.
 */
export type EventHandler<T = unknown> = (
  event: DomainEvent<T>,
) => Promise<void>;

/**
 * Event Bus interface - the contract for publishing and subscribing to events.
 * This abstraction allows us to swap implementations (in-memory, Redis, RabbitMQ, etc.)
 */
export interface IEventBus {
  /**
   * Publish an event to all registered handlers.
   * In the outbox pattern, this is called by the OutboxProcessor, NOT directly by services.
   */
  publish(event: DomainEvent): Promise<void>;

  /**
   * Subscribe a handler to a specific event type.
   */
  subscribe<T = unknown>(eventType: string, handler: EventHandler<T>): void;

  /**
   * Unsubscribe a handler from an event type.
   */
  unsubscribe(eventType: string, handler: EventHandler): void;

  /**
   * Check if there are any handlers for a given event type.
   */
  hasHandlers(eventType: string): boolean;
}

export const EVENT_BUS = Symbol('EVENT_BUS');
