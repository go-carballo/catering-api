import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import {
  ApplyExpectedFallbackUseCase,
  ApplyExpectedFallbackResult,
} from './apply-expected-fallback.use-case';
import { ServiceDayRepository } from '../../domain/service-day.repository';
import { ServiceDayEntity } from '../../domain/service-day.entity';
import { ContractEntity } from '../../../contract/domain/contract.entity';
import { Clock } from '../../../../shared/domain/clock.port';

describe('ApplyExpectedFallbackUseCase', () => {
  let useCase: ApplyExpectedFallbackUseCase;
  let mockRepository: ServiceDayRepository;
  let mockClock: Clock;

  const fixedNow = new Date('2025-01-15T12:00:00Z');
  const serviceDayId = 'service-day-123';
  const contractId = 'contract-123';
  const cateringCompanyId = 'catering-123';
  const clientCompanyId = 'client-123';

  /**
   * Create a service day entity for testing.
   * Default: past deadline (service date in the past), no expected quantity
   */
  const createServiceDay = (
    overrides: Partial<{
      serviceDate: Date;
      expectedQuantity: number | null;
      expectedConfirmedAt: Date | null;
      status: 'PENDING' | 'CONFIRMED';
    }> = {},
  ): ServiceDayEntity =>
    ServiceDayEntity.fromData({
      id: serviceDayId,
      contractId,
      serviceDate: overrides.serviceDate ?? new Date('2025-01-14T10:00:00Z'), // yesterday - past deadline
      expectedQuantity: overrides.expectedQuantity ?? null,
      servedQuantity: null,
      expectedConfirmedAt: overrides.expectedConfirmedAt ?? null,
      servedConfirmedAt: null,
      status: overrides.status ?? 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  /**
   * Create a contract entity for testing.
   */
  const createContract = (
    overrides: Partial<{
      minDailyQuantity: number;
      maxDailyQuantity: number;
      noticePeriodHours: number;
      status: 'ACTIVE' | 'PAUSED' | 'TERMINATED';
    }> = {},
  ): ContractEntity =>
    ContractEntity.fromData({
      id: contractId,
      cateringCompanyId,
      clientCompanyId,
      startDate: new Date('2025-01-01'),
      endDate: null,
      pricePerService: 10.5,
      flexibleQuantity: true,
      minDailyQuantity: overrides.minDailyQuantity ?? 10,
      maxDailyQuantity: overrides.maxDailyQuantity ?? 100,
      noticePeriodHours: overrides.noticePeriodHours ?? 24,
      serviceDays: [1, 2, 3, 4, 5],
      status: overrides.status ?? 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeEach(() => {
    mockClock = {
      now: vi.fn(() => fixedNow),
    };

    mockRepository = {
      findByIdWithContract: vi.fn(),
      findEligibleForFallback: vi.fn(),
      save: vi.fn(),
    };

    useCase = new ApplyExpectedFallbackUseCase(mockRepository, mockClock);
  });

  describe('Success scenarios', () => {
    it('should apply fallback to eligible service days', async () => {
      const serviceDay = createServiceDay();
      const contract = createContract({ minDailyQuantity: 15 });

      vi.mocked(mockRepository.findEligibleForFallback).mockResolvedValue([
        { serviceDay, contract },
      ]);
      vi.mocked(mockRepository.save).mockImplementation((entity) =>
        Promise.resolve(entity.toData()),
      );

      const result = await useCase.execute();

      expect(result.processedCount).toBe(1);
      expect(result.appliedCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.applied).toHaveLength(1);
      expect(result.applied[0]).toEqual({
        serviceDayId,
        contractId,
        serviceDate: expect.any(Date),
        appliedQuantity: 15,
      });

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: serviceDayId,
        }),
      );
    });

    it('should apply fallback to multiple service days', async () => {
      const serviceDay1 = createServiceDay();
      const serviceDay2 = ServiceDayEntity.fromData({
        ...createServiceDay().toData(),
        id: 'service-day-456',
      });
      const contract = createContract({ minDailyQuantity: 20 });

      vi.mocked(mockRepository.findEligibleForFallback).mockResolvedValue([
        { serviceDay: serviceDay1, contract },
        { serviceDay: serviceDay2, contract },
      ]);
      vi.mocked(mockRepository.save).mockImplementation((entity) =>
        Promise.resolve(entity.toData()),
      );

      const result = await useCase.execute();

      expect(result.processedCount).toBe(2);
      expect(result.appliedCount).toBe(2);
      expect(result.applied).toHaveLength(2);
      expect(mockRepository.save).toHaveBeenCalledTimes(2);
    });

    it('should return empty result when no eligible service days', async () => {
      vi.mocked(mockRepository.findEligibleForFallback).mockResolvedValue([]);

      const result = await useCase.execute();

      expect(result.processedCount).toBe(0);
      expect(result.appliedCount).toBe(0);
      expect(result.skippedCount).toBe(0);
      expect(result.applied).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('Skip scenarios', () => {
    it('should skip service day that already has expected quantity', async () => {
      // This shouldn't normally happen if the query is correct,
      // but the entity provides a second layer of defense
      const serviceDay = createServiceDay({
        expectedQuantity: 50,
        expectedConfirmedAt: new Date(),
      });
      const contract = createContract();

      vi.mocked(mockRepository.findEligibleForFallback).mockResolvedValue([
        { serviceDay, contract },
      ]);

      const result = await useCase.execute();

      expect(result.processedCount).toBe(1);
      expect(result.appliedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should skip confirmed service day', async () => {
      const serviceDay = createServiceDay({ status: 'CONFIRMED' });
      const contract = createContract();

      vi.mocked(mockRepository.findEligibleForFallback).mockResolvedValue([
        { serviceDay, contract },
      ]);

      const result = await useCase.execute();

      expect(result.processedCount).toBe(1);
      expect(result.appliedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should continue processing after save error and report it', async () => {
      const serviceDay1 = createServiceDay();
      const serviceDay2 = ServiceDayEntity.fromData({
        ...createServiceDay().toData(),
        id: 'service-day-456',
      });
      const contract = createContract();

      vi.mocked(mockRepository.findEligibleForFallback).mockResolvedValue([
        { serviceDay: serviceDay1, contract },
        { serviceDay: serviceDay2, contract },
      ]);

      // First save fails, second succeeds
      vi.mocked(mockRepository.save)
        .mockRejectedValueOnce(new Error('DB connection lost'))
        .mockImplementationOnce((entity) => Promise.resolve(entity.toData()));

      const result = await useCase.execute();

      expect(result.processedCount).toBe(2);
      expect(result.appliedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        serviceDayId,
        error: 'DB connection lost',
      });
    });
  });

  describe('Contract minDailyQuantity', () => {
    it('should use contract minDailyQuantity as fallback value', async () => {
      const serviceDay = createServiceDay();
      const contract = createContract({ minDailyQuantity: 25 });

      vi.mocked(mockRepository.findEligibleForFallback).mockResolvedValue([
        { serviceDay, contract },
      ]);
      vi.mocked(mockRepository.save).mockImplementation((entity) =>
        Promise.resolve(entity.toData()),
      );

      const result = await useCase.execute();

      expect(result.applied[0].appliedQuantity).toBe(25);
    });

    it('should handle different minDailyQuantity for different contracts', async () => {
      const serviceDay1 = createServiceDay();
      const contract1 = createContract({ minDailyQuantity: 10 });

      const serviceDay2 = ServiceDayEntity.fromData({
        ...createServiceDay().toData(),
        id: 'service-day-456',
        contractId: 'contract-456',
      });
      const contract2 = ContractEntity.fromData({
        ...createContract().toData(),
        id: 'contract-456',
        minDailyQuantity: 30,
      });

      vi.mocked(mockRepository.findEligibleForFallback).mockResolvedValue([
        { serviceDay: serviceDay1, contract: contract1 },
        { serviceDay: serviceDay2, contract: contract2 },
      ]);
      vi.mocked(mockRepository.save).mockImplementation((entity) =>
        Promise.resolve(entity.toData()),
      );

      const result = await useCase.execute();

      expect(result.applied).toHaveLength(2);
      expect(result.applied[0].appliedQuantity).toBe(10);
      expect(result.applied[1].appliedQuantity).toBe(30);
    });
  });
});
