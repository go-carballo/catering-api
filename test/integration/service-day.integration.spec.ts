import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and, gte, lte } from 'drizzle-orm';
import { getTestDb, cleanDatabase } from './test-db';
import {
  companies,
  cateringProfiles,
  clientProfiles,
  contracts,
  contractServiceDays,
  serviceDays,
} from '../../src/shared/infrastructure/database/schema';

describe('ServiceDay Repository Integration', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let cateringCompanyId: string;
  let clientCompanyId: string;
  let contractId: string;

  beforeAll(async () => {
    db = await getTestDb();
  });

  afterAll(async () => {
    // Don't close here - let global teardown handle it
  });

  beforeEach(async () => {
    await cleanDatabase(db);

    // Create test catering company
    const [catering] = await db
      .insert(companies)
      .values({
        companyType: 'CATERING',
        name: 'Test Catering',
        email: 'catering@test.com',
        passwordHash: 'hash123',
        status: 'ACTIVE',
      })
      .returning();
    cateringCompanyId = catering.id;

    await db.insert(cateringProfiles).values({
      companyId: cateringCompanyId,
      dailyCapacity: 100,
    });

    // Create test client company
    const [client] = await db
      .insert(companies)
      .values({
        companyType: 'CLIENT',
        name: 'Test Client',
        email: 'client@test.com',
        passwordHash: 'hash456',
        status: 'ACTIVE',
      })
      .returning();
    clientCompanyId = client.id;

    await db.insert(clientProfiles).values({
      companyId: clientCompanyId,
      workMode: 'HYBRID',
    });

    // Create contract
    const [contract] = await db
      .insert(contracts)
      .values({
        cateringCompanyId,
        clientCompanyId,
        pricePerService: '15.00',
        minDailyQuantity: 10,
        maxDailyQuantity: 50,
        noticePeriodHours: 24,
        status: 'ACTIVE',
      })
      .returning();
    contractId = contract.id;

    // Add service days (Mon-Fri)
    await db.insert(contractServiceDays).values([
      { contractId, dow: 1 },
      { contractId, dow: 2 },
      { contractId, dow: 3 },
      { contractId, dow: 4 },
      { contractId, dow: 5 },
    ]);
  });

  describe('ServiceDay CRUD', () => {
    it('should create a service day', async () => {
      const [serviceDay] = await db
        .insert(serviceDays)
        .values({
          contractId,
          serviceDate: new Date('2026-01-19'), // Monday
        })
        .returning();

      expect(serviceDay.id).toBeDefined();
      expect(serviceDay.contractId).toBe(contractId);
      expect(serviceDay.status).toBe('PENDING');
      expect(serviceDay.expectedQuantity).toBeNull();
      expect(serviceDay.servedQuantity).toBeNull();
    });

    it('should enforce unique constraint on contract + date', async () => {
      await db.insert(serviceDays).values({
        contractId,
        serviceDate: new Date('2026-01-19'),
      });

      // Try to insert duplicate
      await expect(
        db.insert(serviceDays).values({
          contractId,
          serviceDate: new Date('2026-01-19'),
        }),
      ).rejects.toThrow();
    });

    it('should update expected quantity (client confirmation)', async () => {
      const [serviceDay] = await db
        .insert(serviceDays)
        .values({
          contractId,
          serviceDate: new Date('2026-01-19'),
        })
        .returning();

      const now = new Date();
      const [updated] = await db
        .update(serviceDays)
        .set({
          expectedQuantity: 25,
          expectedConfirmedAt: now,
          updatedAt: now,
        })
        .where(eq(serviceDays.id, serviceDay.id))
        .returning();

      expect(updated.expectedQuantity).toBe(25);
      expect(updated.expectedConfirmedAt).toEqual(now);
      expect(updated.status).toBe('PENDING'); // Still pending until served confirmed
    });

    it('should update served quantity and confirm (catering confirmation)', async () => {
      const [serviceDay] = await db
        .insert(serviceDays)
        .values({
          contractId,
          serviceDate: new Date('2026-01-19'),
          expectedQuantity: 25,
          expectedConfirmedAt: new Date(),
        })
        .returning();

      const now = new Date();
      const [updated] = await db
        .update(serviceDays)
        .set({
          servedQuantity: 23,
          servedConfirmedAt: now,
          status: 'CONFIRMED',
          updatedAt: now,
        })
        .where(eq(serviceDays.id, serviceDay.id))
        .returning();

      expect(updated.servedQuantity).toBe(23);
      expect(updated.servedConfirmedAt).toEqual(now);
      expect(updated.status).toBe('CONFIRMED');
    });
  });

  describe('ServiceDay Queries', () => {
    beforeEach(async () => {
      // Create a week of service days
      const dates = [
        new Date('2026-01-19'), // Mon
        new Date('2026-01-20'), // Tue
        new Date('2026-01-21'), // Wed
        new Date('2026-01-22'), // Thu
        new Date('2026-01-23'), // Fri
      ];

      for (const date of dates) {
        await db.insert(serviceDays).values({
          contractId,
          serviceDate: date,
        });
      }
    });

    it('should find service days by date range', async () => {
      const from = new Date('2026-01-19');
      const to = new Date('2026-01-21');

      const result = await db
        .select()
        .from(serviceDays)
        .where(
          and(
            eq(serviceDays.contractId, contractId),
            gte(serviceDays.serviceDate, from),
            lte(serviceDays.serviceDate, to),
          ),
        )
        .orderBy(serviceDays.serviceDate);

      expect(result).toHaveLength(3);
    });

    it('should find pending service days', async () => {
      // Confirm one day
      const [firstDay] = await db
        .select()
        .from(serviceDays)
        .where(eq(serviceDays.contractId, contractId))
        .limit(1);

      await db
        .update(serviceDays)
        .set({ status: 'CONFIRMED', servedQuantity: 20 })
        .where(eq(serviceDays.id, firstDay.id));

      const pendingDays = await db
        .select()
        .from(serviceDays)
        .where(
          and(
            eq(serviceDays.contractId, contractId),
            eq(serviceDays.status, 'PENDING'),
          ),
        );

      expect(pendingDays).toHaveLength(4);
    });

    it('should calculate totals with aggregation', async () => {
      // Set quantities for some days
      const days = await db
        .select()
        .from(serviceDays)
        .where(eq(serviceDays.contractId, contractId));

      await db
        .update(serviceDays)
        .set({ expectedQuantity: 20, servedQuantity: 18, status: 'CONFIRMED' })
        .where(eq(serviceDays.id, days[0].id));

      await db
        .update(serviceDays)
        .set({ expectedQuantity: 25, servedQuantity: 25, status: 'CONFIRMED' })
        .where(eq(serviceDays.id, days[1].id));

      await db
        .update(serviceDays)
        .set({ expectedQuantity: 15 })
        .where(eq(serviceDays.id, days[2].id));

      // Get all days and calculate totals
      const allDays = await db
        .select()
        .from(serviceDays)
        .where(eq(serviceDays.contractId, contractId));

      const totalExpected = allDays.reduce(
        (sum, d) => sum + (d.expectedQuantity ?? 0),
        0,
      );
      const totalServed = allDays.reduce(
        (sum, d) => sum + (d.servedQuantity ?? 0),
        0,
      );
      const confirmedCount = allDays.filter(
        (d) => d.status === 'CONFIRMED',
      ).length;

      expect(totalExpected).toBe(60); // 20 + 25 + 15
      expect(totalServed).toBe(43); // 18 + 25
      expect(confirmedCount).toBe(2);
    });
  });

  describe('ServiceDay Cascade Delete', () => {
    it('should delete service days when contract is deleted', async () => {
      await db.insert(serviceDays).values([
        { contractId, serviceDate: new Date('2026-01-19') },
        { contractId, serviceDate: new Date('2026-01-20') },
        { contractId, serviceDate: new Date('2026-01-21') },
      ]);

      // Verify service days exist
      const beforeDelete = await db
        .select()
        .from(serviceDays)
        .where(eq(serviceDays.contractId, contractId));
      expect(beforeDelete).toHaveLength(3);

      // Delete contract
      await db.delete(contracts).where(eq(contracts.id, contractId));

      // Verify cascade delete
      const afterDelete = await db
        .select()
        .from(serviceDays)
        .where(eq(serviceDays.contractId, contractId));
      expect(afterDelete).toHaveLength(0);
    });
  });

  describe('ServiceDay with Contract Join', () => {
    it('should join service day with contract details', async () => {
      const [serviceDay] = await db
        .insert(serviceDays)
        .values({
          contractId,
          serviceDate: new Date('2026-01-19'),
          expectedQuantity: 30,
          servedQuantity: 28,
          status: 'CONFIRMED',
        })
        .returning();

      const result = await db
        .select({
          serviceDayId: serviceDays.id,
          serviceDate: serviceDays.serviceDate,
          servedQuantity: serviceDays.servedQuantity,
          pricePerService: contracts.pricePerService,
          cateringCompanyId: contracts.cateringCompanyId,
          clientCompanyId: contracts.clientCompanyId,
        })
        .from(serviceDays)
        .innerJoin(contracts, eq(serviceDays.contractId, contracts.id))
        .where(eq(serviceDays.id, serviceDay.id));

      expect(result).toHaveLength(1);
      expect(result[0].pricePerService).toBe('15.00');
      expect(result[0].servedQuantity).toBe(28);
      expect(result[0].cateringCompanyId).toBe(cateringCompanyId);
      expect(result[0].clientCompanyId).toBe(clientCompanyId);
    });
  });
});
