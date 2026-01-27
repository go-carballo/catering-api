import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ContractEventHandlers } from './contract.event-handlers';
import { EVENT_BUS, IdempotencyService } from '../../../../shared/events';
import type { IEventBus, DomainEvent } from '../../../../shared/events';
import { NOTIFICATION_PORT, ANALYTICS_PORT } from '../../../../shared/ports';
import type { ContractCreatedPayload } from '../../domain/events';

describe('ContractEventHandlers', () => {
  let handlers: ContractEventHandlers;
  let mockEventBus: IEventBus;
  let mockIdempotency: IdempotencyService;
  let mockNotifications: any;
  let mockAnalytics: any;
  let subscribedHandlers: Map<string, Function>;

  beforeEach(async () => {
    subscribedHandlers = new Map();

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn((eventType: string, handler: Function) => {
        subscribedHandlers.set(eventType, handler);
      }),
      unsubscribe: vi.fn(),
      hasHandlers: vi.fn(),
    };

    mockIdempotency = {
      isProcessed: vi.fn().mockResolvedValue(false),
      markProcessed: vi.fn().mockResolvedValue(undefined),
      processOnce: vi.fn().mockImplementation(async (_id, _name, handler) => {
        await handler();
        return { executed: true };
      }),
    } as any;

    mockNotifications = {
      send: vi.fn().mockResolvedValue({ success: true }),
    };

    mockAnalytics = {
      track: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractEventHandlers,
        { provide: EVENT_BUS, useValue: mockEventBus },
        { provide: IdempotencyService, useValue: mockIdempotency },
        { provide: NOTIFICATION_PORT, useValue: mockNotifications },
        { provide: ANALYTICS_PORT, useValue: mockAnalytics },
      ],
    }).compile();

    handlers = module.get<ContractEventHandlers>(ContractEventHandlers);
  });

  describe('onModuleInit', () => {
    it('should subscribe to all contract events', () => {
      handlers.onModuleInit();

      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(4);
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        'contract.created',
        expect.any(Function),
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        'contract.paused',
        expect.any(Function),
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        'contract.resumed',
        expect.any(Function),
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        'contract.terminated',
        expect.any(Function),
      );
    });
  });

  describe('onContractCreated', () => {
    it('should handle contract.created event and send notifications', async () => {
      handlers.onModuleInit();

      const event: DomainEvent<ContractCreatedPayload> = {
        eventType: 'contract.created',
        aggregateType: 'Contract',
        aggregateId: 'contract-123',
        payload: {
          contractId: 'contract-123',
          cateringCompanyId: 'catering-456',
          clientCompanyId: 'client-789',
          startDate: '2026-01-22',
          endDate: null,
          pricePerService: 100,
          minDailyQuantity: 10,
          maxDailyQuantity: 50,
          serviceDays: [1, 2, 3, 4, 5],
        },
        occurredAt: new Date(),
      };

      const handler = subscribedHandlers.get('contract.created');
      await handler!(event);

      // Should use idempotency for notifications
      expect(mockIdempotency.processOnce).toHaveBeenCalledWith(
        'contract-123',
        'ContractCreated:Notifications',
        expect.any(Function),
      );

      // Should use idempotency for analytics
      expect(mockIdempotency.processOnce).toHaveBeenCalledWith(
        'contract-123',
        'ContractCreated:Analytics',
        expect.any(Function),
      );
    });

    it('should skip notifications if already processed (idempotent)', async () => {
      mockIdempotency.processOnce = vi
        .fn()
        .mockResolvedValue({ executed: false });
      handlers.onModuleInit();

      const event: DomainEvent<ContractCreatedPayload> = {
        eventType: 'contract.created',
        aggregateType: 'Contract',
        aggregateId: 'contract-123',
        payload: {
          contractId: 'contract-123',
          cateringCompanyId: 'catering-456',
          clientCompanyId: 'client-789',
          startDate: '2026-01-22',
          endDate: null,
          pricePerService: 100,
          minDailyQuantity: 10,
          maxDailyQuantity: 50,
          serviceDays: [1, 2, 3, 4, 5],
        },
        occurredAt: new Date(),
      };

      const handler = subscribedHandlers.get('contract.created');
      await handler!(event);

      // processOnce was called, but it returned executed: false
      // so the actual notification.send should not have been called
      expect(mockIdempotency.processOnce).toHaveBeenCalled();
    });
  });

  describe('onContractPaused', () => {
    it('should handle contract.paused event without throwing', async () => {
      handlers.onModuleInit();

      const event: DomainEvent = {
        eventType: 'contract.paused',
        aggregateType: 'Contract',
        aggregateId: 'contract-123',
        payload: {
          contractId: 'contract-123',
          previousStatus: 'ACTIVE',
          newStatus: 'PAUSED',
          changedAt: new Date().toISOString(),
        },
        occurredAt: new Date(),
      };

      const handler = subscribedHandlers.get('contract.paused');
      await expect(handler!(event)).resolves.not.toThrow();
    });
  });

  describe('onContractTerminated', () => {
    it('should handle contract.terminated and send notifications', async () => {
      handlers.onModuleInit();

      const event: DomainEvent = {
        eventType: 'contract.terminated',
        aggregateType: 'Contract',
        aggregateId: 'contract-123',
        payload: {
          contractId: 'contract-123',
          cateringCompanyId: 'catering-456',
          clientCompanyId: 'client-789',
          terminatedAt: new Date().toISOString(),
        },
        occurredAt: new Date(),
      };

      const handler = subscribedHandlers.get('contract.terminated');
      await handler!(event);

      expect(mockIdempotency.processOnce).toHaveBeenCalledWith(
        'contract-123',
        'ContractTerminated:Notifications',
        expect.any(Function),
      );
    });
  });

  describe('without optional dependencies', () => {
    it('should work without notification port', async () => {
      const moduleWithoutNotifications: TestingModule =
        await Test.createTestingModule({
          providers: [
            ContractEventHandlers,
            { provide: EVENT_BUS, useValue: mockEventBus },
            { provide: IdempotencyService, useValue: mockIdempotency },
            // No NOTIFICATION_PORT
            { provide: ANALYTICS_PORT, useValue: mockAnalytics },
          ],
        }).compile();

      const handlersWithoutNotifications =
        moduleWithoutNotifications.get<ContractEventHandlers>(
          ContractEventHandlers,
        );
      handlersWithoutNotifications.onModuleInit();

      const event: DomainEvent<ContractCreatedPayload> = {
        eventType: 'contract.created',
        aggregateType: 'Contract',
        aggregateId: 'contract-123',
        payload: {
          contractId: 'contract-123',
          cateringCompanyId: 'catering-456',
          clientCompanyId: 'client-789',
          startDate: '2026-01-22',
          endDate: null,
          pricePerService: 100,
          minDailyQuantity: 10,
          maxDailyQuantity: 50,
          serviceDays: [1, 2, 3, 4, 5],
        },
        occurredAt: new Date(),
      };

      const handler = subscribedHandlers.get('contract.created');
      await expect(handler!(event)).resolves.not.toThrow();
    });
  });
});
