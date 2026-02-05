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
   * Creates a mock that supports Drizzle transaction pattern.
   *
   * The new OutboxProcessor uses:
   * 1. db.transaction(async (tx) => { ... })
   * 2. tx.select().from().where()... chained calls
   * 3. tx.update().set().where().returning()
   * 4. db.select().from().where().orderBy().limit()
   */
  function createMockDb() {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockLimit = vi.fn().mockResolvedValue([]);

    const mockOrderBy = vi.fn().mockReturnValue({
      limit: mockLimit,
    });

    const mockWhere = vi.fn().mockReturnValue({
      returning: mockReturning,
      orderBy: mockOrderBy,
    });

    const mockSet = vi.fn().mockReturnValue({
      where: mockWhere,
      returning: mockReturning,
    });

    const mockUpdate = vi.fn().mockReturnValue({
      set: mockSet,
    });

    // Mock transaction - used for claiming events
    const mockSelectInTx = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: mockOrderBy,
      }),
    });

    const mockTransaction = vi.fn(async (callback) => {
      const txMock = {
        select: mockSelectInTx,
        update: mockUpdate,
      };
      return callback(txMock);
    });

    const mockGroupBy = vi.fn().mockResolvedValue([]);

    // Mock for getStats and getDeadEvents: select().from().where().orderBy().limit()
    // This needs to handle multiple call scenarios
    const mockFrom = vi.fn().mockReturnValue({
      where: mockWhere,
      groupBy: mockGroupBy,
    });

    const mockSelect = vi.fn().mockReturnValue({
      from: mockFrom,
    });

    return {
      select: mockSelect,
      update: mockUpdate,
      where: mockWhere,
      orderBy: mockOrderBy,
      limit: mockLimit,
      groupBy: mockGroupBy,
      returning: mockReturning,
      set: mockSet,
      transaction: mockTransaction,
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
      // Stale recovery returns nothing
      mockDb.returning.mockResolvedValue([]);
      // Transaction returns empty list (no pending events to claim)
      mockDb.transaction.mockResolvedValue([]);

      await processor.processOutbox();

      expect(mockDb.update).toHaveBeenCalled(); // Stale lock recovery
      expect(mockDb.transaction).toHaveBeenCalled(); // Claim via transaction
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
        processedAt: null,
        lastError: null,
      };

      // Stale recovery returns nothing
      mockDb.returning.mockResolvedValue([]);
      // Transaction returns our pending event (claimed)
      mockDb.transaction.mockResolvedValue([pendingEvent]);

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
      let resolveTransaction: () => void;
      const transactionCalled = new Promise<void>(
        (r) => (resolveTransaction = r),
      );

      // Make stale recovery instant but transaction take time
      mockDb.returning.mockResolvedValue([]);
      mockDb.transaction.mockImplementation(async (callback) => {
        resolveTransaction();
        await new Promise((resolve) => setTimeout(resolve, 100));
        return [];
      });

      // Start two concurrent calls
      const promise1 = processor.processOutbox();

      // Wait for first to start executing
      await transactionCalled;

      // Start second while first is still running
      const promise2 = processor.processOutbox();

      await Promise.all([promise1, promise2]);

      // transaction should only be called once (first run claims, second is skipped)
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
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
        lockedAt: new Date(),
        lockedBy: 'test-processor',
        processedAt: null,
        lastError: null,
      };

      // Stale recovery returns nothing
      mockDb.returning.mockResolvedValue([]);
      // Transaction returns our poison event
      mockDb.transaction.mockResolvedValue([poisonEvent]);

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
        lockedAt: new Date(),
        lockedBy: 'test-processor',
        processedAt: null,
        lastError: null,
      };

      // Stale recovery returns nothing
      mockDb.returning.mockResolvedValue([]);
      // Transaction returns our failing event
      mockDb.transaction.mockResolvedValue([failingEvent]);

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
      expect(mockDb.transaction).not.toHaveBeenCalled();
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
