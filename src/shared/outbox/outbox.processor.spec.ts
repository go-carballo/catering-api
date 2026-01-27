import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { OutboxProcessor } from './outbox.processor';
import { DRIZZLE } from '../infrastructure/database/database.module';
import { EVENT_BUS } from '../events';
import type { IEventBus } from '../events';

describe('OutboxProcessor', () => {
  let processor: OutboxProcessor;
  let mockDb: any;
  let mockEventBus: IEventBus;

  /**
   * Creates a mock that supports both chained Drizzle calls AND raw execute.
   *
   * The OutboxProcessor uses two different patterns:
   * 1. Chained calls: db.update(...).set(...).where(...).returning(...)
   * 2. Raw SQL: db.execute(sql`...`)
   *
   * This mock supports both.
   */
  function createMockDb() {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnThis();
    const mockSet = vi.fn().mockReturnValue({
      where: mockWhere,
      returning: mockReturning,
    });
    const mockUpdate = vi.fn().mockReturnValue({
      set: mockSet,
      where: mockWhere,
      returning: mockReturning,
    });
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockGroupBy = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: mockOrderBy,
        groupBy: mockGroupBy,
      }),
      groupBy: mockGroupBy,
    });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    // Track update calls to return proper chain
    mockWhere.mockImplementation(() => ({
      returning: mockReturning,
    }));

    return {
      select: mockSelect,
      from: mockFrom,
      update: mockUpdate,
      set: mockSet,
      where: mockWhere,
      orderBy: mockOrderBy,
      limit: mockLimit,
      groupBy: mockGroupBy,
      returning: mockReturning,
      execute: vi.fn().mockResolvedValue([]), // For raw SQL with SKIP LOCKED
    };
  }

  beforeEach(async () => {
    mockDb = createMockDb();

    mockEventBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      hasHandlers: vi.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxProcessor,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: EVENT_BUS, useValue: mockEventBus },
      ],
    }).compile();

    processor = module.get<OutboxProcessor>(OutboxProcessor);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('processOutbox', () => {
    it('should not process when no pending events', async () => {
      // Stale recovery returns nothing, claim returns nothing
      mockDb.returning.mockResolvedValue([]); // stale recovery
      mockDb.execute.mockResolvedValue([]); // claim returns empty

      await processor.processOutbox();

      expect(mockDb.update).toHaveBeenCalled(); // Stale lock recovery
      expect(mockDb.execute).toHaveBeenCalled(); // Claim query
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('should claim and process pending events', async () => {
      const pendingEvent = {
        id: 'event-123',
        eventType: 'contract.created',
        aggregateType: 'Contract',
        aggregateId: 'contract-456',
        payload: JSON.stringify({
          eventType: 'contract.created',
          aggregateType: 'Contract',
          aggregateId: 'contract-456',
          payload: { contractId: 'contract-456' },
          occurredAt: new Date().toISOString(),
        }),
        status: 'PROCESSING',
        retryCount: 0,
        maxRetries: 5,
        createdAt: new Date(),
        nextAttemptAt: new Date(),
        lockedAt: new Date(),
        lockedBy: 'test-processor',
      };

      // Stale recovery returns nothing
      mockDb.returning.mockResolvedValue([]);
      // Claim returns our pending event
      mockDb.execute.mockResolvedValue([pendingEvent]);

      await processor.processOutbox();

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'contract.created',
          aggregateId: 'contract-456',
        }),
      );
      // Update is called twice: once for stale recovery, once for marking processed
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should not run concurrently', async () => {
      let resolveExecute: () => void;
      const executeCalled = new Promise<void>((r) => (resolveExecute = r));

      // Make stale recovery instant but execute take time
      mockDb.returning.mockResolvedValue([]);
      mockDb.execute.mockImplementation(() => {
        resolveExecute();
        return new Promise((resolve) => setTimeout(() => resolve([]), 100));
      });

      // Start two concurrent calls
      const promise1 = processor.processOutbox();

      // Wait for first to start executing
      await executeCalled;

      // Start second while first is still running
      const promise2 = processor.processOutbox();

      await Promise.all([promise1, promise2]);

      // Execute should only be called once (first run claims, second is skipped)
      expect(mockDb.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStats', () => {
    it('should return stats grouped by status including new statuses', async () => {
      const statsData = [
        { status: 'PENDING', count: 5 },
        { status: 'PROCESSING', count: 2 },
        { status: 'PROCESSED', count: 100 },
        { status: 'FAILED', count: 3 },
        { status: 'DEAD', count: 1 },
      ];

      mockDb.groupBy.mockResolvedValue(statsData);

      const stats = await processor.getStats();

      expect(stats).toEqual({
        pending: 5,
        processing: 2,
        processed: 100,
        failed: 3,
        dead: 1,
      });
    });

    it('should return zeros when no events exist', async () => {
      mockDb.groupBy.mockResolvedValue([]);

      const stats = await processor.getStats();

      expect(stats).toEqual({
        pending: 0,
        processing: 0,
        processed: 0,
        failed: 0,
        dead: 0,
      });
    });
  });

  describe('backoff and retry logic', () => {
    it('should move event to DEAD status after max retries (poison pill)', async () => {
      const poisonEvent = {
        id: 'event-poison',
        eventType: 'test.event',
        aggregateType: 'Test',
        aggregateId: 'test-1',
        payload: JSON.stringify({ payload: {} }),
        status: 'PROCESSING',
        retryCount: 4, // One more failure = 5 = maxRetries
        maxRetries: 5,
        createdAt: new Date(),
        nextAttemptAt: new Date(),
      };

      // Stale recovery returns nothing
      mockDb.returning.mockResolvedValue([]);
      // Claim returns our poison event
      mockDb.execute.mockResolvedValue([poisonEvent]);

      // Make publish fail
      (mockEventBus.publish as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Permanent failure'),
      );

      // Capture what gets passed to set()
      let capturedSetArg: any;
      mockDb.set.mockImplementation((arg: any) => {
        capturedSetArg = arg;
        return {
          where: vi.fn().mockReturnValue({ returning: mockDb.returning }),
        };
      });

      await processor.processOutbox();

      // Verify set was called (to update the event)
      expect(mockDb.set).toHaveBeenCalled();

      // Find the call that has status: 'DEAD' (not the stale recovery call)
      const setCalls = mockDb.set.mock.calls;
      const deadCall = setCalls.find(
        (call: any[]) => call[0]?.status === 'DEAD',
      );

      expect(deadCall).toBeDefined();
      expect(deadCall[0].status).toBe('DEAD');
      expect(deadCall[0].retryCount).toBe(5);
      expect(deadCall[0].lastError).toBe('Permanent failure');
    });

    it('should set nextAttemptAt with exponential backoff on failure', async () => {
      const failingEvent = {
        id: 'event-fail',
        eventType: 'test.event',
        aggregateType: 'Test',
        aggregateId: 'test-1',
        payload: JSON.stringify({ payload: {} }),
        status: 'PROCESSING',
        retryCount: 1, // Will become 2
        maxRetries: 5,
        createdAt: new Date(),
        nextAttemptAt: new Date(),
      };

      // Stale recovery returns nothing
      mockDb.returning.mockResolvedValue([]);
      // Claim returns our failing event
      mockDb.execute.mockResolvedValue([failingEvent]);

      (mockEventBus.publish as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Temporary failure'),
      );

      const beforeProcess = Date.now();

      // Track set calls
      const setCalls: any[] = [];
      mockDb.set.mockImplementation((arg: any) => {
        setCalls.push(arg);
        return {
          where: vi.fn().mockReturnValue({ returning: mockDb.returning }),
        };
      });

      await processor.processOutbox();

      const afterProcess = Date.now();

      // Find the retry set call (has retryCount and nextAttemptAt)
      const retryCall = setCalls.find(
        (call: any) =>
          call.retryCount !== undefined && call.status === 'PENDING',
      );

      expect(retryCall).toBeDefined();
      expect(retryCall.status).toBe('PENDING'); // Still pending, not dead
      expect(retryCall.retryCount).toBe(2);

      // nextAttemptAt should be in the future with exponential backoff
      // For retry 2: base * 2^2 = 1000 * 4 = 4000ms + jitter
      const nextAttempt = retryCall.nextAttemptAt;
      expect(nextAttempt).toBeDefined();
      expect(nextAttempt.getTime()).toBeGreaterThan(afterProcess + 3000); // At least 3s
      expect(nextAttempt.getTime()).toBeLessThan(afterProcess + 6000); // At most ~5s + jitter
    });
  });

  describe('graceful shutdown', () => {
    it('should stop processing on module destroy', async () => {
      processor.onModuleDestroy();

      await processor.processOutbox();

      // Should not have tried to fetch events (early return due to shutdown)
      expect(mockDb.execute).not.toHaveBeenCalled();
    });
  });

  describe('retryDeadEvents', () => {
    it('should requeue dead events for retry', async () => {
      const deadEventIds = ['dead-1', 'dead-2'];

      mockDb.returning.mockResolvedValue([{ id: 'dead-1' }, { id: 'dead-2' }]);

      const count = await processor.retryDeadEvents(deadEventIds);

      expect(count).toBe(2);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should return 0 when no event ids provided', async () => {
      const count = await processor.retryDeadEvents([]);
      expect(count).toBe(0);
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('getDeadEvents', () => {
    it('should return dead events for inspection', async () => {
      const deadEvents = [
        { id: 'dead-1', eventType: 'test', status: 'DEAD' },
        { id: 'dead-2', eventType: 'test', status: 'DEAD' },
      ];

      mockDb.limit.mockResolvedValue(deadEvents);

      const events = await processor.getDeadEvents();

      expect(events).toEqual(deadEvents);
    });
  });
});
