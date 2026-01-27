import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, cleanDatabase } from './test-db';
import * as schema from '../../src/shared/infrastructure/database/schema';
import { DrizzleServiceDayRepository } from '../../src/modules/service-day/infrastructure/drizzle-service-day.repository';
import { ApplyExpectedFallbackUseCase } from '../../src/modules/service-day/application/use-cases';
import { SystemClock } from '../../src/shared/infrastructure/system-clock';

/**
 * Integration tests for ApplyExpectedFallback Use Case
 *
 * Business Rule: When a ServiceDay reaches its notice period deadline
 * without an expectedQuantity confirmation, automatically set it to
 * the contract's minDailyQuantity.
 *
 * This ensures:
 * - Catering company always knows minimum to prepare
 * - Client pays at least minimum if they don't confirm
 * - No operational chaos from unconfirmed orders
 */
describe('ApplyExpectedFallback Integration', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let repository: DrizzleServiceDayRepository;
  let useCase: ApplyExpectedFallbackUseCase;

  let cateringCompanyId: string;
  let clientCompanyId: string;
  let contractId: string;

  beforeAll(async () => {
    db = await getTestDb();
    repository = new DrizzleServiceDayRepository(db as any);
    // Use real SystemClock for integration tests
    useCase = new ApplyExpectedFallbackUseCase(repository, new SystemClock());
  });

  afterAll(async () => {
    // Don't close here - let global teardown handle it
  });

  beforeEach(async () => {
    await cleanDatabase(db);

    // Create catering company
    const [catering] = await db
      .insert(schema.companies)
      .values({
        companyType: 'CATERING',
        name: 'Test Catering',
        email: 'catering@test.com',
        passwordHash: 'hash',
        status: 'ACTIVE',
      })
      .returning();
    cateringCompanyId = catering.id;

    await db.insert(schema.cateringProfiles).values({
      companyId: cateringCompanyId,
      dailyCapacity: 200,
    });

    // Create client company
    const [client] = await db
      .insert(schema.companies)
      .values({
        companyType: 'CLIENT',
        name: 'Test Client',
        email: 'client@test.com',
        passwordHash: 'hash',
        status: 'ACTIVE',
      })
      .returning();
    clientCompanyId = client.id;

    await db.insert(schema.clientProfiles).values({
      companyId: clientCompanyId,
      workMode: 'HYBRID',
    });

    // Create active contract with 24h notice period and min quantity of 15
    const [contract] = await db
      .insert(schema.contracts)
      .values({
        cateringCompanyId,
        clientCompanyId,
        startDate: new Date('2025-01-01'),
        pricePerService: '10.50',
        flexibleQuantity: true,
        minDailyQuantity: 15,
        maxDailyQuantity: 100,
        noticePeriodHours: 24,
        status: 'ACTIVE',
      })
      .returning();
    contractId = contract.id;

    // Add service days (Mon-Fri)
    await db.insert(schema.contractServiceDays).values([
      { contractId, dow: 1 },
      { contractId, dow: 2 },
      { contractId, dow: 3 },
      { contractId, dow: 4 },
      { contractId, dow: 5 },
    ]);
  });

  describe('Fallback Application', () => {
    it('should apply fallback to service day past deadline', async () => {
      // Create a service day that's past its deadline (yesterday)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const [serviceDay] = await db
        .insert(schema.serviceDays)
        .values({
          contractId,
          serviceDate: yesterday,
          status: 'PENDING',
          expectedQuantity: null, // Not confirmed
        })
        .returning();

      // Execute fallback
      const result = await useCase.execute();

      // Verify result
      expect(result.processedCount).toBe(1);
      expect(result.appliedCount).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(result.applied[0].appliedQuantity).toBe(15); // minDailyQuantity

      // Verify persisted in database
      const [updated] = await db
        .select()
        .from(schema.serviceDays)
        .where(eq(schema.serviceDays.id, serviceDay.id));

      expect(updated.expectedQuantity).toBe(15);
      expect(updated.expectedConfirmedAt).not.toBeNull();
    });

    it('should apply fallback to multiple service days', async () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await db.insert(schema.serviceDays).values([
        { contractId, serviceDate: twoDaysAgo, status: 'PENDING' },
        { contractId, serviceDate: yesterday, status: 'PENDING' },
      ]);

      const result = await useCase.execute();

      expect(result.processedCount).toBe(2);
      expect(result.appliedCount).toBe(2);
    });

    it('should use contract-specific minDailyQuantity', async () => {
      // Create another contract with different minDailyQuantity
      const [client2] = await db
        .insert(schema.companies)
        .values({
          companyType: 'CLIENT',
          name: 'Client 2',
          email: 'client2@test.com',
          passwordHash: 'hash',
          status: 'ACTIVE',
        })
        .returning();

      await db.insert(schema.clientProfiles).values({
        companyId: client2.id,
        workMode: 'HYBRID',
      });

      const [contract2] = await db
        .insert(schema.contracts)
        .values({
          cateringCompanyId,
          clientCompanyId: client2.id,
          pricePerService: '12.00',
          minDailyQuantity: 25, // Different min quantity
          maxDailyQuantity: 150,
          noticePeriodHours: 24,
          status: 'ACTIVE',
        })
        .returning();

      await db
        .insert(schema.contractServiceDays)
        .values({ contractId: contract2.id, dow: 1 });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Create service days for both contracts
      const [sd1] = await db
        .insert(schema.serviceDays)
        .values({ contractId, serviceDate: yesterday, status: 'PENDING' })
        .returning();

      const [sd2] = await db
        .insert(schema.serviceDays)
        .values({
          contractId: contract2.id,
          serviceDate: yesterday,
          status: 'PENDING',
        })
        .returning();

      const result = await useCase.execute();

      expect(result.appliedCount).toBe(2);

      // Verify each got correct minDailyQuantity
      const [updated1] = await db
        .select()
        .from(schema.serviceDays)
        .where(eq(schema.serviceDays.id, sd1.id));
      expect(updated1.expectedQuantity).toBe(15);

      const [updated2] = await db
        .select()
        .from(schema.serviceDays)
        .where(eq(schema.serviceDays.id, sd2.id));
      expect(updated2.expectedQuantity).toBe(25);
    });
  });

  describe('Exclusion Criteria', () => {
    it('should NOT apply fallback to service day that already has expectedQuantity', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await db.insert(schema.serviceDays).values({
        contractId,
        serviceDate: yesterday,
        status: 'PENDING',
        expectedQuantity: 50, // Already confirmed
        expectedConfirmedAt: new Date(),
      });

      const result = await useCase.execute();

      expect(result.processedCount).toBe(0);
      expect(result.appliedCount).toBe(0);
    });

    it('should NOT apply fallback to CONFIRMED service day', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await db.insert(schema.serviceDays).values({
        contractId,
        serviceDate: yesterday,
        status: 'CONFIRMED',
        expectedQuantity: null,
        servedQuantity: 50,
        servedConfirmedAt: new Date(),
      });

      const result = await useCase.execute();

      expect(result.processedCount).toBe(0);
    });

    it('should NOT apply fallback to service day still within notice period', async () => {
      // Create a service day 7 days from now (well within 24h notice period)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      await db.insert(schema.serviceDays).values({
        contractId,
        serviceDate: futureDate,
        status: 'PENDING',
        expectedQuantity: null,
      });

      const result = await useCase.execute();

      expect(result.processedCount).toBe(0);
    });

    it('should NOT apply fallback for PAUSED contract', async () => {
      // Pause the contract
      await db
        .update(schema.contracts)
        .set({ status: 'PAUSED' })
        .where(eq(schema.contracts.id, contractId));

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await db.insert(schema.serviceDays).values({
        contractId,
        serviceDate: yesterday,
        status: 'PENDING',
        expectedQuantity: null,
      });

      const result = await useCase.execute();

      expect(result.processedCount).toBe(0);
    });

    it('should NOT apply fallback for TERMINATED contract', async () => {
      await db
        .update(schema.contracts)
        .set({ status: 'TERMINATED' })
        .where(eq(schema.contracts.id, contractId));

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await db.insert(schema.serviceDays).values({
        contractId,
        serviceDate: yesterday,
        status: 'PENDING',
        expectedQuantity: null,
      });

      const result = await useCase.execute();

      expect(result.processedCount).toBe(0);
    });
  });

  describe('Idempotency', () => {
    it('should not change anything on second run (already has expectedQuantity)', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await db.insert(schema.serviceDays).values({
        contractId,
        serviceDate: yesterday,
        status: 'PENDING',
        expectedQuantity: null,
      });

      // First run - should apply fallback
      const firstResult = await useCase.execute();
      expect(firstResult.appliedCount).toBe(1);

      // Second run - nothing to process
      const secondResult = await useCase.execute();
      expect(secondResult.processedCount).toBe(0);
      expect(secondResult.appliedCount).toBe(0);
    });
  });

  describe('Notice Period Boundary', () => {
    it('should apply fallback exactly at deadline boundary', async () => {
      // This test verifies the SQL condition handles the boundary correctly
      // We create a service day with service time in a few hours but
      // the deadline (24h before) has just passed

      // Service time: 23 hours from now (deadline was 1 hour ago)
      const serviceDate = new Date();
      serviceDate.setHours(serviceDate.getHours() + 23);

      await db.insert(schema.serviceDays).values({
        contractId,
        serviceDate,
        status: 'PENDING',
        expectedQuantity: null,
      });

      const result = await useCase.execute();

      // Deadline was serviceDate - 24h = 1 hour ago, so should be eligible
      expect(result.processedCount).toBe(1);
      expect(result.appliedCount).toBe(1);
    });
  });
});
