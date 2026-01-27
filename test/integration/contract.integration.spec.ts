import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, closeTestDb, cleanDatabase } from './test-db';
import {
  companies,
  cateringProfiles,
  clientProfiles,
  contracts,
  contractServiceDays,
} from '../../src/shared/infrastructure/database/schema';

describe('Contract Repository Integration', () => {
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

    // Create test catering company
    const [catering] = await db
      .insert(companies)
      .values({
        companyType: 'CATERING',
        name: 'Test Catering Co',
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
        name: 'Test Client Corp',
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
  });

  describe('Contract CRUD', () => {
    it('should create a contract with service days', async () => {
      // Insert contract
      const [contract] = await db
        .insert(contracts)
        .values({
          cateringCompanyId,
          clientCompanyId,
          pricePerService: '15.50',
          minDailyQuantity: 10,
          maxDailyQuantity: 50,
          noticePeriodHours: 24,
          status: 'ACTIVE',
        })
        .returning();

      // Insert service days (Mon-Fri)
      await db.insert(contractServiceDays).values([
        { contractId: contract.id, dow: 1 },
        { contractId: contract.id, dow: 2 },
        { contractId: contract.id, dow: 3 },
        { contractId: contract.id, dow: 4 },
        { contractId: contract.id, dow: 5 },
      ]);

      // Verify contract
      expect(contract.id).toBeDefined();
      expect(contract.cateringCompanyId).toBe(cateringCompanyId);
      expect(contract.clientCompanyId).toBe(clientCompanyId);
      expect(contract.status).toBe('ACTIVE');

      // Verify service days
      const serviceDays = await db
        .select()
        .from(contractServiceDays)
        .where(eq(contractServiceDays.contractId, contract.id));

      expect(serviceDays).toHaveLength(5);
      expect(serviceDays.map((sd) => sd.dow).sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('should find contract by id with all fields', async () => {
      const [created] = await db
        .insert(contracts)
        .values({
          cateringCompanyId,
          clientCompanyId,
          pricePerService: '20.00',
          minDailyQuantity: 5,
          maxDailyQuantity: 25,
          noticePeriodHours: 48,
          flexibleQuantity: false,
          status: 'ACTIVE',
        })
        .returning();

      const [found] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, created.id));

      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.pricePerService).toBe('20.00');
      expect(found.minDailyQuantity).toBe(5);
      expect(found.maxDailyQuantity).toBe(25);
      expect(found.noticePeriodHours).toBe(48);
      expect(found.flexibleQuantity).toBe(false);
    });

    it('should update contract status', async () => {
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

      // Pause
      const [paused] = await db
        .update(contracts)
        .set({ status: 'PAUSED', updatedAt: new Date() })
        .where(eq(contracts.id, contract.id))
        .returning();

      expect(paused.status).toBe('PAUSED');

      // Resume
      const [resumed] = await db
        .update(contracts)
        .set({ status: 'ACTIVE', updatedAt: new Date() })
        .where(eq(contracts.id, contract.id))
        .returning();

      expect(resumed.status).toBe('ACTIVE');

      // Terminate
      const [terminated] = await db
        .update(contracts)
        .set({ status: 'TERMINATED', updatedAt: new Date() })
        .where(eq(contracts.id, contract.id))
        .returning();

      expect(terminated.status).toBe('TERMINATED');
    });

    it('should cascade delete service days when contract is deleted', async () => {
      const [contract] = await db
        .insert(contracts)
        .values({
          cateringCompanyId,
          clientCompanyId,
          pricePerService: '15.00',
          minDailyQuantity: 10,
          maxDailyQuantity: 50,
          noticePeriodHours: 24,
        })
        .returning();

      await db.insert(contractServiceDays).values([
        { contractId: contract.id, dow: 1 },
        { contractId: contract.id, dow: 3 },
        { contractId: contract.id, dow: 5 },
      ]);

      // Delete contract
      await db.delete(contracts).where(eq(contracts.id, contract.id));

      // Verify service days are deleted
      const remainingDays = await db
        .select()
        .from(contractServiceDays)
        .where(eq(contractServiceDays.contractId, contract.id));

      expect(remainingDays).toHaveLength(0);
    });
  });

  describe('Contract Queries', () => {
    it('should find active contracts only', async () => {
      // Create active contract
      await db.insert(contracts).values({
        cateringCompanyId,
        clientCompanyId,
        pricePerService: '15.00',
        minDailyQuantity: 10,
        maxDailyQuantity: 50,
        noticePeriodHours: 24,
        status: 'ACTIVE',
      });

      // Create terminated contract
      await db.insert(contracts).values({
        cateringCompanyId,
        clientCompanyId,
        pricePerService: '15.00',
        minDailyQuantity: 10,
        maxDailyQuantity: 50,
        noticePeriodHours: 24,
        status: 'TERMINATED',
      });

      const activeContracts = await db
        .select()
        .from(contracts)
        .where(eq(contracts.status, 'ACTIVE'));

      expect(activeContracts).toHaveLength(1);
      expect(activeContracts[0].status).toBe('ACTIVE');
    });

    it('should find contracts by catering company', async () => {
      await db.insert(contracts).values({
        cateringCompanyId,
        clientCompanyId,
        pricePerService: '15.00',
        minDailyQuantity: 10,
        maxDailyQuantity: 50,
        noticePeriodHours: 24,
      });

      const result = await db
        .select()
        .from(contracts)
        .where(eq(contracts.cateringCompanyId, cateringCompanyId));

      expect(result).toHaveLength(1);
      expect(result[0].cateringCompanyId).toBe(cateringCompanyId);
    });

    it('should find contracts by client company', async () => {
      await db.insert(contracts).values({
        cateringCompanyId,
        clientCompanyId,
        pricePerService: '15.00',
        minDailyQuantity: 10,
        maxDailyQuantity: 50,
        noticePeriodHours: 24,
      });

      const result = await db
        .select()
        .from(contracts)
        .where(eq(contracts.clientCompanyId, clientCompanyId));

      expect(result).toHaveLength(1);
      expect(result[0].clientCompanyId).toBe(clientCompanyId);
    });
  });

  describe('Contract with Company Join', () => {
    it('should join contract with catering and client companies', async () => {
      const [contract] = await db
        .insert(contracts)
        .values({
          cateringCompanyId,
          clientCompanyId,
          pricePerService: '15.00',
          minDailyQuantity: 10,
          maxDailyQuantity: 50,
          noticePeriodHours: 24,
        })
        .returning();

      // Join with companies to get names
      const result = await db
        .select({
          contractId: contracts.id,
          cateringName: companies.name,
          status: contracts.status,
        })
        .from(contracts)
        .innerJoin(companies, eq(contracts.cateringCompanyId, companies.id))
        .where(eq(contracts.id, contract.id));

      expect(result).toHaveLength(1);
      expect(result[0].cateringName).toBe('Test Catering Co');
    });
  });
});
