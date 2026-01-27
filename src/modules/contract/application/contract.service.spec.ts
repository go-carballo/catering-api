import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ContractService } from './contract.service';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';

// Mock stable object - shared across all tests
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  transaction: vi.fn(),
};

// Helper function to create valid company mocks
const createCateringCompany = (overrides = {}) => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Test Catering',
  companyType: 'CATERING',
  status: 'ACTIVE',
  ...overrides,
});

const createClientCompany = (overrides = {}) => ({
  id: '123e4567-e89b-12d3-a456-426614174001',
  name: 'Test Client',
  companyType: 'CLIENT',
  status: 'ACTIVE',
  ...overrides,
});

const validCreateDto = {
  cateringCompanyId: '123e4567-e89b-12d3-a456-426614174000',
  clientCompanyId: '123e4567-e89b-12d3-a456-426614174001',
  pricePerService: 100,
  minDailyQuantity: 10,
  maxDailyQuantity: 50,
  noticePeriodHours: 24,
  serviceDays: [1, 2, 3, 4, 5] as (1 | 2 | 3 | 4 | 5 | 6 | 7)[],
};

describe('ContractService', () => {
  let service: ContractService;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset chain methods to return this
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.innerJoin.mockReturnThis();
    mockDb.leftJoin.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.insert.mockReturnThis();
    mockDb.values.mockReturnThis();
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<ContractService>(ContractService);
  });

  describe('create', () => {
    it('should throw BadRequestException when minDailyQuantity > maxDailyQuantity', async () => {
      const dto = {
        ...validCreateDto,
        minDailyQuantity: 50,
        maxDailyQuantity: 10, // Invalid: min > max
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        'minDailyQuantity cannot be greater than maxDailyQuantity',
      );
    });

    it('should throw NotFoundException when catering company not found', async () => {
      // Query 1: catering company - not found (for both assertions)
      mockDb.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await expect(service.create(validCreateDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create(validCreateDto)).rejects.toThrow(
        `Catering company #${validCreateDto.cateringCompanyId} not found`,
      );
    });

    it('should throw BadRequestException when catering company is wrong type', async () => {
      const wrongTypeCatering = createCateringCompany({
        companyType: 'CLIENT',
        name: 'Wrong Type Co',
      });

      // Query 1: catering company - wrong type (for both assertions)
      mockDb.limit
        .mockResolvedValueOnce([wrongTypeCatering])
        .mockResolvedValueOnce([wrongTypeCatering]);

      await expect(service.create(validCreateDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(validCreateDto)).rejects.toThrow(
        'Company "Wrong Type Co" is not a catering company',
      );
    });

    it('should throw BadRequestException when catering company is inactive', async () => {
      const inactiveCatering = createCateringCompany({
        status: 'INACTIVE',
        name: 'Inactive Catering',
      });

      // Query 1: catering company - inactive (for both assertions)
      mockDb.limit
        .mockResolvedValueOnce([inactiveCatering])
        .mockResolvedValueOnce([inactiveCatering]);

      await expect(service.create(validCreateDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(validCreateDto)).rejects.toThrow(
        'Catering company "Inactive Catering" is not active',
      );
    });

    it('should throw NotFoundException when client company not found', async () => {
      const catering = createCateringCompany();

      // First assertion - Query 1: catering OK, Query 2: client not found
      mockDb.limit.mockResolvedValueOnce([catering]).mockResolvedValueOnce([]);
      // Second assertion - Query 1: catering OK, Query 2: client not found
      mockDb.limit.mockResolvedValueOnce([catering]).mockResolvedValueOnce([]);

      await expect(service.create(validCreateDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create(validCreateDto)).rejects.toThrow(
        `Client company #${validCreateDto.clientCompanyId} not found`,
      );
    });

    it('should throw BadRequestException when client company is wrong type', async () => {
      const catering = createCateringCompany();
      const wrongTypeClient = createClientCompany({
        companyType: 'CATERING',
        name: 'Wrong Type Client',
      });

      // First assertion - Query 1: catering OK, Query 2: client wrong type
      mockDb.limit
        .mockResolvedValueOnce([catering])
        .mockResolvedValueOnce([wrongTypeClient]);
      // Second assertion - Query 1: catering OK, Query 2: client wrong type
      mockDb.limit
        .mockResolvedValueOnce([catering])
        .mockResolvedValueOnce([wrongTypeClient]);

      await expect(service.create(validCreateDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(validCreateDto)).rejects.toThrow(
        'Company "Wrong Type Client" is not a client company',
      );
    });

    it('should throw BadRequestException when client company is inactive', async () => {
      const catering = createCateringCompany();
      const inactiveClient = createClientCompany({
        status: 'INACTIVE',
        name: 'Inactive Client',
      });

      // First assertion - Query 1: catering OK, Query 2: client inactive
      mockDb.limit
        .mockResolvedValueOnce([catering])
        .mockResolvedValueOnce([inactiveClient]);
      // Second assertion - Query 1: catering OK, Query 2: client inactive
      mockDb.limit
        .mockResolvedValueOnce([catering])
        .mockResolvedValueOnce([inactiveClient]);

      await expect(service.create(validCreateDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(validCreateDto)).rejects.toThrow(
        'Client company "Inactive Client" is not active',
      );
    });

    it('should throw ConflictException when active contract already exists', async () => {
      const catering = createCateringCompany();
      const client = createClientCompany();

      // First assertion - Query 1: catering OK, Query 2: client OK, Query 3: existing contract found
      mockDb.limit
        .mockResolvedValueOnce([catering])
        .mockResolvedValueOnce([client])
        .mockResolvedValueOnce([{ id: 'existing-contract-id' }]);
      // Second assertion - Query 1: catering OK, Query 2: client OK, Query 3: existing contract found
      mockDb.limit
        .mockResolvedValueOnce([catering])
        .mockResolvedValueOnce([client])
        .mockResolvedValueOnce([{ id: 'existing-contract-id' }]);

      await expect(service.create(validCreateDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create(validCreateDto)).rejects.toThrow(
        `An active contract already exists between "${catering.name}" and "${client.name}"`,
      );
    });

    it('should create contract with valid data', async () => {
      const mockContract = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        ...validCreateDto,
        pricePerService: '100',
        status: 'ACTIVE',
        flexibleQuantity: true,
        startDate: new Date(),
        endDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Query 1: catering company - OK
      mockDb.limit.mockResolvedValueOnce([createCateringCompany()]);
      // Query 2: client company - OK
      mockDb.limit.mockResolvedValueOnce([createClientCompany()]);
      // Query 3: existing contract check - none found
      mockDb.limit.mockResolvedValueOnce([]);

      mockDb.transaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([mockContract]),
        };
        return callback(tx);
      });

      const result = await service.create(validCreateDto);

      expect(result).toBeDefined();
      expect(result.serviceDays).toEqual(validCreateDto.serviceDays);
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should store event in outbox when creating contract', async () => {
      const mockContract = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        ...validCreateDto,
        pricePerService: '100',
        status: 'ACTIVE',
        flexibleQuantity: true,
        startDate: new Date(),
        endDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([createCateringCompany()]);
      mockDb.limit.mockResolvedValueOnce([createClientCompany()]);
      mockDb.limit.mockResolvedValueOnce([]);

      const insertCalls: any[] = [];
      mockDb.transaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockImplementation((table) => {
            insertCalls.push(table);
            return {
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([mockContract]),
              }),
            };
          }),
        };
        return callback(tx);
      });

      await service.create(validCreateDto);

      // Should have 3 inserts: contract, service days, outbox event
      expect(insertCalls.length).toBe(3);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException when contract not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.findOne('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return contract with service days when found', async () => {
      const mockContract = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        cateringCompanyId: '123e4567-e89b-12d3-a456-426614174001',
        clientCompanyId: '123e4567-e89b-12d3-a456-426614174002',
        pricePerService: '100.00',
        status: 'ACTIVE',
        minDailyQuantity: 10,
        maxDailyQuantity: 50,
        noticePeriodHours: 24,
        flexibleQuantity: true,
        startDate: new Date(),
        endDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // findOne: .select().from().where().limit() -> returns contract
      mockDb.limit.mockResolvedValueOnce([mockContract]);

      // attachServiceDays: .select().from().where() -> returns service days (where is terminal here)
      mockDb.where
        .mockReturnValueOnce(mockDb) // First where() returns mock for chaining to limit
        .mockResolvedValueOnce([{ dow: 1 }, { dow: 2 }, { dow: 3 }]); // Second where() is terminal

      const result = await service.findOne(
        '123e4567-e89b-12d3-a456-426614174000',
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(mockContract.id);
      expect(result.pricePerService).toBe(100);
      expect(result.serviceDays).toEqual([1, 2, 3]);
    });
  });

  describe('pause', () => {
    it('should throw BadRequestException when trying to pause a terminated contract', async () => {
      const terminatedContract = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'TERMINATED',
        pricePerService: '100',
        cateringCompanyId: '123e4567-e89b-12d3-a456-426614174001',
        clientCompanyId: '123e4567-e89b-12d3-a456-426614174002',
        minDailyQuantity: 10,
        maxDailyQuantity: 50,
        noticePeriodHours: 24,
        flexibleQuantity: true,
        startDate: new Date(),
        endDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Setup mocks for BOTH pause() calls (each consumes the mocks)
      // First call
      mockDb.limit.mockResolvedValueOnce([terminatedContract]);
      mockDb.where
        .mockReturnValueOnce(mockDb)
        .mockResolvedValueOnce([{ dow: 1 }]);
      // Second call
      mockDb.limit.mockResolvedValueOnce([terminatedContract]);
      mockDb.where
        .mockReturnValueOnce(mockDb)
        .mockResolvedValueOnce([{ dow: 1 }]);

      await expect(
        service.pause('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.pause('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow('Cannot pause a terminated contract');
    });

    it('should throw BadRequestException when trying to pause an already paused contract', async () => {
      const pausedContract = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'PAUSED',
        pricePerService: '100',
        cateringCompanyId: '123e4567-e89b-12d3-a456-426614174001',
        clientCompanyId: '123e4567-e89b-12d3-a456-426614174002',
        minDailyQuantity: 10,
        maxDailyQuantity: 50,
        noticePeriodHours: 24,
        flexibleQuantity: true,
        startDate: new Date(),
        endDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First call
      mockDb.limit.mockResolvedValueOnce([pausedContract]);
      mockDb.where
        .mockReturnValueOnce(mockDb)
        .mockResolvedValueOnce([{ dow: 1 }]);
      // Second call
      mockDb.limit.mockResolvedValueOnce([pausedContract]);
      mockDb.where
        .mockReturnValueOnce(mockDb)
        .mockResolvedValueOnce([{ dow: 1 }]);

      await expect(
        service.pause('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.pause('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow('Contract is already paused');
    });
  });

  describe('resume', () => {
    it('should throw BadRequestException when trying to resume a terminated contract', async () => {
      const terminatedContract = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'TERMINATED',
        pricePerService: '100',
        cateringCompanyId: '123e4567-e89b-12d3-a456-426614174001',
        clientCompanyId: '123e4567-e89b-12d3-a456-426614174002',
        minDailyQuantity: 10,
        maxDailyQuantity: 50,
        noticePeriodHours: 24,
        flexibleQuantity: true,
        startDate: new Date(),
        endDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // findOne: .select().from().where().limit() -> returns contract
      mockDb.limit.mockResolvedValueOnce([terminatedContract]);

      // attachServiceDays: .select().from().where() -> returns service days
      mockDb.where
        .mockReturnValueOnce(mockDb) // First where() returns mock for chaining to limit
        .mockResolvedValueOnce([{ dow: 1 }]); // Second where() is terminal

      await expect(
        service.resume('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when trying to resume an already active contract', async () => {
      const activeContract = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'ACTIVE',
        pricePerService: '100',
        cateringCompanyId: '123e4567-e89b-12d3-a456-426614174001',
        clientCompanyId: '123e4567-e89b-12d3-a456-426614174002',
        minDailyQuantity: 10,
        maxDailyQuantity: 50,
        noticePeriodHours: 24,
        flexibleQuantity: true,
        startDate: new Date(),
        endDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First call
      mockDb.limit.mockResolvedValueOnce([activeContract]);
      mockDb.where
        .mockReturnValueOnce(mockDb)
        .mockResolvedValueOnce([{ dow: 1 }]);
      // Second call
      mockDb.limit.mockResolvedValueOnce([activeContract]);
      mockDb.where
        .mockReturnValueOnce(mockDb)
        .mockResolvedValueOnce([{ dow: 1 }]);

      await expect(
        service.resume('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.resume('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow('Contract is already active');
    });
  });
});
