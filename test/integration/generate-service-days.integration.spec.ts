import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and, gte, lte } from 'drizzle-orm';
import { getTestDb, cleanDatabase } from './test-db';
import * as schema from '../../src/shared/infrastructure/database/schema';

/**
 * Integration tests for ServiceDay Generation (Scheduler Job)
 *
 * These tests verify the core functionality that powers the scheduled job:
 * 1. ACTIVE contracts → generates correct service days
 * 2. PAUSED/TERMINATED contracts → no generation
 * 3. Idempotency → re-running doesn't duplicate
 * 4. Only configured days (contract_service_days) are generated
 */
describe('GenerateServiceDays Integration', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let cateringCompanyId: string;
  let clientCompanyId: string;

  beforeAll(async () => {
    db = await getTestDb();
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
  });

  /**
   * Helper to create a local date without timezone issues.
   * Using Date constructor with year, month, day ensures local timezone.
   */
  function localDate(year: number, month: number, day: number): Date {
    return new Date(year, month - 1, day); // month is 0-indexed in JS
  }

  /**
   * Helper to create a contract with service days
   */
  async function createContract(
    status: 'ACTIVE' | 'PAUSED' | 'TERMINATED',
    serviceDaysOfWeek: number[] = [1, 2, 3, 4, 5], // Mon-Fri by default
  ) {
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
        status,
      })
      .returning();

    // Add service days configuration
    if (serviceDaysOfWeek.length > 0) {
      await db.insert(schema.contractServiceDays).values(
        serviceDaysOfWeek.map((dow) => ({
          contractId: contract.id,
          dow,
        })),
      );
    }

    return contract;
  }

  /**
   * Helper to generate service days using ON CONFLICT DO NOTHING
   * This mirrors what ServiceDayService.generateForContract does
   */
  async function generateServiceDays(
    contractId: string,
    fromDate: Date,
    toDate: Date,
    configuredDays: number[],
  ) {
    const toInsert: { contractId: string; serviceDate: Date }[] = [];
    const currentDate = new Date(fromDate);

    while (currentDate <= toDate) {
      const dow = currentDate.getDay() === 0 ? 7 : currentDate.getDay();

      if (configuredDays.includes(dow)) {
        toInsert.push({
          contractId,
          serviceDate: new Date(currentDate),
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (toInsert.length === 0) {
      return [];
    }

    // Use ON CONFLICT DO NOTHING for idempotent inserts
    const inserted = await db
      .insert(schema.serviceDays)
      .values(toInsert)
      .onConflictDoNothing({
        target: [schema.serviceDays.contractId, schema.serviceDays.serviceDate],
      })
      .returning();

    return inserted;
  }

  /**
   * Helper to get service days for a contract in date range
   */
  async function getServiceDays(
    contractId: string,
    fromDate: Date,
    toDate: Date,
  ) {
    return db
      .select()
      .from(schema.serviceDays)
      .where(
        and(
          eq(schema.serviceDays.contractId, contractId),
          gte(schema.serviceDays.serviceDate, fromDate),
          lte(schema.serviceDays.serviceDate, toDate),
        ),
      )
      .orderBy(schema.serviceDays.serviceDate);
  }

  describe('ACTIVE Contract Generation', () => {
    it('should generate service days for configured days of week only', async () => {
      // Contract with Mon, Wed, Fri only (1, 3, 5)
      const contract = await createContract('ACTIVE', [1, 3, 5]);

      // Generate for a week: Mon Jan 20 to Sun Jan 26, 2025
      // Jan 20, 2025 is a Monday
      const fromDate = localDate(2025, 1, 20); // Monday
      const toDate = localDate(2025, 1, 26); // Sunday

      const inserted = await generateServiceDays(
        contract.id,
        fromDate,
        toDate,
        [1, 3, 5],
      );

      // Should generate 3 days: Mon (20), Wed (22), Fri (24)
      expect(inserted).toHaveLength(3);

      // Use getUTCDate() since Postgres stores dates as UTC and returns them that way
      const days = inserted.map((sd) => new Date(sd.serviceDate).getUTCDate());

      // In the range Mon-Sun (20-26), Mon=20, Wed=22, Fri=24
      expect(days).toContain(20); // Monday Jan 20
      expect(days).toContain(22); // Wednesday Jan 22
      expect(days).toContain(24); // Friday Jan 24
    });

    it('should generate service days for full work week (Mon-Fri)', async () => {
      const contract = await createContract('ACTIVE', [1, 2, 3, 4, 5]);

      const fromDate = localDate(2025, 1, 20); // Monday
      const toDate = localDate(2025, 1, 26); // Sunday

      const inserted = await generateServiceDays(
        contract.id,
        fromDate,
        toDate,
        [1, 2, 3, 4, 5],
      );

      // Should generate 5 days: Mon-Fri
      expect(inserted).toHaveLength(5);
    });

    it('should generate for 7 days ahead (typical scheduler behavior)', async () => {
      const contract = await createContract('ACTIVE', [1, 2, 3, 4, 5]);

      const today = localDate(2025, 1, 22); // Wednesday
      const sevenDaysLater = localDate(2025, 1, 29); // next Wednesday

      const inserted = await generateServiceDays(
        contract.id,
        today,
        sevenDaysLater,
        [1, 2, 3, 4, 5],
      );

      // Wed 22, Thu 23, Fri 24, Mon 27, Tue 28, Wed 29 = 6 weekdays
      expect(inserted).toHaveLength(6);
    });

    it('should set correct initial status (PENDING)', async () => {
      const contract = await createContract('ACTIVE', [1]);

      const fromDate = localDate(2025, 1, 20); // Monday
      const toDate = localDate(2025, 1, 20);

      const inserted = await generateServiceDays(
        contract.id,
        fromDate,
        toDate,
        [1],
      );

      expect(inserted).toHaveLength(1);
      expect(inserted[0].status).toBe('PENDING');
      expect(inserted[0].expectedQuantity).toBeNull();
      expect(inserted[0].servedQuantity).toBeNull();
    });
  });

  describe('PAUSED/TERMINATED Contract - No Generation', () => {
    it('should NOT generate for PAUSED contract (scheduler should skip)', async () => {
      const contract = await createContract('PAUSED', [1, 2, 3, 4, 5]);

      // In real scheduler, we filter by ACTIVE status before calling generateForContract
      // This test verifies the contract status filtering works

      // Get all active contracts (this is what scheduler does)
      const activeContracts = await db
        .select()
        .from(schema.contracts)
        .where(eq(schema.contracts.status, 'ACTIVE'));

      // Should not include our PAUSED contract
      expect(activeContracts.find((c) => c.id === contract.id)).toBeUndefined();
    });

    it('should NOT generate for TERMINATED contract (scheduler should skip)', async () => {
      const contract = await createContract('TERMINATED', [1, 2, 3, 4, 5]);

      const activeContracts = await db
        .select()
        .from(schema.contracts)
        .where(eq(schema.contracts.status, 'ACTIVE'));

      expect(activeContracts.find((c) => c.id === contract.id)).toBeUndefined();
    });

    it('should only return ACTIVE contracts from findActiveContracts query', async () => {
      // Create one of each status
      const active = await createContract('ACTIVE', [1, 2, 3, 4, 5]);

      // Need different client for second contract (unique constraint)
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

      const [paused] = await db
        .insert(schema.contracts)
        .values({
          cateringCompanyId,
          clientCompanyId: client2.id,
          pricePerService: '10.00',
          minDailyQuantity: 5,
          maxDailyQuantity: 50,
          noticePeriodHours: 24,
          status: 'PAUSED',
        })
        .returning();

      const [client3] = await db
        .insert(schema.companies)
        .values({
          companyType: 'CLIENT',
          name: 'Client 3',
          email: 'client3@test.com',
          passwordHash: 'hash',
          status: 'ACTIVE',
        })
        .returning();
      await db.insert(schema.clientProfiles).values({
        companyId: client3.id,
        workMode: 'HYBRID',
      });

      const [terminated] = await db
        .insert(schema.contracts)
        .values({
          cateringCompanyId,
          clientCompanyId: client3.id,
          pricePerService: '10.00',
          minDailyQuantity: 5,
          maxDailyQuantity: 50,
          noticePeriodHours: 24,
          status: 'TERMINATED',
        })
        .returning();

      // Query active contracts
      const activeContracts = await db
        .select()
        .from(schema.contracts)
        .where(eq(schema.contracts.status, 'ACTIVE'));

      expect(activeContracts).toHaveLength(1);
      expect(activeContracts[0].id).toBe(active.id);
    });
  });

  describe('Idempotency - Re-run Does Not Duplicate', () => {
    it('should not create duplicates when run multiple times', async () => {
      const contract = await createContract('ACTIVE', [1, 2, 3, 4, 5]);

      const fromDate = localDate(2025, 1, 20);
      const toDate = localDate(2025, 1, 24);

      // First run
      const firstRun = await generateServiceDays(
        contract.id,
        fromDate,
        toDate,
        [1, 2, 3, 4, 5],
      );
      expect(firstRun).toHaveLength(5);

      // Second run (simulating scheduler running again)
      const secondRun = await generateServiceDays(
        contract.id,
        fromDate,
        toDate,
        [1, 2, 3, 4, 5],
      );

      // ON CONFLICT DO NOTHING returns empty when all rows conflict
      expect(secondRun).toHaveLength(0);

      // Verify only 5 rows in DB
      const allDays = await getServiceDays(contract.id, fromDate, toDate);
      expect(allDays).toHaveLength(5);
    });

    it('should handle overlapping date ranges correctly', async () => {
      const contract = await createContract('ACTIVE', [1, 2, 3, 4, 5]);

      // First run: Mon-Wed
      await generateServiceDays(
        contract.id,
        localDate(2025, 1, 20),
        localDate(2025, 1, 22),
        [1, 2, 3, 4, 5],
      );

      // Second run: Tue-Fri (overlaps Tue, Wed)
      const secondRun = await generateServiceDays(
        contract.id,
        localDate(2025, 1, 21),
        localDate(2025, 1, 24),
        [1, 2, 3, 4, 5],
      );

      // Should only insert Thu, Fri (Tue, Wed already exist)
      expect(secondRun).toHaveLength(2);

      // Total should be 5 (Mon, Tue, Wed, Thu, Fri)
      const allDays = await getServiceDays(
        contract.id,
        localDate(2025, 1, 20),
        localDate(2025, 1, 24),
      );
      expect(allDays).toHaveLength(5);
    });

    it('should maintain existing data when re-running after confirmations', async () => {
      const contract = await createContract('ACTIVE', [1, 2, 3, 4, 5]);

      const fromDate = localDate(2025, 1, 20);
      const toDate = localDate(2025, 1, 24);

      // First run
      const firstRun = await generateServiceDays(
        contract.id,
        fromDate,
        toDate,
        [1, 2, 3, 4, 5],
      );

      // Confirm expected quantity on first day
      const [updatedDay] = await db
        .update(schema.serviceDays)
        .set({
          expectedQuantity: 50,
          expectedConfirmedAt: new Date(),
        })
        .where(eq(schema.serviceDays.id, firstRun[0].id))
        .returning();

      expect(updatedDay.expectedQuantity).toBe(50);

      // Re-run scheduler
      await generateServiceDays(contract.id, fromDate, toDate, [1, 2, 3, 4, 5]);

      // Verify first day still has its confirmation
      const [verifyDay] = await db
        .select()
        .from(schema.serviceDays)
        .where(eq(schema.serviceDays.id, firstRun[0].id));

      expect(verifyDay.expectedQuantity).toBe(50);
      expect(verifyDay.expectedConfirmedAt).not.toBeNull();
    });
  });

  describe('Unique Constraint Enforcement', () => {
    it('should enforce unique constraint at database level', async () => {
      const contract = await createContract('ACTIVE', [1]);

      const serviceDate = localDate(2025, 1, 20);

      // Insert first
      await db.insert(schema.serviceDays).values({
        contractId: contract.id,
        serviceDate,
      });

      // Try direct insert (without ON CONFLICT) - should fail
      await expect(
        db.insert(schema.serviceDays).values({
          contractId: contract.id,
          serviceDate,
        }),
      ).rejects.toThrow();
    });

    it('should allow same date for different contracts', async () => {
      const contract1 = await createContract('ACTIVE', [1]);

      // Create second contract with different client
      const [client2] = await db
        .insert(schema.companies)
        .values({
          companyType: 'CLIENT',
          name: 'Client 2',
          email: 'client2-unique@test.com',
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
          pricePerService: '10.00',
          minDailyQuantity: 5,
          maxDailyQuantity: 50,
          noticePeriodHours: 24,
          status: 'ACTIVE',
        })
        .returning();

      const serviceDate = localDate(2025, 1, 20);

      // Both should succeed
      await db.insert(schema.serviceDays).values({
        contractId: contract1.id,
        serviceDate,
      });

      await db.insert(schema.serviceDays).values({
        contractId: contract2.id,
        serviceDate,
      });

      // Verify both exist
      const allDays = await db
        .select()
        .from(schema.serviceDays)
        .where(eq(schema.serviceDays.serviceDate, serviceDate));

      expect(allDays).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle contract with no service days configured', async () => {
      const contract = await createContract('ACTIVE', []); // No days configured

      const fromDate = localDate(2025, 1, 20);
      const toDate = localDate(2025, 1, 26);

      const inserted = await generateServiceDays(
        contract.id,
        fromDate,
        toDate,
        [],
      );

      expect(inserted).toHaveLength(0);
    });

    it('should handle weekend-only contract', async () => {
      const contract = await createContract('ACTIVE', [6, 7]); // Sat, Sun

      const fromDate = localDate(2025, 1, 20); // Monday
      const toDate = localDate(2025, 1, 26); // Sunday

      const inserted = await generateServiceDays(
        contract.id,
        fromDate,
        toDate,
        [6, 7],
      );

      // Should generate Sat 25 and Sun 26
      expect(inserted).toHaveLength(2);

      // Use getUTCDay() since Postgres stores dates as UTC
      const weekdays = inserted.map((sd) => {
        const d = new Date(sd.serviceDate);
        return d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      });
      expect(weekdays).toContain(6); // Saturday
      expect(weekdays).toContain(7); // Sunday
    });

    it('should handle single day range', async () => {
      const contract = await createContract('ACTIVE', [1]); // Monday only

      const singleDay = localDate(2025, 1, 20); // Monday

      const inserted = await generateServiceDays(
        contract.id,
        singleDay,
        singleDay,
        [1],
      );

      expect(inserted).toHaveLength(1);
    });
  });
});
