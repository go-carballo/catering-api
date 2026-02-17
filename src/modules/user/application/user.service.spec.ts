import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UserService } from './user.service';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';

const COMPANY_A_ID = '00000000-0000-0000-0000-000000000001';
const COMPANY_B_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = '00000000-0000-0000-0000-000000000010';

const createMockUser = (overrides = {}) => ({
  id: USER_ID,
  companyId: COMPANY_A_ID,
  email: 'john@example.com',
  name: 'John Doe',
  role: 'EMPLOYEE' as const,
  isActive: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...overrides,
});

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(),
  delete: vi.fn().mockReturnThis(),
};

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.insert.mockReturnThis();
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.values.mockReturnThis();
    mockDb.delete.mockReturnThis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  // ──────────────────────────────────────────────
  // findAllByCompany
  // ──────────────────────────────────────────────
  describe('findAllByCompany', () => {
    it('should return all users for the given company', async () => {
      const mockUsers = [
        createMockUser(),
        createMockUser({
          id: '00000000-0000-0000-0000-000000000011',
          email: 'jane@example.com',
        }),
      ];

      mockDb.where.mockResolvedValue(mockUsers);

      const result = await service.findAllByCompany(COMPANY_A_ID);

      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('john@example.com');
      expect(result[1].email).toBe('jane@example.com');
    });

    it('should return empty array when company has no users', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await service.findAllByCompany(COMPANY_A_ID);

      expect(result).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────
  // findOne
  // ──────────────────────────────────────────────
  describe('findOne', () => {
    it('should return user when found and belongs to the company', async () => {
      const mockUser = createMockUser();
      mockDb.limit.mockResolvedValue([mockUser]);

      const result = await service.findOne(USER_ID, COMPANY_A_ID);

      expect(result).toBeDefined();
      expect(result.id).toBe(USER_ID);
      expect(result.email).toBe('john@example.com');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(service.findOne(USER_ID, COMPANY_A_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user belongs to another company', async () => {
      const mockUser = createMockUser({ companyId: COMPANY_A_ID });
      mockDb.limit.mockResolvedValue([mockUser]);

      await expect(service.findOne(USER_ID, COMPANY_B_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ──────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────
  describe('create', () => {
    it('should create a user for the given company', async () => {
      const input = {
        email: 'new@example.com',
        name: 'New User',
        role: 'MANAGER' as const,
      };
      const mockUser = createMockUser({
        email: input.email,
        name: input.name,
        role: input.role,
      });

      mockDb.returning.mockResolvedValue([mockUser]);

      const result = await service.create(COMPANY_A_ID, input);

      expect(result.email).toBe('new@example.com');
      expect(result.name).toBe('New User');
      expect(result.role).toBe('MANAGER');
    });
  });

  // ──────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────
  describe('update', () => {
    it('should update user when it belongs to the company', async () => {
      const mockUser = createMockUser();
      const updatedUser = createMockUser({ name: 'John Updated' });

      // First call: findOne (limit)
      // Second call: update returning
      mockDb.limit.mockResolvedValue([mockUser]);
      mockDb.returning.mockResolvedValue([updatedUser]);

      const result = await service.update(USER_ID, COMPANY_A_ID, {
        name: 'John Updated',
      });

      expect(result.name).toBe('John Updated');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.update(USER_ID, COMPANY_A_ID, { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user belongs to another company', async () => {
      const mockUser = createMockUser({ companyId: COMPANY_A_ID });
      mockDb.limit.mockResolvedValue([mockUser]);

      await expect(
        service.update(USER_ID, COMPANY_B_ID, { name: 'Hacked Name' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────────
  // delete
  // ──────────────────────────────────────────────
  describe('delete', () => {
    it('should delete user when it belongs to the company', async () => {
      const mockUser = createMockUser();
      mockDb.limit.mockResolvedValue([mockUser]);

      await service.delete(USER_ID, COMPANY_A_ID);

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(service.delete(USER_ID, COMPANY_A_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user belongs to another company', async () => {
      const mockUser = createMockUser({ companyId: COMPANY_A_ID });
      mockDb.limit.mockResolvedValue([mockUser]);

      await expect(service.delete(USER_ID, COMPANY_B_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
