import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConfirmExpectedQuantityUseCase,
  ConfirmExpectedQuantityInput,
} from './confirm-expected-quantity.use-case';
import type { ServiceDayRepository } from '../../domain/service-day.repository';
import { ServiceDayEntity } from '../../domain/service-day.entity';
import { ContractEntity } from '../../../contract/domain/contract.entity';
import type { Clock } from '../../../../shared/domain/clock.port';

describe('ConfirmExpectedQuantityUseCase', () => {
  let useCase: ConfirmExpectedQuantityUseCase;
  let mockRepository: ServiceDayRepository;
  let mockClock: Clock;

  // Test fixtures
  const clientCompanyId = 'client-company-id';
  const cateringCompanyId = 'catering-company-id';
  const serviceDayId = 'service-day-id';

  // Fixed "now" for deterministic tests
  const fixedNow = new Date('2025-01-15T10:00:00Z');

  const createContract = (overrides = {}) =>
    ContractEntity.fromData({
      id: 'contract-id',
      cateringCompanyId,
      clientCompanyId,
      startDate: new Date('2025-01-01'),
      endDate: null,
      pricePerService: 10.5,
      flexibleQuantity: true,
      minDailyQuantity: 10,
      maxDailyQuantity: 100,
      noticePeriodHours: 24,
      serviceDays: [1, 2, 3, 4, 5], // Monday-Friday
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

  const createServiceDay = (overrides = {}) =>
    ServiceDayEntity.fromData({
      id: serviceDayId,
      contractId: 'contract-id',
      serviceDate: new Date('2025-01-20'), // Future date
      expectedQuantity: null,
      servedQuantity: null,
      expectedConfirmedAt: null,
      servedConfirmedAt: null,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
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

    useCase = new ConfirmExpectedQuantityUseCase(mockRepository, mockClock);
  });

  describe('Success scenarios', () => {
    it('should confirm expected quantity when all validations pass', async () => {
      // Arrange - service date is 5 days from fixedNow (well within 24h notice)
      const futureDate = new Date('2025-01-20T10:00:00Z');
      const serviceDay = createServiceDay({ serviceDate: futureDate });
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });
      vi.mocked(mockRepository.save).mockImplementation((entity) =>
        Promise.resolve(entity.toData()),
      );

      const input: ConfirmExpectedQuantityInput = {
        serviceDayId,
        expectedQuantity: 50,
        companyId: clientCompanyId,
      };

      // Act
      const result = await useCase.execute(input);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.serviceDay.expectedQuantity).toBe(50);
        expect(result.serviceDay.expectedConfirmedAt).toEqual(fixedNow);
      }
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: serviceDayId,
        }),
      );
    });

    it('should accept quantity at minimum boundary', async () => {
      const futureDate = new Date('2025-01-20T10:00:00Z');
      const serviceDay = createServiceDay({ serviceDate: futureDate });
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });
      vi.mocked(mockRepository.save).mockImplementation((entity) =>
        Promise.resolve(entity.toData()),
      );

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 10, // min boundary
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.serviceDay.expectedQuantity).toBe(10);
      }
    });

    it('should accept quantity at maximum boundary', async () => {
      const futureDate = new Date('2025-01-20T10:00:00Z');
      const serviceDay = createServiceDay({ serviceDate: futureDate });
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });
      vi.mocked(mockRepository.save).mockImplementation((entity) =>
        Promise.resolve(entity.toData()),
      );

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 100, // max boundary
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.serviceDay.expectedQuantity).toBe(100);
      }
    });
  });

  describe('SERVICE_DAY_NOT_FOUND', () => {
    it('should return error when service day does not exist', async () => {
      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue(null);

      const result = await useCase.execute({
        serviceDayId: 'non-existent-id',
        expectedQuantity: 50,
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SERVICE_DAY_NOT_FOUND');
        expect(result.error.message).toContain('non-existent-id');
      }
    });
  });

  describe('CONTRACT_NOT_ACTIVE', () => {
    it('should return error when contract is PAUSED', async () => {
      const serviceDay = createServiceDay();
      const contract = createContract({ status: 'PAUSED' });

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 50,
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTRACT_NOT_ACTIVE');
        expect(result.error.message).toContain('PAUSED');
      }
    });

    it('should return error when contract is TERMINATED', async () => {
      const serviceDay = createServiceDay();
      const contract = createContract({ status: 'TERMINATED' });

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 50,
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTRACT_NOT_ACTIVE');
        expect(result.error.message).toContain('TERMINATED');
      }
    });
  });

  describe('NOT_AUTHORIZED', () => {
    it('should return error when catering company tries to confirm expected', async () => {
      const futureDate = new Date('2025-01-20T10:00:00Z');
      const serviceDay = createServiceDay({ serviceDate: futureDate });
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 50,
        companyId: cateringCompanyId, // Wrong company
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_AUTHORIZED');
        expect(result.error.message).toContain('client company');
      }
    });

    it('should return error when random company tries to confirm', async () => {
      const futureDate = new Date('2025-01-20T10:00:00Z');
      const serviceDay = createServiceDay({ serviceDate: futureDate });
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 50,
        companyId: 'random-company-id',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_AUTHORIZED');
      }
    });
  });

  describe('ALREADY_CONFIRMED', () => {
    it('should return error when expectedConfirmedAt is already set', async () => {
      const futureDate = new Date('2025-01-20T10:00:00Z');
      const serviceDay = createServiceDay({
        serviceDate: futureDate,
        expectedQuantity: 30,
        expectedConfirmedAt: new Date('2025-01-15'), // Already confirmed
      });
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 50,
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALREADY_CONFIRMED');
        expect(result.error.message).toContain('already been confirmed');
      }
    });

    it('should return error when service day status is CONFIRMED', async () => {
      const futureDate = new Date('2025-01-20T10:00:00Z');
      const serviceDay = createServiceDay({
        serviceDate: futureDate,
        status: 'CONFIRMED',
      });
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 50,
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALREADY_CONFIRMED');
      }
    });
  });

  describe('NOTICE_PERIOD_EXCEEDED', () => {
    it('should return error when notice period has passed', async () => {
      // Service date is in 12 hours, but notice period is 24 hours
      const serviceDate = new Date('2025-01-15T22:00:00Z'); // 12 hours from fixedNow
      const serviceDay = createServiceDay({ serviceDate });
      const contract = createContract({ noticePeriodHours: 24 });

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 50,
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOTICE_PERIOD_EXCEEDED');
        expect(result.error.message).toContain('24 hours');
        expect((result.error as { deadline: Date }).deadline).toBeDefined();
      }
    });

    it('should return error when service date is in the past', async () => {
      const pastDate = new Date('2025-01-14T10:00:00Z'); // 1 day before fixedNow
      const serviceDay = createServiceDay({ serviceDate: pastDate });
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 50,
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOTICE_PERIOD_EXCEEDED');
      }
    });

    it('should allow confirmation exactly at notice period boundary', async () => {
      // Service date exactly 24 hours from now, deadline is exactly now
      const serviceDate = new Date('2025-01-16T10:00:00Z'); // Exactly 24 hours later
      const serviceDay = createServiceDay({ serviceDate });
      const contract = createContract({ noticePeriodHours: 24 });

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });
      vi.mocked(mockRepository.save).mockImplementation((entity) =>
        Promise.resolve(entity.toData()),
      );

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 50,
        companyId: clientCompanyId,
      });

      // At exactly the boundary, it should succeed (now <= deadline)
      expect(result.success).toBe(true);
    });
  });

  describe('QUANTITY_OUT_OF_RANGE', () => {
    it('should return error when quantity is below minimum', async () => {
      const futureDate = new Date('2025-01-20T10:00:00Z');
      const serviceDay = createServiceDay({ serviceDate: futureDate });
      const contract = createContract({
        minDailyQuantity: 10,
        maxDailyQuantity: 100,
      });

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 5, // Below min of 10
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('QUANTITY_OUT_OF_RANGE');
        expect(result.error.message).toContain('10');
        expect(result.error.message).toContain('100');
        expect((result.error as { min: number }).min).toBe(10);
        expect((result.error as { max: number }).max).toBe(100);
      }
    });

    it('should return error when quantity is above maximum', async () => {
      const futureDate = new Date('2025-01-20T10:00:00Z');
      const serviceDay = createServiceDay({ serviceDate: futureDate });
      const contract = createContract({
        minDailyQuantity: 10,
        maxDailyQuantity: 100,
      });

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 150, // Above max of 100
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('QUANTITY_OUT_OF_RANGE');
      }
    });
  });

  describe('Validation order', () => {
    it('should check contract status before authorization', async () => {
      // Even with wrong company, contract status error should come first
      const serviceDay = createServiceDay();
      const contract = createContract({ status: 'TERMINATED' });

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 50,
        companyId: 'wrong-company',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        // Contract status is checked before authorization
        expect(result.error.code).toBe('CONTRACT_NOT_ACTIVE');
      }
    });
  });
});
