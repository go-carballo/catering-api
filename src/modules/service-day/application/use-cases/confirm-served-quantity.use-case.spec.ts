import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConfirmServedQuantityUseCase,
  ConfirmServedQuantityInput,
} from './confirm-served-quantity.use-case';
import type { ServiceDayRepository } from '../../domain/service-day.repository';
import { ServiceDayEntity } from '../../domain/service-day.entity';
import { ContractEntity } from '../../../contract/domain/contract.entity';
import type { Clock } from '../../../../shared/domain/clock.port';

describe('ConfirmServedQuantityUseCase', () => {
  let useCase: ConfirmServedQuantityUseCase;
  let mockRepository: ServiceDayRepository;
  let mockClock: Clock;

  // Test fixtures
  const clientCompanyId = 'client-company-id';
  const cateringCompanyId = 'catering-company-id';
  const serviceDayId = 'service-day-id';

  // Fixed "now" for deterministic tests
  const fixedNow = new Date('2025-01-20T18:00:00Z');

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
      serviceDays: [1, 2, 3, 4, 5],
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

  const createServiceDay = (overrides = {}) =>
    ServiceDayEntity.fromData({
      id: serviceDayId,
      contractId: 'contract-id',
      serviceDate: new Date('2025-01-20'),
      expectedQuantity: 50,
      servedQuantity: null,
      expectedConfirmedAt: new Date('2025-01-18'),
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

    useCase = new ConfirmServedQuantityUseCase(mockRepository, mockClock);
  });

  describe('Success scenarios', () => {
    it('should confirm served quantity when all validations pass', async () => {
      const serviceDay = createServiceDay();
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });
      vi.mocked(mockRepository.save).mockImplementation((entity) =>
        Promise.resolve(entity.toData()),
      );

      const input: ConfirmServedQuantityInput = {
        serviceDayId,
        servedQuantity: 48,
        companyId: cateringCompanyId,
      };

      const result = await useCase.execute(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.serviceDay.servedQuantity).toBe(48);
        expect(result.serviceDay.servedConfirmedAt).toEqual(fixedNow);
        expect(result.serviceDay.status).toBe('CONFIRMED');
      }
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: serviceDayId,
        }),
      );
    });

    it('should allow served quantity of 0', async () => {
      const serviceDay = createServiceDay();
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
        servedQuantity: 0,
        companyId: cateringCompanyId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.serviceDay.servedQuantity).toBe(0);
      }
    });

    it('should allow served quantity greater than expected', async () => {
      const serviceDay = createServiceDay({ expectedQuantity: 50 });
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
        servedQuantity: 75, // More than expected 50
        companyId: cateringCompanyId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.serviceDay.servedQuantity).toBe(75);
      }
    });
  });

  describe('SERVICE_DAY_NOT_FOUND', () => {
    it('should return error when service day does not exist', async () => {
      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue(null);

      const result = await useCase.execute({
        serviceDayId: 'non-existent-id',
        servedQuantity: 48,
        companyId: cateringCompanyId,
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
        servedQuantity: 48,
        companyId: cateringCompanyId,
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
        servedQuantity: 48,
        companyId: cateringCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTRACT_NOT_ACTIVE');
      }
    });
  });

  describe('NOT_AUTHORIZED', () => {
    it('should return error when client company tries to confirm served', async () => {
      const serviceDay = createServiceDay();
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: 48,
        companyId: clientCompanyId, // Wrong company - should be catering
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_AUTHORIZED');
        expect(result.error.message).toContain('catering company');
      }
    });

    it('should return error when random company tries to confirm', async () => {
      const serviceDay = createServiceDay();
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: 48,
        companyId: 'random-company-id',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_AUTHORIZED');
      }
    });
  });

  describe('ALREADY_CONFIRMED', () => {
    it('should return error when service day status is already CONFIRMED', async () => {
      const serviceDay = createServiceDay({
        status: 'CONFIRMED',
        servedQuantity: 45,
        servedConfirmedAt: new Date('2025-01-20'),
      });
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: 48,
        companyId: cateringCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ALREADY_CONFIRMED');
        expect(result.error.message).toContain('already confirmed');
      }
    });
  });

  describe('INVALID_QUANTITY', () => {
    it('should return error when served quantity is negative', async () => {
      const serviceDay = createServiceDay();
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: -5,
        companyId: cateringCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_QUANTITY');
        expect(result.error.message).toContain('negative');
      }
    });
  });

  describe('Validation order', () => {
    it('should check contract status before authorization', async () => {
      const serviceDay = createServiceDay();
      const contract = createContract({ status: 'TERMINATED' });

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: 48,
        companyId: 'wrong-company',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTRACT_NOT_ACTIVE');
      }
    });

    it('should check authorization before already confirmed', async () => {
      const serviceDay = createServiceDay({ status: 'CONFIRMED' });
      const contract = createContract();

      vi.mocked(mockRepository.findByIdWithContract).mockResolvedValue({
        serviceDay,
        contract,
      });

      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: 48,
        companyId: clientCompanyId, // Wrong company
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_AUTHORIZED');
      }
    });
  });
});
