import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ClientService } from './client.service';
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
  delete: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(),
  transaction: vi.fn(),
};

describe('ClientService', () => {
  let service: ClientService;

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
    mockDb.delete.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.values.mockReturnThis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<ClientService>(ClientService);
  });

  describe('findOne', () => {
    it('should throw NotFoundException when client not found', async () => {
      // findOne ends with .limit(1)
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.findOne('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return client with office days', async () => {
      const mockClient = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        companyType: 'CLIENT',
        name: 'Tech Company',
        email: 'tech@example.com',
        passwordHash: 'hashed-password',
        taxId: '123456789',
        status: 'ACTIVE',
        workMode: 'HYBRID',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // findOne: .select().from().innerJoin().where().limit() -> returns client
      mockDb.limit.mockResolvedValueOnce([mockClient]);

      // getOfficeDays: .select().from().where() -> returns office days (where is terminal here)
      // We need where to return this for the first query chain but resolve for the second
      // The trick: limit is called first (returns client), then where becomes terminal
      mockDb.where
        .mockReturnValueOnce(mockDb) // First where() returns mock for chaining to limit
        .mockResolvedValueOnce([{ dow: 1 }, { dow: 2 }, { dow: 3 }]); // Second where() is terminal

      const result = await service.findOne(
        '123e4567-e89b-12d3-a456-426614174000',
      );

      expect(result).toBeDefined();
      expect(result.name).toBe('Tech Company');
      expect(result.workMode).toBe('HYBRID');
      expect(result.officeDays).toEqual([1, 2, 3]);
    });
  });

  describe('create', () => {
    it('should create client with profile and office days', async () => {
      const dto = {
        name: 'New Tech Company',
        email: 'newtech@example.com',
        password: 'password123',
        taxId: '999888777',
        workMode: 'HYBRID' as const,
        officeDays: [1, 2, 3, 4, 5] as (1 | 2 | 3 | 4 | 5 | 6 | 7)[],
      };

      const mockCompany = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        companyType: 'CLIENT',
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
      expect(result.name).toBe('New Tech Company');
      expect(result.workMode).toBe('HYBRID');
      expect(result.officeDays).toEqual([1, 2, 3, 4, 5]);
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should handle ONSITE work mode', async () => {
      const dto = {
        name: 'Onsite Company',
        email: 'onsite@example.com',
        password: 'password123',
        workMode: 'ONSITE' as const,
        officeDays: [1, 2, 3, 4, 5] as (1 | 2 | 3 | 4 | 5 | 6 | 7)[],
      };

      const mockCompany = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        companyType: 'CLIENT',
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

      expect(result.workMode).toBe('ONSITE');
      expect(result.taxId).toBeNull();
    });
  });

  describe('update', () => {
    const mockClient = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      companyType: 'CLIENT',
      name: 'Tech Company',
      email: 'tech@example.com',
      passwordHash: 'hashed-password',
      taxId: '123456789',
      status: 'ACTIVE',
      workMode: 'HYBRID',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should throw NotFoundException when client not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.update('123e4567-e89b-12d3-a456-426614174000', {
          name: 'New Name',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update client name', async () => {
      const updatedClient = { ...mockClient, name: 'Updated Company' };

      // First findOne (verification) - limit then where for office days
      mockDb.limit.mockResolvedValueOnce([mockClient]);
      mockDb.where
        .mockReturnValueOnce(mockDb) // First where chains to limit
        .mockResolvedValueOnce([{ dow: 1 }, { dow: 2 }]); // Second where returns office days

      // Transaction mock
      mockDb.transaction.mockImplementation(async (callback) => {
        const tx = {
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
        };
        return callback(tx);
      });

      // Second findOne (return) - limit then where for office days
      mockDb.limit.mockResolvedValueOnce([updatedClient]);
      mockDb.where
        .mockReturnValueOnce(mockDb)
        .mockResolvedValueOnce([{ dow: 1 }, { dow: 2 }]);

      const result = await service.update(mockClient.id, {
        name: 'Updated Company',
      });

      expect(result.name).toBe('Updated Company');
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should update workMode and officeDays', async () => {
      const updatedClient = { ...mockClient, workMode: 'ONSITE' };

      mockDb.limit.mockResolvedValueOnce([mockClient]);
      mockDb.where
        .mockReturnValueOnce(mockDb)
        .mockResolvedValueOnce([{ dow: 1 }, { dow: 2 }]);

      mockDb.transaction.mockImplementation(async (callback) => {
        const tx = {
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
        };
        return callback(tx);
      });

      mockDb.limit.mockResolvedValueOnce([updatedClient]);
      mockDb.where
        .mockReturnValueOnce(mockDb)
        .mockResolvedValueOnce([
          { dow: 1 },
          { dow: 2 },
          { dow: 3 },
          { dow: 4 },
          { dow: 5 },
        ]);

      const result = await service.update(mockClient.id, {
        workMode: 'ONSITE',
        officeDays: [1, 2, 3, 4, 5],
      });

      expect(result.workMode).toBe('ONSITE');
      expect(result.officeDays).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('softDelete', () => {
    const mockClient = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      companyType: 'CLIENT',
      name: 'Tech Company',
      email: 'tech@example.com',
      passwordHash: 'hashed-password',
      taxId: '123456789',
      status: 'ACTIVE',
      workMode: 'HYBRID',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should throw NotFoundException when client not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.softDelete('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should set status to INACTIVE', async () => {
      const deletedClient = { ...mockClient, status: 'INACTIVE' };
      const officeDays = [{ dow: 1 }, { dow: 2 }];

      // First findOne chain: select->from->innerJoin->where->limit (returns client)
      // Then: select->from->where (returns office days)
      // Then update->set->where
      // Second findOne chain: same as first

      mockDb.limit
        .mockResolvedValueOnce([mockClient])
        .mockResolvedValueOnce([deletedClient]);

      // where() needs to: 1) chain to limit, 2) resolve office days, 3) resolve for update,
      // 4) chain to limit, 5) resolve office days
      mockDb.where
        .mockReturnValueOnce(mockDb) // chains to limit for first findOne
        .mockResolvedValueOnce(officeDays) // returns office days for first findOne
        .mockResolvedValueOnce(undefined) // update().set().where() resolves
        .mockReturnValueOnce(mockDb) // chains to limit for second findOne
        .mockResolvedValueOnce(officeDays); // returns office days for second findOne

      const result = await service.softDelete(mockClient.id);

      expect(result.status).toBe('INACTIVE');
      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});
