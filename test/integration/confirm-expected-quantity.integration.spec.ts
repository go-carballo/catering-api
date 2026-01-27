import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { getTestDb, cleanDatabase } from './test-db';
import * as schema from '../../src/shared/infrastructure/database/schema';
import { DrizzleServiceDayRepository } from '../../src/modules/service-day/infrastructure/drizzle-service-day.repository';
import { ConfirmExpectedQuantityUseCase } from '../../src/modules/service-day/application/use-cases';
import { SystemClock } from '../../src/shared/infrastructure/system-clock';

/**
 * Integration tests for ConfirmExpectedQuantity Use Case
 *
 * These tests run against a real PostgreSQL database to verify:
 * - Repository implementation
 * - Database constraints
 * - End-to-end use case execution
 */
describe('ConfirmExpectedQuantity Integration', () => {
  let db: ReturnType<typeof drizzle>;
  let repository: DrizzleServiceDayRepository;
  let useCase: ConfirmExpectedQuantityUseCase;
  let clock: SystemClock;

  // Test data IDs
  let cateringCompanyId: string;
  let clientCompanyId: string;
  let contractId: string;
  let serviceDayId: string;

  beforeAll(async () => {
    db = await getTestDb();
    // Note: initializeDatabase is called once in global-setup.ts

    // Create repository with test DB (inject via constructor hack for testing)
    repository = new DrizzleServiceDayRepository(db as any);
    clock = new SystemClock();
    useCase = new ConfirmExpectedQuantityUseCase(repository, clock);
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

    // 4. Create a future service day
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7); // 7 days from now

    const [serviceDay] = await db
      .insert(schema.serviceDays)
      .values({
        contractId,
        serviceDate: futureDate,
        status: 'PENDING',
      })
      .returning();
    serviceDayId = serviceDay.id;
  });

  describe('Repository: findByIdWithContract', () => {
    it('should return service day with contract data', async () => {
      const result = await repository.findByIdWithContract(serviceDayId);

      expect(result).not.toBeNull();
      expect(result!.serviceDay.id).toBe(serviceDayId);
      expect(result!.serviceDay.contractId).toBe(contractId);
      expect(result!.contract.id).toBe(contractId);
      expect(result!.contract.cateringCompanyId).toBe(cateringCompanyId);
      expect(result!.contract.clientCompanyId).toBe(clientCompanyId);
      expect(result!.contract.minDailyQuantity).toBe(10);
      expect(result!.contract.maxDailyQuantity).toBe(100);
      expect(result!.contract.noticePeriodHours).toBe(24);
      expect(result!.contract.serviceDays).toEqual(
        expect.arrayContaining([1, 2, 3, 4, 5]),
      );
    });

    it('should return null for non-existent id', async () => {
      const result = await repository.findByIdWithContract(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(result).toBeNull();
    });
  });

  describe('Repository: save', () => {
    it('should persist service day entity changes', async () => {
      const data = await repository.findByIdWithContract(serviceDayId);
      expect(data).not.toBeNull();

      const { serviceDay } = data!;
      const now = new Date();

      // Mutate the entity (simulating what confirmExpected does)
      serviceDay.confirmExpected(
        50,
        {
          cateringCompanyId,
          clientCompanyId,
          minDailyQuantity: 10,
          maxDailyQuantity: 100,
          noticePeriodHours: 24,
        },
        now,
      );

      const result = await repository.save(serviceDay);

      expect(result.expectedQuantity).toBe(50);
      expect(result.expectedConfirmedAt).toEqual(now);

      // Verify in database
      const [dbRow] = await db
        .select()
        .from(schema.serviceDays)
        .where(eq(schema.serviceDays.id, serviceDayId));

      expect(dbRow.expectedQuantity).toBe(50);
      expect(dbRow.expectedConfirmedAt).toEqual(now);
    });
  });

  describe('Use Case: Success Scenarios', () => {
    it('should confirm expected quantity end-to-end', async () => {
      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 50,
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.serviceDay.expectedQuantity).toBe(50);
        expect(result.serviceDay.expectedConfirmedAt).toBeDefined();
      }

      // Verify persisted in database
      const [dbRow] = await db
        .select()
        .from(schema.serviceDays)
        .where(eq(schema.serviceDays.id, serviceDayId));

      expect(dbRow.expectedQuantity).toBe(50);
      expect(dbRow.expectedConfirmedAt).not.toBeNull();
    });
  });

  describe('Use Case: Authorization Errors', () => {
    it('should reject when catering company tries to confirm', async () => {
      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 50,
        companyId: cateringCompanyId, // Wrong company type
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

      expect(dbRow.expectedQuantity).toBeNull();
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
        expectedQuantity: 50,
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTRACT_NOT_ACTIVE');
      }
    });
  });

  describe('Use Case: Immutability', () => {
    it('should reject second confirmation attempt', async () => {
      // First confirmation
      const first = await useCase.execute({
        serviceDayId,
        expectedQuantity: 50,
        companyId: clientCompanyId,
      });
      expect(first.success).toBe(true);

      // Second confirmation attempt should fail
      const second = await useCase.execute({
        serviceDayId,
        expectedQuantity: 75, // Different quantity
        companyId: clientCompanyId,
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

      expect(dbRow.expectedQuantity).toBe(50); // Original value
    });
  });

  describe('Use Case: Quantity Validation', () => {
    it('should reject quantity below minimum', async () => {
      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 5, // Min is 10
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('QUANTITY_OUT_OF_RANGE');
      }
    });

    it('should reject quantity above maximum', async () => {
      const result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 150, // Max is 100
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('QUANTITY_OUT_OF_RANGE');
      }
    });

    it('should accept boundary values', async () => {
      // Min boundary
      let result = await useCase.execute({
        serviceDayId,
        expectedQuantity: 10, // Exactly min
        companyId: clientCompanyId,
      });
      expect(result.success).toBe(true);

      // Reset for next test
      await cleanDatabase(db);
      // Re-seed for max test (simplified - just create new service day)
      const [catering] = await db
        .insert(schema.companies)
        .values({
          companyType: 'CATERING',
          name: 'C',
          email: 'c@t.com',
          passwordHash: 'h',
        })
        .returning();
      const [client] = await db
        .insert(schema.companies)
        .values({
          companyType: 'CLIENT',
          name: 'L',
          email: 'l@t.com',
          passwordHash: 'h',
        })
        .returning();
      await db
        .insert(schema.cateringProfiles)
        .values({ companyId: catering.id, dailyCapacity: 100 });
      await db
        .insert(schema.clientProfiles)
        .values({ companyId: client.id, workMode: 'HYBRID' });
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const [contract] = await db
        .insert(schema.contracts)
        .values({
          cateringCompanyId: catering.id,
          clientCompanyId: client.id,
          pricePerService: '10',
          minDailyQuantity: 10,
          maxDailyQuantity: 100,
          noticePeriodHours: 24,
          status: 'ACTIVE',
        })
        .returning();
      await db
        .insert(schema.contractServiceDays)
        .values({ contractId: contract.id, dow: 1 });
      const [sd] = await db
        .insert(schema.serviceDays)
        .values({ contractId: contract.id, serviceDate: futureDate })
        .returning();

      // Max boundary
      result = await useCase.execute({
        serviceDayId: sd.id,
        expectedQuantity: 100, // Exactly max
        companyId: client.id,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Use Case: Notice Period', () => {
    it('should reject when notice period has passed', async () => {
      // Create a service day for tomorrow (less than 24h notice)
      const tomorrow = new Date();
      tomorrow.setHours(tomorrow.getHours() + 12); // Only 12 hours away

      const [nearServiceDay] = await db
        .insert(schema.serviceDays)
        .values({
          contractId,
          serviceDate: tomorrow,
          status: 'PENDING',
        })
        .returning();

      const result = await useCase.execute({
        serviceDayId: nearServiceDay.id,
        expectedQuantity: 50,
        companyId: clientCompanyId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOTICE_PERIOD_EXCEEDED');
      }
    });
  });
});
