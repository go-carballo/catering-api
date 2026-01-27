import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { getTestDb, cleanDatabase } from './test-db';
import * as schema from '../../src/shared/infrastructure/database/schema';
import { DrizzleServiceDayRepository } from '../../src/modules/service-day/infrastructure/drizzle-service-day.repository';
import { ConfirmServedQuantityUseCase } from '../../src/modules/service-day/application/use-cases';
import { SystemClock } from '../../src/shared/infrastructure/system-clock';

/**
 * Integration tests for ConfirmServedQuantity Use Case
 *
 * These tests run against a real PostgreSQL database to verify:
 * - Repository implementation (save)
 * - Database constraints
 * - End-to-end use case execution
 */
describe('ConfirmServedQuantity Integration', () => {
  let db: ReturnType<typeof drizzle>;
  let repository: DrizzleServiceDayRepository;
  let useCase: ConfirmServedQuantityUseCase;
  let clock: SystemClock;

  // Test data IDs
  let cateringCompanyId: string;
  let clientCompanyId: string;
  let contractId: string;
  let serviceDayId: string;

  beforeAll(async () => {
    db = await getTestDb();
    // Note: initializeDatabase is called once in global-setup.ts

    // Create repository with test DB
    repository = new DrizzleServiceDayRepository(db as any);
    clock = new SystemClock();
    useCase = new ConfirmServedQuantityUseCase(repository, clock);
  });

  afterAll(async () => {
    // Don't close here - let global teardown handle it
  });

  beforeEach(async () => {
    await cleanDatabase(db);

    // Seed test data
    // 1. Create catering company
    const [cateringCompany] = await db
      .insert(schema.companies)
      .values({
        companyType: 'CATERING',
        name: 'Test Catering',
        email: 'catering@test.com',
        passwordHash: 'hash',
        status: 'ACTIVE',
      })
      .returning();
    cateringCompanyId = cateringCompany.id;

    await db.insert(schema.cateringProfiles).values({
      companyId: cateringCompanyId,
      dailyCapacity: 200,
    });

    // 2. Create client company
    const [clientCompany] = await db
      .insert(schema.companies)
      .values({
        companyType: 'CLIENT',
        name: 'Test Client',
        email: 'client@test.com',
        passwordHash: 'hash',
        status: 'ACTIVE',
      })
      .returning();
    clientCompanyId = clientCompany.id;

    await db.insert(schema.clientProfiles).values({
      companyId: clientCompanyId,
      workMode: 'HYBRID',
    });

    // 3. Create active contract
    const [contract] = await db
      .insert(schema.contracts)
      .values({
        cateringCompanyId,
        clientCompanyId,
        startDate: new Date('2025-01-01'),
        pricePerService: '10.50',
        flexibleQuantity: true,
        minDailyQuantity: 10,
        maxDailyQuantity: 100,
        noticePeriodHours: 24,
        status: 'ACTIVE',
      })
      .returning();
    contractId = contract.id;

    // Add service days to contract (Mon-Fri)
    await db.insert(schema.contractServiceDays).values([
      { contractId, dow: 1 },
      { contractId, dow: 2 },
      { contractId, dow: 3 },
      { contractId, dow: 4 },
      { contractId, dow: 5 },
    ]);

    // 4. Create a PENDING service day with expected quantity already confirmed
    const serviceDate = new Date();
    serviceDate.setDate(serviceDate.getDate() + 7); // 7 days from now

    const [serviceDay] = await db
      .insert(schema.serviceDays)
      .values({
        contractId,
        serviceDate,
        status: 'PENDING',
        expectedQuantity: 50,
        expectedConfirmedAt: new Date(),
      })
      .returning();
    serviceDayId = serviceDay.id;
  });

  describe('Repository: save (for served confirmation)', () => {
    it('should persist served quantity, timestamp, and status to CONFIRMED', async () => {
      const data = await repository.findByIdWithContract(serviceDayId);
      expect(data).not.toBeNull();

      const { serviceDay } = data!;
      const now = new Date();

      // Mutate the entity (simulating what confirmServed does)
      serviceDay.confirmServed(45, now);

      const result = await repository.save(serviceDay);

      expect(result.servedQuantity).toBe(45);
      expect(result.servedConfirmedAt).toEqual(now);
      expect(result.status).toBe('CONFIRMED');

      // Verify in database
      const [dbRow] = await db
        .select()
        .from(schema.serviceDays)
        .where(eq(schema.serviceDays.id, serviceDayId));

      expect(dbRow.servedQuantity).toBe(45);
      expect(dbRow.servedConfirmedAt).toEqual(now);
      expect(dbRow.status).toBe('CONFIRMED');
    });

    it('should allow zero served quantity', async () => {
      const data = await repository.findByIdWithContract(serviceDayId);
      expect(data).not.toBeNull();

      const { serviceDay } = data!;
      const now = new Date();

      serviceDay.confirmServed(0, now);

      const result = await repository.save(serviceDay);

      expect(result.servedQuantity).toBe(0);
      expect(result.status).toBe('CONFIRMED');
    });
  });

  describe('Use Case: Success Scenarios', () => {
    it('should confirm served quantity end-to-end', async () => {
      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: 45,
        companyId: cateringCompanyId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.serviceDay.servedQuantity).toBe(45);
        expect(result.serviceDay.servedConfirmedAt).toBeDefined();
        expect(result.serviceDay.status).toBe('CONFIRMED');
      }

      // Verify persisted in database
      const [dbRow] = await db
        .select()
        .from(schema.serviceDays)
        .where(eq(schema.serviceDays.id, serviceDayId));

      expect(dbRow.servedQuantity).toBe(45);
      expect(dbRow.servedConfirmedAt).not.toBeNull();
      expect(dbRow.status).toBe('CONFIRMED');
    });

    it('should allow serving more than expected', async () => {
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

    it('should allow serving less than expected', async () => {
      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: 30, // Less than expected 50
        companyId: cateringCompanyId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.serviceDay.servedQuantity).toBe(30);
      }
    });

    it('should allow serving zero', async () => {
      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: 0,
        companyId: cateringCompanyId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.serviceDay.servedQuantity).toBe(0);
        expect(result.serviceDay.status).toBe('CONFIRMED');
      }
    });
  });

  describe('Use Case: Authorization Errors', () => {
    it('should reject when client company tries to confirm', async () => {
      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: 45,
        companyId: clientCompanyId, // Wrong company - should be catering
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_AUTHORIZED');
      }

      // Verify NOT persisted
      const [dbRow] = await db
        .select()
        .from(schema.serviceDays)
        .where(eq(schema.serviceDays.id, serviceDayId));

      expect(dbRow.servedQuantity).toBeNull();
      expect(dbRow.status).toBe('PENDING');
    });

    it('should reject when unrelated company tries to confirm', async () => {
      // Create another catering company
      const [otherCatering] = await db
        .insert(schema.companies)
        .values({
          companyType: 'CATERING',
          name: 'Other Catering',
          email: 'other@test.com',
          passwordHash: 'hash',
        })
        .returning();

      await db.insert(schema.cateringProfiles).values({
        companyId: otherCatering.id,
        dailyCapacity: 100,
      });

      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: 45,
        companyId: otherCatering.id, // Different catering company
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_AUTHORIZED');
      }
    });
  });

  describe('Use Case: Contract Status Errors', () => {
    it('should reject when contract is paused', async () => {
      // Pause the contract
      await db
        .update(schema.contracts)
        .set({ status: 'PAUSED' })
        .where(eq(schema.contracts.id, contractId));

      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: 45,
        companyId: cateringCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTRACT_NOT_ACTIVE');
      }
    });

    it('should reject when contract is terminated', async () => {
      await db
        .update(schema.contracts)
        .set({ status: 'TERMINATED' })
        .where(eq(schema.contracts.id, contractId));

      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: 45,
        companyId: cateringCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTRACT_NOT_ACTIVE');
      }
    });
  });

  describe('Use Case: Immutability', () => {
    it('should reject second served confirmation attempt', async () => {
      // First confirmation
      const first = await useCase.execute({
        serviceDayId,
        servedQuantity: 45,
        companyId: cateringCompanyId,
      });
      expect(first.success).toBe(true);

      // Second confirmation attempt should fail
      const second = await useCase.execute({
        serviceDayId,
        servedQuantity: 50, // Different quantity
        companyId: cateringCompanyId,
      });

      expect(second.success).toBe(false);
      if (!second.success) {
        expect(second.error.code).toBe('ALREADY_CONFIRMED');
      }

      // Verify original quantity preserved
      const [dbRow] = await db
        .select()
        .from(schema.serviceDays)
        .where(eq(schema.serviceDays.id, serviceDayId));

      expect(dbRow.servedQuantity).toBe(45); // Original value
    });
  });

  describe('Use Case: Quantity Validation', () => {
    it('should reject negative quantity', async () => {
      const result = await useCase.execute({
        serviceDayId,
        servedQuantity: -1,
        companyId: cateringCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_QUANTITY');
      }
    });
  });

  describe('Use Case: Service Day Not Found', () => {
    it('should return error for non-existent service day', async () => {
      const result = await useCase.execute({
        serviceDayId: '00000000-0000-0000-0000-000000000000',
        servedQuantity: 45,
        companyId: cateringCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SERVICE_DAY_NOT_FOUND');
      }
    });
  });
});
