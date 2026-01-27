import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CateringService } from './catering.service';
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
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(),
  transaction: vi.fn(),
};

describe('CateringService', () => {
  let service: CateringService;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset chain methods to return this
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.innerJoin.mockReturnThis();
    mockDb.leftJoin.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.insert.mockReturnThis();
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.values.mockReturnThis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CateringService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<CateringService>(CateringService);
  });

  describe('findAll', () => {
    it('should return all catering companies', async () => {
      const mockCaterings = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          companyType: 'CATERING',
          name: 'Catering A',
          email: 'catering-a@example.com',
          passwordHash: 'hashed-password',
          taxId: '123456789',
          status: 'ACTIVE',
          dailyCapacity: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          companyType: 'CATERING',
          name: 'Catering B',
          email: 'catering-b@example.com',
          passwordHash: 'hashed-password',
          taxId: '987654321',
          status: 'ACTIVE',
          dailyCapacity: 200,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // findAll ends with .where() which is awaited
      mockDb.where.mockResolvedValue(mockCaterings);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Catering A');
      expect(result[1].dailyCapacity).toBe(200);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException when catering not found', async () => {
      // findOne ends with .limit(1) which is awaited
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.findOne('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return catering when found', async () => {
      const mockCatering = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        companyType: 'CATERING',
        name: 'Catering A',
        email: 'catering@example.com',
        passwordHash: 'hashed-password',
        taxId: '123456789',
        status: 'ACTIVE',
        dailyCapacity: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.limit.mockResolvedValue([mockCatering]);

      const result = await service.findOne(
        '123e4567-e89b-12d3-a456-426614174000',
      );

      expect(result).toBeDefined();
      expect(result.name).toBe('Catering A');
      expect(result.dailyCapacity).toBe(100);
    });
  });

  describe('create', () => {
    it('should create catering company with profile', async () => {
      const dto = {
        name: 'New Catering',
        email: 'new-catering@example.com',
        password: 'password123',
        taxId: '111222333',
        dailyCapacity: 150,
      };

      const mockCompany = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        companyType: 'CATERING',
        name: dto.name,
        email: dto.email,
        passwordHash: 'hashed-password',
        taxId: dto.taxId,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([mockCompany]),
        };
        return callback(tx);
      });

      const result = await service.create(dto);

      expect(result).toBeDefined();
      expect(result.name).toBe('New Catering');
      expect(result.dailyCapacity).toBe(150);
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should set taxId to null when not provided', async () => {
      const dto = {
        name: 'Catering Without TaxId',
        email: 'no-tax@example.com',
        password: 'password123',
        dailyCapacity: 100,
      };

      const mockCompany = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        companyType: 'CATERING',
        name: dto.name,
        email: dto.email,
        passwordHash: 'hashed-password',
        taxId: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([mockCompany]),
        };
        return callback(tx);
      });

      const result = await service.create(dto);

      expect(result.taxId).toBeNull();
    });
  });

  describe('update', () => {
    const mockCatering = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      companyType: 'CATERING',
      name: 'Catering A',
      email: 'catering@example.com',
      passwordHash: 'hashed-password',
      taxId: '123456789',
      status: 'ACTIVE',
      dailyCapacity: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should throw NotFoundException when catering not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.update('123e4567-e89b-12d3-a456-426614174000', {
          name: 'New Name',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update catering name', async () => {
      const updatedCatering = { ...mockCatering, name: 'Updated Catering' };

      // First call for findOne (verification), second for returning updated
      mockDb.limit
        .mockResolvedValueOnce([mockCatering])
        .mockResolvedValueOnce([updatedCatering]);

      mockDb.transaction.mockImplementation(async (callback) => {
        const tx = {
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
        };
        return callback(tx);
      });

      const result = await service.update(mockCatering.id, {
        name: 'Updated Catering',
      });

      expect(result.name).toBe('Updated Catering');
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should update dailyCapacity', async () => {
      const updatedCatering = { ...mockCatering, dailyCapacity: 200 };

      mockDb.limit
        .mockResolvedValueOnce([mockCatering])
        .mockResolvedValueOnce([updatedCatering]);

      mockDb.transaction.mockImplementation(async (callback) => {
        const tx = {
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
        };
        return callback(tx);
      });

      const result = await service.update(mockCatering.id, {
        dailyCapacity: 200,
      });

      expect(result.dailyCapacity).toBe(200);
    });

    it('should update status to INACTIVE', async () => {
      const updatedCatering = { ...mockCatering, status: 'INACTIVE' };

      mockDb.limit
        .mockResolvedValueOnce([mockCatering])
        .mockResolvedValueOnce([updatedCatering]);

      mockDb.transaction.mockImplementation(async (callback) => {
        const tx = {
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
        };
        return callback(tx);
      });

      const result = await service.update(mockCatering.id, {
        status: 'INACTIVE',
      });

      expect(result.status).toBe('INACTIVE');
    });
  });

  describe('softDelete', () => {
    const mockCatering = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      companyType: 'CATERING',
      name: 'Catering A',
      email: 'catering@example.com',
      passwordHash: 'hashed-password',
      taxId: '123456789',
      status: 'ACTIVE',
      dailyCapacity: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should throw NotFoundException when catering not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.softDelete('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should set status to INACTIVE', async () => {
      const deletedCatering = { ...mockCatering, status: 'INACTIVE' };

      // Mock findOne calls - limit is called twice (verify + return)
      mockDb.limit
        .mockResolvedValueOnce([mockCatering])
        .mockResolvedValueOnce([deletedCatering]);

      // Mock the update().set().where() chain - where returns undefined (no returning)
      // We need where to return this for chaining in select, but resolve for update
      // So we override only after the first findOne completes

      const result = await service.softDelete(mockCatering.id);

      expect(result.status).toBe('INACTIVE');
      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});
