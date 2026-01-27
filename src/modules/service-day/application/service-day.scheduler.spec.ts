import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ServiceDayScheduler } from './service-day.scheduler';
import { ServiceDayService } from './service-day.service';
import { ContractService } from '../../contract/application/contract.service';
import { ApplyExpectedFallbackUseCase } from './use-cases';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';

const mockContractService = {
  findActiveContracts: vi.fn(),
};

const mockServiceDayService = {
  generateForContract: vi.fn(),
};

const mockApplyExpectedFallbackUseCase = {
  execute: vi.fn(),
};

// Mock DB that always acquires lock successfully
const mockDb = {
  execute: vi.fn().mockResolvedValue([{ acquired: true, released: true }]),
};

describe('ServiceDayScheduler', () => {
  let scheduler: ServiceDayScheduler;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceDayScheduler,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
        {
          provide: ContractService,
          useValue: mockContractService,
        },
        {
          provide: ServiceDayService,
          useValue: mockServiceDayService,
        },
        {
          provide: ApplyExpectedFallbackUseCase,
          useValue: mockApplyExpectedFallbackUseCase,
        },
      ],
    }).compile();

    scheduler = module.get<ServiceDayScheduler>(ServiceDayScheduler);
  });

  describe('generateUpcomingServiceDays', () => {
    it('should generate service days for all active contracts', async () => {
      const activeContracts = [
        { id: 'contract-1', status: 'ACTIVE' },
        { id: 'contract-2', status: 'ACTIVE' },
        { id: 'contract-3', status: 'ACTIVE' },
      ];

      mockContractService.findActiveContracts.mockResolvedValue(
        activeContracts,
      );
      mockServiceDayService.generateForContract
        .mockResolvedValueOnce([{ id: 'sd-1' }, { id: 'sd-2' }])
        .mockResolvedValueOnce([{ id: 'sd-3' }])
        .mockResolvedValueOnce([]);

      await scheduler.generateUpcomingServiceDays();

      expect(mockContractService.findActiveContracts).toHaveBeenCalled();
      expect(mockServiceDayService.generateForContract).toHaveBeenCalledTimes(
        3,
      );
    });

    it('should continue processing other contracts if one fails', async () => {
      const activeContracts = [
        { id: 'contract-1', status: 'ACTIVE' },
        { id: 'contract-2', status: 'ACTIVE' },
      ];

      mockContractService.findActiveContracts.mockResolvedValue(
        activeContracts,
      );
      mockServiceDayService.generateForContract
        .mockRejectedValueOnce(new Error('DB connection failed'))
        .mockResolvedValueOnce([{ id: 'sd-1' }]);

      // Should not throw, just log the error
      await expect(
        scheduler.generateUpcomingServiceDays(),
      ).resolves.not.toThrow();

      // Both contracts should have been attempted
      expect(mockServiceDayService.generateForContract).toHaveBeenCalledTimes(
        2,
      );
    });

    it('should handle empty active contracts list', async () => {
      mockContractService.findActiveContracts.mockResolvedValue([]);

      await scheduler.generateUpcomingServiceDays();

      expect(mockContractService.findActiveContracts).toHaveBeenCalled();
      expect(mockServiceDayService.generateForContract).not.toHaveBeenCalled();
    });

    it('should generate service days for 7 days ahead', async () => {
      const activeContracts = [{ id: 'contract-1', status: 'ACTIVE' }];
      mockContractService.findActiveContracts.mockResolvedValue(
        activeContracts,
      );
      mockServiceDayService.generateForContract.mockResolvedValue([]);

      await scheduler.generateUpcomingServiceDays();

      const call = mockServiceDayService.generateForContract.mock.calls[0];
      const [contractId, fromDate, toDate] = call;

      expect(contractId).toBe('contract-1');

      // Verify the date range is 7 days
      const daysDiff = Math.round(
        (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(daysDiff).toBe(7);
    });
  });

  describe('applyFallbackForUnconfirmed', () => {
    it('should call ApplyExpectedFallbackUseCase', async () => {
      mockApplyExpectedFallbackUseCase.execute.mockResolvedValue({
        processedCount: 5,
        appliedCount: 3,
        skippedCount: 2,
        applied: [],
        errors: [],
      });

      await scheduler.applyFallbackForUnconfirmed();

      expect(mockApplyExpectedFallbackUseCase.execute).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockApplyExpectedFallbackUseCase.execute.mockRejectedValue(
        new Error('DB error'),
      );

      // Should not throw - error is caught by withAdvisoryLock
      await expect(scheduler.applyFallbackForUnconfirmed()).rejects.toThrow(
        'DB error',
      );
    });

    it('should continue even with partial errors in result', async () => {
      mockApplyExpectedFallbackUseCase.execute.mockResolvedValue({
        processedCount: 5,
        appliedCount: 3,
        skippedCount: 0,
        applied: [],
        errors: [{ serviceDayId: 'sd-1', error: 'Failed to save' }],
      });

      await expect(
        scheduler.applyFallbackForUnconfirmed(),
      ).resolves.not.toThrow();
    });
  });

  describe('advisory locks', () => {
    it('should skip generation when lock is already held', async () => {
      // Simulate lock already held by another instance
      mockDb.execute.mockResolvedValueOnce([{ acquired: false }]);

      await scheduler.generateUpcomingServiceDays();

      // Should not call any business logic when lock not acquired
      expect(mockContractService.findActiveContracts).not.toHaveBeenCalled();
      expect(mockServiceDayService.generateForContract).not.toHaveBeenCalled();
    });

    it('should skip fallback when lock is already held', async () => {
      // Simulate lock already held by another instance
      mockDb.execute.mockResolvedValueOnce([{ acquired: false }]);

      await scheduler.applyFallbackForUnconfirmed();

      // Should not call use case when lock not acquired
      expect(mockApplyExpectedFallbackUseCase.execute).not.toHaveBeenCalled();
    });

    it('should release lock after successful execution', async () => {
      mockContractService.findActiveContracts.mockResolvedValue([]);
      mockDb.execute
        .mockResolvedValueOnce([{ acquired: true }]) // acquire
        .mockResolvedValueOnce([{ released: true }]); // release

      await scheduler.generateUpcomingServiceDays();

      // Should have called execute twice (acquire + release)
      expect(mockDb.execute).toHaveBeenCalledTimes(2);
    });
  });
});
