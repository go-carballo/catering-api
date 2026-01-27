import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ServiceDayService } from './service-day.service';
import { ContractService } from '../../contract/application/contract.service';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  onConflictDoNothing: vi.fn().mockReturnThis(),
  returning: vi.fn(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

const mockContractService = {
  findOne: vi.fn(),
};

// Test constants
const SERVICE_DAY_ID = '123e4567-e89b-12d3-a456-426614174000';
const CONTRACT_ID = '123e4567-e89b-12d3-a456-426614174001';
const CLIENT_COMPANY_ID = '123e4567-e89b-12d3-a456-426614174002';
const CATERING_COMPANY_ID = '123e4567-e89b-12d3-a456-426614174003';
const OTHER_COMPANY_ID = '123e4567-e89b-12d3-a456-426614174999';

const createMockContract = (overrides = {}) => ({
  id: CONTRACT_ID,
  clientCompanyId: CLIENT_COMPANY_ID,
  cateringCompanyId: CATERING_COMPANY_ID,
  noticePeriodHours: 24,
  minDailyQuantity: 10,
  maxDailyQuantity: 50,
  status: 'ACTIVE',
  ...overrides,
});

describe('ServiceDayService', () => {
  let service: ServiceDayService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceDayService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
        {
          provide: ContractService,
          useValue: mockContractService,
        },
      ],
    }).compile();

    service = module.get<ServiceDayService>(ServiceDayService);
  });

  describe('findOne', () => {
    it('should throw NotFoundException when service day not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(service.findOne(SERVICE_DAY_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return service day when found', async () => {
      const mockServiceDay = {
        id: SERVICE_DAY_ID,
        contractId: CONTRACT_ID,
        serviceDate: new Date('2026-01-21'),
        expectedQuantity: null,
        servedQuantity: null,
        expectedConfirmedAt: null,
        servedConfirmedAt: null,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValue([mockServiceDay]);

      const result = await service.findOne(SERVICE_DAY_ID);

      expect(result).toEqual(mockServiceDay);
    });
  });

  describe('generateForContract', () => {
    it('should throw BadRequestException when contract is not ACTIVE', async () => {
      mockContractService.findOne.mockResolvedValue({
        id: CONTRACT_ID,
        status: 'PAUSED',
        serviceDays: [1, 2, 3, 4, 5],
      });

      await expect(
        service.generateForContract(
          CONTRACT_ID,
          new Date('2026-01-20'),
          new Date('2026-01-27'),
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.generateForContract(
          CONTRACT_ID,
          new Date('2026-01-20'),
          new Date('2026-01-27'),
        ),
      ).rejects.toThrow('Can only generate service days for ACTIVE contracts');
    });

    it('should generate service days only for contract service days', async () => {
      mockContractService.findOne.mockResolvedValue({
        id: CONTRACT_ID,
        status: 'ACTIVE',
        serviceDays: [1, 2, 3, 4, 5], // Mon-Fri only
      });

      // No existing service days
      mockDb.orderBy.mockResolvedValue([]);

      const insertedDays = [
        {
          id: '1',
          contractId: CONTRACT_ID,
          serviceDate: new Date('2026-01-20'),
          status: 'PENDING',
        },
        {
          id: '2',
          contractId: CONTRACT_ID,
          serviceDate: new Date('2026-01-21'),
          status: 'PENDING',
        },
        {
          id: '3',
          contractId: CONTRACT_ID,
          serviceDate: new Date('2026-01-22'),
          status: 'PENDING',
        },
        {
          id: '4',
          contractId: CONTRACT_ID,
          serviceDate: new Date('2026-01-23'),
          status: 'PENDING',
        },
        {
          id: '5',
          contractId: CONTRACT_ID,
          serviceDate: new Date('2026-01-24'),
          status: 'PENDING',
        },
      ];
      mockDb.returning.mockResolvedValue(insertedDays);

      const result = await service.generateForContract(
        CONTRACT_ID,
        new Date('2026-01-20'), // Monday
        new Date('2026-01-25'), // Saturday
      );

      // Should only generate Mon-Fri (5 days), not Sat-Sun
      expect(result).toHaveLength(5);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should not duplicate existing service days (ON CONFLICT DO NOTHING)', async () => {
      mockContractService.findOne.mockResolvedValue({
        id: CONTRACT_ID,
        status: 'ACTIVE',
        serviceDays: [1, 2, 3, 4, 5],
      });

      // ON CONFLICT DO NOTHING will return only the newly inserted rows
      // When all rows conflict, it returns empty array
      const insertedDays = [
        {
          id: '3',
          contractId: CONTRACT_ID,
          serviceDate: new Date('2026-01-22'),
          status: 'PENDING',
        },
        {
          id: '4',
          contractId: CONTRACT_ID,
          serviceDate: new Date('2026-01-23'),
          status: 'PENDING',
        },
        {
          id: '5',
          contractId: CONTRACT_ID,
          serviceDate: new Date('2026-01-24'),
          status: 'PENDING',
        },
      ];
      mockDb.returning.mockResolvedValue(insertedDays);

      const result = await service.generateForContract(
        CONTRACT_ID,
        new Date('2026-01-20'),
        new Date('2026-01-25'),
      );

      // Verify ON CONFLICT DO NOTHING was called
      expect(mockDb.onConflictDoNothing).toHaveBeenCalled();
      // Result contains only what DB returned (non-conflicting rows)
      expect(result).toHaveLength(3);
    });
  });

  describe('confirmExpected', () => {
    it('should throw ForbiddenException when called by non-client company', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      mockDb.limit.mockResolvedValue([
        {
          id: SERVICE_DAY_ID,
          contractId: CONTRACT_ID,
          serviceDate: futureDate,
          expectedConfirmedAt: null,
          status: 'PENDING',
        },
      ]);

      mockContractService.findOne.mockResolvedValue(createMockContract());

      // Call with wrong company (catering instead of client)
      await expect(
        service.confirmExpected(
          SERVICE_DAY_ID,
          { expectedQuantity: 30 },
          CATERING_COMPANY_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.confirmExpected(
          SERVICE_DAY_ID,
          { expectedQuantity: 30 },
          OTHER_COMPANY_ID,
        ),
      ).rejects.toThrow(
        'Only the client company can confirm expected quantity',
      );
    });

    it('should throw BadRequestException when service day is already CONFIRMED', async () => {
      mockDb.limit.mockResolvedValue([
        {
          id: SERVICE_DAY_ID,
          contractId: CONTRACT_ID,
          serviceDate: new Date('2026-01-25'),
          expectedConfirmedAt: null,
          status: 'CONFIRMED',
        },
      ]);

      mockContractService.findOne.mockResolvedValue(createMockContract());

      await expect(
        service.confirmExpected(
          SERVICE_DAY_ID,
          { expectedQuantity: 30 },
          CLIENT_COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.confirmExpected(
          SERVICE_DAY_ID,
          { expectedQuantity: 30 },
          CLIENT_COMPANY_ID,
        ),
      ).rejects.toThrow('ServiceDay is already confirmed');
    });

    it('should throw BadRequestException when expectedQuantity already confirmed (immutability)', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      mockDb.limit.mockResolvedValue([
        {
          id: SERVICE_DAY_ID,
          contractId: CONTRACT_ID,
          serviceDate: futureDate,
          expectedQuantity: 25,
          expectedConfirmedAt: new Date(), // Already confirmed!
          status: 'PENDING',
        },
      ]);

      mockContractService.findOne.mockResolvedValue(createMockContract());

      await expect(
        service.confirmExpected(
          SERVICE_DAY_ID,
          { expectedQuantity: 30 },
          CLIENT_COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.confirmExpected(
          SERVICE_DAY_ID,
          { expectedQuantity: 30 },
          CLIENT_COMPANY_ID,
        ),
      ).rejects.toThrow(
        'Expected quantity has already been confirmed and cannot be changed',
      );
    });

    it('should throw BadRequestException when notice period is not respected', async () => {
      const now = new Date();
      const serviceDate = new Date(now.getTime() + 1000 * 60 * 60 * 12); // 12 hours from now

      mockDb.limit.mockResolvedValue([
        {
          id: SERVICE_DAY_ID,
          contractId: CONTRACT_ID,
          serviceDate,
          expectedConfirmedAt: null,
          status: 'PENDING',
        },
      ]);

      mockContractService.findOne.mockResolvedValue(createMockContract());

      await expect(
        service.confirmExpected(
          SERVICE_DAY_ID,
          { expectedQuantity: 30 },
          CLIENT_COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.confirmExpected(
          SERVICE_DAY_ID,
          { expectedQuantity: 30 },
          CLIENT_COMPANY_ID,
        ),
      ).rejects.toThrow('Must confirm at least 24 hours before service');
    });

    it('should throw BadRequestException when quantity is below minimum', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      mockDb.limit.mockResolvedValue([
        {
          id: SERVICE_DAY_ID,
          contractId: CONTRACT_ID,
          serviceDate: futureDate,
          expectedConfirmedAt: null,
          status: 'PENDING',
        },
      ]);

      mockContractService.findOne.mockResolvedValue(createMockContract());

      await expect(
        service.confirmExpected(
          SERVICE_DAY_ID,
          { expectedQuantity: 5 }, // Below min of 10
          CLIENT_COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.confirmExpected(
          SERVICE_DAY_ID,
          { expectedQuantity: 5 },
          CLIENT_COMPANY_ID,
        ),
      ).rejects.toThrow('Expected quantity must be between 10 and 50');
    });

    it('should throw BadRequestException when quantity is above maximum', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      mockDb.limit.mockResolvedValue([
        {
          id: SERVICE_DAY_ID,
          contractId: CONTRACT_ID,
          serviceDate: futureDate,
          expectedConfirmedAt: null,
          status: 'PENDING',
        },
      ]);

      mockContractService.findOne.mockResolvedValue(createMockContract());

      await expect(
        service.confirmExpected(
          SERVICE_DAY_ID,
          { expectedQuantity: 100 }, // Above max of 50
          CLIENT_COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should confirm expected quantity with valid data', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      mockDb.limit.mockResolvedValue([
        {
          id: SERVICE_DAY_ID,
          contractId: CONTRACT_ID,
          serviceDate: futureDate,
          expectedConfirmedAt: null,
          status: 'PENDING',
        },
      ]);

      mockContractService.findOne.mockResolvedValue(createMockContract());

      const updatedServiceDay = {
        id: SERVICE_DAY_ID,
        contractId: CONTRACT_ID,
        serviceDate: futureDate,
        expectedQuantity: 30,
        expectedConfirmedAt: new Date(),
        status: 'PENDING',
      };

      mockDb.returning.mockResolvedValue([updatedServiceDay]);

      const result = await service.confirmExpected(
        SERVICE_DAY_ID,
        { expectedQuantity: 30 },
        CLIENT_COMPANY_ID,
      );

      expect(result.expectedQuantity).toBe(30);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('confirmServed', () => {
    it('should throw ForbiddenException when called by non-catering company', async () => {
      mockDb.limit.mockResolvedValue([
        {
          id: SERVICE_DAY_ID,
          contractId: CONTRACT_ID,
          serviceDate: new Date('2026-01-20'),
          status: 'PENDING',
        },
      ]);

      mockContractService.findOne.mockResolvedValue(createMockContract());

      // Call with wrong company (client instead of catering)
      await expect(
        service.confirmServed(
          SERVICE_DAY_ID,
          { servedQuantity: 28 },
          CLIENT_COMPANY_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.confirmServed(
          SERVICE_DAY_ID,
          { servedQuantity: 28 },
          OTHER_COMPANY_ID,
        ),
      ).rejects.toThrow(
        'Only the catering company can confirm served quantity',
      );
    });

    it('should throw BadRequestException when service day is already confirmed', async () => {
      mockDb.limit.mockResolvedValue([
        {
          id: SERVICE_DAY_ID,
          contractId: CONTRACT_ID,
          status: 'CONFIRMED',
        },
      ]);

      mockContractService.findOne.mockResolvedValue(createMockContract());

      await expect(
        service.confirmServed(
          SERVICE_DAY_ID,
          { servedQuantity: 28 },
          CATERING_COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.confirmServed(
          SERVICE_DAY_ID,
          { servedQuantity: 28 },
          CATERING_COMPANY_ID,
        ),
      ).rejects.toThrow('ServiceDay is already confirmed');
    });

    it('should confirm served and mark as CONFIRMED', async () => {
      mockDb.limit.mockResolvedValue([
        {
          id: SERVICE_DAY_ID,
          contractId: CONTRACT_ID,
          serviceDate: new Date('2026-01-20'),
          expectedQuantity: 30,
          status: 'PENDING',
        },
      ]);

      mockContractService.findOne.mockResolvedValue(createMockContract());

      const updatedServiceDay = {
        id: SERVICE_DAY_ID,
        contractId: CONTRACT_ID,
        serviceDate: new Date('2026-01-20'),
        expectedQuantity: 30,
        servedQuantity: 28,
        servedConfirmedAt: new Date(),
        status: 'CONFIRMED',
      };

      mockDb.returning.mockResolvedValue([updatedServiceDay]);

      const result = await service.confirmServed(
        SERVICE_DAY_ID,
        { servedQuantity: 28 },
        CATERING_COMPANY_ID,
      );

      expect(result.servedQuantity).toBe(28);
      expect(result.status).toBe('CONFIRMED');
    });
  });

  describe('getWeeklyReport', () => {
    it('should throw ForbiddenException when called by unauthorized company', async () => {
      mockContractService.findOne.mockResolvedValue(createMockContract());

      await expect(
        service.getWeeklyReport(
          CONTRACT_ID,
          new Date('2026-01-20'),
          OTHER_COMPANY_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.getWeeklyReport(
          CONTRACT_ID,
          new Date('2026-01-20'),
          OTHER_COMPANY_ID,
        ),
      ).rejects.toThrow(
        'Only the catering or client company can view this report',
      );
    });

    it('should calculate weekly totals correctly for client company', async () => {
      const weekStart = new Date('2026-01-20');

      mockContractService.findOne.mockResolvedValue(
        createMockContract({ pricePerService: 15 }),
      );

      mockDb.orderBy.mockResolvedValue([
        {
          id: '1',
          serviceDate: new Date('2026-01-20'),
          expectedQuantity: 30,
          servedQuantity: 28,
          status: 'CONFIRMED',
        },
        {
          id: '2',
          serviceDate: new Date('2026-01-21'),
          expectedQuantity: 25,
          servedQuantity: 25,
          status: 'CONFIRMED',
        },
        {
          id: '3',
          serviceDate: new Date('2026-01-22'),
          expectedQuantity: 35,
          servedQuantity: 33,
          status: 'CONFIRMED',
        },
        {
          id: '4',
          serviceDate: new Date('2026-01-23'),
          expectedQuantity: 30,
          servedQuantity: null,
          status: 'PENDING',
        },
        {
          id: '5',
          serviceDate: new Date('2026-01-24'),
          expectedQuantity: null,
          servedQuantity: null,
          status: 'PENDING',
        },
      ]);

      // Mock company name queries
      mockDb.limit
        .mockResolvedValueOnce([{ name: 'Test Catering' }])
        .mockResolvedValueOnce([{ name: 'Test Client' }]);

      const result = await service.getWeeklyReport(
        CONTRACT_ID,
        weekStart,
        CLIENT_COMPANY_ID,
      );

      expect(result.summary.totalDays).toBe(5);
      expect(result.summary.confirmedDays).toBe(3);
      expect(result.summary.pendingDays).toBe(2);
      expect(result.summary.totalExpected).toBe(120); // 30 + 25 + 35 + 30 + 0
      expect(result.summary.totalServed).toBe(86); // 28 + 25 + 33 + 0 + 0
      expect(result.summary.totalCost).toBe(1290); // 86 * 15
      expect(result.cateringCompany.name).toBe('Test Catering');
      expect(result.clientCompany.name).toBe('Test Client');
    });

    it('should allow catering company to view report', async () => {
      const weekStart = new Date('2026-01-20');

      mockContractService.findOne.mockResolvedValue(
        createMockContract({ pricePerService: 10 }),
      );

      mockDb.orderBy.mockResolvedValue([
        {
          id: '1',
          serviceDate: new Date('2026-01-20'),
          expectedQuantity: 20,
          servedQuantity: 20,
          status: 'CONFIRMED',
        },
      ]);

      mockDb.limit
        .mockResolvedValueOnce([{ name: 'Test Catering' }])
        .mockResolvedValueOnce([{ name: 'Test Client' }]);

      const result = await service.getWeeklyReport(
        CONTRACT_ID,
        weekStart,
        CATERING_COMPANY_ID,
      );

      expect(result.summary.totalDays).toBe(1);
      expect(result.summary.totalCost).toBe(200); // 20 * 10
    });
  });

  describe('getWeeklyReportCsv', () => {
    it('should generate CSV with correct format', async () => {
      const weekStart = new Date('2026-01-20');

      mockContractService.findOne.mockResolvedValue(
        createMockContract({ pricePerService: 15 }),
      );

      mockDb.orderBy.mockResolvedValue([
        {
          id: '1',
          serviceDate: new Date('2026-01-20'),
          expectedQuantity: 30,
          servedQuantity: 28,
          status: 'CONFIRMED',
        },
        {
          id: '2',
          serviceDate: new Date('2026-01-21'),
          expectedQuantity: 25,
          servedQuantity: null,
          status: 'PENDING',
        },
      ]);

      mockDb.limit
        .mockResolvedValueOnce([{ name: 'Catering Co' }])
        .mockResolvedValueOnce([{ name: 'Client Corp' }]);

      const csv = await service.getWeeklyReportCsv(
        CONTRACT_ID,
        weekStart,
        CLIENT_COMPANY_ID,
      );

      expect(csv).toContain('Weekly Report - Catering Co / Client Corp');
      expect(csv).toContain(
        'Date,Day,Expected Quantity,Served Quantity,Status,Cost',
      );
      expect(csv).toContain('2026-01-20');
      expect(csv).toContain('CONFIRMED');
      expect(csv).toContain('PENDING');
      expect(csv).toContain('Total Served,28');
      expect(csv).toContain('Total Cost,420.00'); // 28 * 15
    });

    it('should throw ForbiddenException for unauthorized company', async () => {
      mockContractService.findOne.mockResolvedValue(createMockContract());

      await expect(
        service.getWeeklyReportCsv(
          CONTRACT_ID,
          new Date('2026-01-20'),
          OTHER_COMPANY_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
