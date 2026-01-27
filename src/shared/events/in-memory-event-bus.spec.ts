import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryEventBus } from './in-memory-event-bus';
import { BaseDomainEvent } from './domain-event';

// Test event class
class TestEvent extends BaseDomainEvent<{ message: string }> {
  readonly eventType = 'test.event';
  readonly aggregateType = 'TestAggregate';

  constructor(aggregateId: string, message: string) {
    super(aggregateId, { message });
  }
}

describe('InMemoryEventBus', () => {
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
  });

  describe('subscribe', () => {
    it('should register a handler for an event type', () => {
      const handler = vi.fn();

      eventBus.subscribe('test.event', handler);

      expect(eventBus.hasHandlers('test.event')).toBe(true);
    });

    it('should allow multiple handlers for the same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);

      expect(eventBus.hasHandlers('test.event')).toBe(true);
      expect(eventBus.getRegisteredEventTypes()).toContain('test.event');
    });
  });

  describe('publish', () => {
    it('should call all registered handlers when publishing an event', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);

      const event = new TestEvent('agg-123', 'Hello World');
      await eventBus.publish(event);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler1).toHaveBeenCalledWith(event);
    });

    it('should not fail when publishing to an event with no handlers', async () => {
      const event = new TestEvent('agg-123', 'No handlers');

      await expect(eventBus.publish(event)).resolves.not.toThrow();
    });

    it('should pass the correct event data to handlers', async () => {
      const handler = vi.fn();
      eventBus.subscribe('test.event', handler);

      const event = new TestEvent('agg-456', 'Test message');
      await eventBus.publish(event);

      const receivedEvent = handler.mock.calls[0][0];
      expect(receivedEvent.eventType).toBe('test.event');
      expect(receivedEvent.aggregateType).toBe('TestAggregate');
      expect(receivedEvent.aggregateId).toBe('agg-456');
      expect(receivedEvent.payload.message).toBe('Test message');
    });

    it('should throw when a handler fails', async () => {
      const failingHandler = vi
        .fn()
        .mockRejectedValue(new Error('Handler failed'));
      eventBus.subscribe('test.event', failingHandler);

      const event = new TestEvent('agg-123', 'Will fail');

      await expect(eventBus.publish(event)).rejects.toThrow('Handler failed');
    });

    it('should call all handlers even if one fails (parallel execution)', async () => {
      const successHandler = vi.fn();
      const failingHandler = vi.fn().mockRejectedValue(new Error('Oops'));

      eventBus.subscribe('test.event', successHandler);
      eventBus.subscribe('test.event', failingHandler);

      const event = new TestEvent('agg-123', 'Mixed results');

      await expect(eventBus.publish(event)).rejects.toThrow();
      expect(successHandler).toHaveBeenCalled();
      expect(failingHandler).toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('should remove a handler from an event type', async () => {
      const handler = vi.fn();

      eventBus.subscribe('test.event', handler);
      eventBus.unsubscribe('test.event', handler);

      const event = new TestEvent('agg-123', 'Should not be received');
      await eventBus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should only remove the specified handler', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);
      eventBus.unsubscribe('test.event', handler1);

      const event = new TestEvent('agg-123', 'Only handler2');
      await eventBus.publish(event);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should remove event type when last handler is unsubscribed', () => {
      const handler = vi.fn();

      eventBus.subscribe('test.event', handler);
      expect(eventBus.hasHandlers('test.event')).toBe(true);

      eventBus.unsubscribe('test.event', handler);
      expect(eventBus.hasHandlers('test.event')).toBe(false);
    });
  });

  describe('hasHandlers', () => {
    it('should return false for event types with no handlers', () => {
      expect(eventBus.hasHandlers('nonexistent.event')).toBe(false);
    });

    it('should return true for event types with handlers', () => {
      eventBus.subscribe('test.event', vi.fn());
      expect(eventBus.hasHandlers('test.event')).toBe(true);
    });
  });

  describe('getRegisteredEventTypes', () => {
    it('should return empty array when no handlers registered', () => {
      expect(eventBus.getRegisteredEventTypes()).toEqual([]);
    });

    it('should return all registered event types', () => {
      eventBus.subscribe('event.one', vi.fn());
      eventBus.subscribe('event.two', vi.fn());
      eventBus.subscribe('event.three', vi.fn());

      const types = eventBus.getRegisteredEventTypes();
      expect(types).toHaveLength(3);
      expect(types).toContain('event.one');
      expect(types).toContain('event.two');
      expect(types).toContain('event.three');
    });
  });
});
