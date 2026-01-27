import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboxRepository } from './outbox.repository';
import { BaseDomainEvent } from '../events';

// Test event class
class TestCreatedEvent extends BaseDomainEvent<{
  name: string;
  value: number;
}> {
  readonly eventType = 'test.created';
  readonly aggregateType = 'TestEntity';

  constructor(aggregateId: string, name: string, value: number) {
    super(aggregateId, { name, value });
  }
}

describe('OutboxRepository', () => {
  let mockTx: {
    insert: ReturnType<typeof vi.fn>;
  };
  let mockValues: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockValues = vi.fn().mockResolvedValue(undefined);
    mockTx = {
      insert: vi.fn().mockReturnValue({ values: mockValues }),
    };
  });

  describe('storeEvent', () => {
    it('should insert a single event into outbox_events table', async () => {
      const event = new TestCreatedEvent('entity-123', 'Test Name', 42);

      await OutboxRepository.storeEvent(mockTx, event);

      expect(mockTx.insert).toHaveBeenCalledTimes(1);
      expect(mockValues).toHaveBeenCalledTimes(1);

      const insertedValues = mockValues.mock.calls[0][0];
      expect(insertedValues.eventType).toBe('test.created');
      expect(insertedValues.aggregateType).toBe('TestEntity');
      expect(insertedValues.aggregateId).toBe('entity-123');
      expect(insertedValues.status).toBe('PENDING');
      expect(insertedValues.retryCount).toBe(0);

      // Verify payload is JSON stringified
      const payload = JSON.parse(insertedValues.payload);
      expect(payload.payload.name).toBe('Test Name');
      expect(payload.payload.value).toBe(42);
    });

    it('should include correlationId in payload when provided', async () => {
      const event = new TestCreatedEvent('entity-456', 'Correlated', 100);
      // Manually set correlationId through constructor
      const correlatedEvent = new (class extends BaseDomainEvent<{
        name: string;
      }> {
        readonly eventType = 'test.correlated';
        readonly aggregateType = 'TestEntity';
        constructor() {
          super('entity-456', { name: 'Correlated' }, 'correlation-xyz');
        }
      })();

      await OutboxRepository.storeEvent(mockTx, correlatedEvent);

      const payload = JSON.parse(mockValues.mock.calls[0][0].payload);
      expect(payload.correlationId).toBe('correlation-xyz');
    });
  });

  describe('storeEvents', () => {
    it('should do nothing when events array is empty', async () => {
      await OutboxRepository.storeEvents(mockTx, []);

      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it('should insert multiple events in a single call', async () => {
      const events = [
        new TestCreatedEvent('entity-1', 'First', 1),
        new TestCreatedEvent('entity-2', 'Second', 2),
        new TestCreatedEvent('entity-3', 'Third', 3),
      ];

      await OutboxRepository.storeEvents(mockTx, events);

      expect(mockTx.insert).toHaveBeenCalledTimes(1);
      expect(mockValues).toHaveBeenCalledTimes(1);

      const insertedValues = mockValues.mock.calls[0][0];
      expect(insertedValues).toHaveLength(3);

      expect(insertedValues[0].aggregateId).toBe('entity-1');
      expect(insertedValues[1].aggregateId).toBe('entity-2');
      expect(insertedValues[2].aggregateId).toBe('entity-3');

      // All should have PENDING status
      insertedValues.forEach((val: any) => {
        expect(val.status).toBe('PENDING');
        expect(val.retryCount).toBe(0);
      });
    });
  });
});
