import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyService } from './idempotency.service';
import { DRIZZLE } from '../infrastructure/database/database.module';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let mockDb: any;

  beforeEach(async () => {
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [IdempotencyService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
  });

  describe('isProcessed', () => {
    it('should return false when event has not been processed', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await service.isProcessed('event-123', 'TestHandler');

      expect(result).toBe(false);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return true when event has been processed', async () => {
      mockDb.limit.mockResolvedValue([{ id: 'record-1' }]);

      const result = await service.isProcessed('event-123', 'TestHandler');

      expect(result).toBe(true);
    });
  });

  describe('markProcessed', () => {
    it('should insert a record for the event and handler', async () => {
      await service.markProcessed('event-123', 'TestHandler');

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        eventId: 'event-123',
        handlerName: 'TestHandler',
        metadata: null,
      });
    });

    it('should include metadata when provided', async () => {
      await service.markProcessed('event-123', 'TestHandler', {
        messageId: 'msg-456',
      });

      expect(mockDb.values).toHaveBeenCalledWith({
        eventId: 'event-123',
        handlerName: 'TestHandler',
        metadata: JSON.stringify({ messageId: 'msg-456' }),
      });
    });

    it('should silently handle unique constraint violation (race condition)', async () => {
      const uniqueError = new Error('duplicate key value');
      (uniqueError as any).code = '23505'; // PostgreSQL unique violation

      mockDb.values.mockRejectedValue(uniqueError);

      // Should not throw
      await expect(
        service.markProcessed('event-123', 'TestHandler'),
      ).resolves.not.toThrow();
    });

    it('should rethrow non-unique-violation errors', async () => {
      const otherError = new Error('Connection lost');

      mockDb.values.mockRejectedValue(otherError);

      await expect(
        service.markProcessed('event-123', 'TestHandler'),
      ).rejects.toThrow('Connection lost');
    });
  });

  describe('processOnce', () => {
    it('should execute handler if event not processed', async () => {
      mockDb.limit.mockResolvedValue([]); // Not processed

      const handler = vi.fn().mockResolvedValue('result');

      const result = await service.processOnce(
        'event-123',
        'TestHandler',
        handler,
      );

      expect(result.executed).toBe(true);
      expect(result.result).toBe('result');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(mockDb.insert).toHaveBeenCalled(); // Marked as processed
    });

    it('should skip handler if event already processed', async () => {
      mockDb.limit.mockResolvedValue([{ id: 'record-1' }]); // Already processed

      const handler = vi.fn().mockResolvedValue('result');

      const result = await service.processOnce(
        'event-123',
        'TestHandler',
        handler,
      );

      expect(result.executed).toBe(false);
      expect(result.result).toBeUndefined();
      expect(handler).not.toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should pass metadata to markProcessed', async () => {
      mockDb.limit.mockResolvedValue([]);

      await service.processOnce(
        'event-123',
        'TestHandler',
        async () => 'done',
        { extra: 'info' },
      );

      expect(mockDb.values).toHaveBeenCalledWith({
        eventId: 'event-123',
        handlerName: 'TestHandler',
        metadata: JSON.stringify({ extra: 'info' }),
      });
    });

    it('should not mark as processed if handler throws', async () => {
      mockDb.limit.mockResolvedValue([]);

      const handler = vi.fn().mockRejectedValue(new Error('Handler failed'));

      await expect(
        service.processOnce('event-123', 'TestHandler', handler),
      ).rejects.toThrow('Handler failed');

      // Should NOT have inserted the processed record
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });
});
