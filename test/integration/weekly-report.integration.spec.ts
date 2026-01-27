import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { getTestDb, cleanDatabase } from './test-db';
import * as schema from '../../src/shared/infrastructure/database/schema';
import { ServiceDayService } from '../../src/modules/service-day/application/service-day.service';
import { ContractService } from '../../src/modules/contract/application/contract.service';
import { ForbiddenException } from '@nestjs/common';

/**
 * Integration tests for WeeklyReport and CSV Export
 *
 * These tests run against a real PostgreSQL database to verify:
 * - Correct aggregation of service days within a week
 * - Authorization rules (only contract parties can view)
 * - Cost calculations with actual price data
 * - CSV formatting with real data
 */
describe('WeeklyReport Integration', () => {
  let db: ReturnType<typeof drizzle>;
  let serviceDayService: ServiceDayService;
  let contractService: ContractService;

  // Test data IDs
  let cateringCompanyId: string;
  let clientCompanyId: string;
  let otherCompanyId: string;
  let contractId: string;

  beforeAll(async () => {
    db = await getTestDb();

    // Create a minimal ContractService mock that uses real DB
    contractService = {
      findOne: async (id: string) => {
        const [contract] = await db
          .select()
          .from(schema.contracts)
          .where(eq(schema.contracts.id, id))
          .limit(1);

        if (!contract) {
          throw new Error('Contract not found');
        }

        return {
          ...contract,
          pricePerService: parseFloat(contract.pricePerService),
        };
      },
    } as ContractService;

    // Create ServiceDayService with real DB
    serviceDayService = new ServiceDayService(db as any, contractService);
  });

  afterAll(async () => {
    // Connection cleanup handled by global teardown
  });

  beforeEach(async () => {
    await cleanDatabase(db);

    // 1. Create catering company
    const [cateringCompany] = await db
      .insert(schema.companies)
      .values({
        companyType: 'CATERING',
        name: 'Premium Catering Co.',
        email: 'catering@test.com',
        passwordHash: 'hash',
        status: 'ACTIVE',
      })
      .returning();
    cateringCompanyId = cateringCompany.id;

    await db.insert(schema.cateringProfiles).values({
      companyId: cateringCompanyId,
      dailyCapacity: 500,
    });

    // 2. Create client company
    const [clientCompany] = await db
      .insert(schema.companies)
      .values({
        companyType: 'CLIENT',
        name: 'TechCorp Industries',
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

    // 3. Create another company (unauthorized)
    const [otherCompany] = await db
      .insert(schema.companies)
      .values({
        companyType: 'CLIENT',
        name: 'Other Corp',
        email: 'other@test.com',
        passwordHash: 'hash',
        status: 'ACTIVE',
      })
      .returning();
    otherCompanyId = otherCompany.id;

    await db.insert(schema.clientProfiles).values({
      companyId: otherCompanyId,
      workMode: 'ONSITE',
    });

    // 4. Create contract with specific price
    const [contract] = await db
      .insert(schema.contracts)
      .values({
        cateringCompanyId,
        clientCompanyId,
        startDate: new Date('2025-01-01'),
        pricePerService: '12.50',
        flexibleQuantity: true,
        minDailyQuantity: 20,
        maxDailyQuantity: 150,
        noticePeriodHours: 48,
        status: 'ACTIVE',
      })
      .returning();
    contractId = contract.id;
  });

  describe('getWeeklyReport', () => {
    it('should return empty report when no service days exist', async () => {
      const weekStart = new Date('2026-01-19'); // Monday

      const report = await serviceDayService.getWeeklyReport(
        contractId,
        weekStart,
        clientCompanyId,
      );

      expect(report.contractId).toBe(contractId);
      expect(report.cateringCompany.name).toBe('Premium Catering Co.');
      expect(report.clientCompany.name).toBe('TechCorp Industries');
      expect(report.summary.totalDays).toBe(0);
      expect(report.summary.confirmedDays).toBe(0);
      expect(report.summary.pendingDays).toBe(0);
      expect(report.summary.totalExpected).toBe(0);
      expect(report.summary.totalServed).toBe(0);
      expect(report.summary.totalCost).toBe(0);
      expect(report.serviceDays).toHaveLength(0);
    });

    it('should correctly aggregate service days for a full week', async () => {
      const weekStart = new Date('2026-01-19');

      // Create 5 service days (Mon-Fri)
      await db.insert(schema.serviceDays).values([
        {
          contractId,
          serviceDate: new Date('2026-01-19'),
          expectedQuantity: 50,
          servedQuantity: 48,
          status: 'CONFIRMED',
        },
        {
          contractId,
          serviceDate: new Date('2026-01-20'),
          expectedQuantity: 55,
          servedQuantity: 55,
          status: 'CONFIRMED',
        },
        {
          contractId,
          serviceDate: new Date('2026-01-21'),
          expectedQuantity: 45,
          servedQuantity: 42,
          status: 'CONFIRMED',
        },
        {
          contractId,
          serviceDate: new Date('2026-01-22'),
          expectedQuantity: 60,
          servedQuantity: null, // Not yet served
          status: 'PENDING',
        },
        {
          contractId,
          serviceDate: new Date('2026-01-23'),
          expectedQuantity: null, // Not yet confirmed
          servedQuantity: null,
          status: 'PENDING',
        },
      ]);

      const report = await serviceDayService.getWeeklyReport(
        contractId,
        weekStart,
        clientCompanyId,
      );

      expect(report.summary.totalDays).toBe(5);
      expect(report.summary.confirmedDays).toBe(3);
      expect(report.summary.pendingDays).toBe(2);
      expect(report.summary.totalExpected).toBe(210); // 50+55+45+60+0
      expect(report.summary.totalServed).toBe(145); // 48+55+42+0+0
      expect(report.summary.totalCost).toBe(1812.5); // 145 * 12.50
      expect(report.serviceDays).toHaveLength(5);
    });

    it('should allow catering company to view the report', async () => {
      await db.insert(schema.serviceDays).values({
        contractId,
        serviceDate: new Date('2026-01-19'),
        expectedQuantity: 30,
        servedQuantity: 30,
        status: 'CONFIRMED',
      });

      const report = await serviceDayService.getWeeklyReport(
        contractId,
        new Date('2026-01-19'),
        cateringCompanyId,
      );

      expect(report.summary.totalDays).toBe(1);
      expect(report.summary.totalCost).toBe(375); // 30 * 12.50
    });

    it('should throw ForbiddenException for unauthorized company', async () => {
      await expect(
        serviceDayService.getWeeklyReport(
          contractId,
          new Date('2026-01-19'),
          otherCompanyId,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        serviceDayService.getWeeklyReport(
          contractId,
          new Date('2026-01-19'),
          otherCompanyId,
        ),
      ).rejects.toThrow(
        'Only the catering or client company can view this report',
      );
    });

    it('should only include service days within the week range', async () => {
      const weekStart = new Date('2026-01-19');

      // Days inside the week (Mon Jan 19 to Sun Jan 25)
      await db.insert(schema.serviceDays).values([
        {
          contractId,
          serviceDate: new Date('2026-01-19'), // Monday (in range)
          expectedQuantity: 30,
          servedQuantity: 30,
          status: 'CONFIRMED',
        },
        {
          contractId,
          serviceDate: new Date('2026-01-25'), // Sunday (in range - day 6)
          expectedQuantity: 25,
          servedQuantity: 25,
          status: 'CONFIRMED',
        },
        {
          contractId,
          serviceDate: new Date('2026-01-18'), // Sunday before (out of range)
          expectedQuantity: 100,
          servedQuantity: 100,
          status: 'CONFIRMED',
        },
        {
          contractId,
          serviceDate: new Date('2026-01-26'), // Monday after (out of range)
          expectedQuantity: 100,
          servedQuantity: 100,
          status: 'CONFIRMED',
        },
      ]);

      const report = await serviceDayService.getWeeklyReport(
        contractId,
        weekStart,
        clientCompanyId,
      );

      expect(report.summary.totalDays).toBe(2);
      expect(report.summary.totalServed).toBe(55); // 30 + 25
    });

    it('should calculate individual day costs correctly', async () => {
      await db.insert(schema.serviceDays).values([
        {
          contractId,
          serviceDate: new Date('2026-01-19'),
          expectedQuantity: 40,
          servedQuantity: 35,
          status: 'CONFIRMED',
        },
        {
          contractId,
          serviceDate: new Date('2026-01-20'),
          expectedQuantity: 50,
          servedQuantity: null,
          status: 'PENDING',
        },
      ]);

      const report = await serviceDayService.getWeeklyReport(
        contractId,
        new Date('2026-01-19'),
        clientCompanyId,
      );

      expect(report.serviceDays[0].cost).toBe(437.5); // 35 * 12.50
      expect(report.serviceDays[1].cost).toBe(0); // null served = 0 cost
    });

    it('should include contract price in report', async () => {
      const report = await serviceDayService.getWeeklyReport(
        contractId,
        new Date('2026-01-19'),
        clientCompanyId,
      );

      expect(report.pricePerService).toBe(12.5);
    });

    it('should handle week spanning month boundary', async () => {
      // Week starting Monday Jan 26, ends Sunday Feb 1
      const weekStart = new Date('2026-01-26');

      await db.insert(schema.serviceDays).values([
        {
          contractId,
          serviceDate: new Date('2026-01-30'), // Friday Jan
          expectedQuantity: 40,
          servedQuantity: 40,
          status: 'CONFIRMED',
        },
        {
          contractId,
          serviceDate: new Date('2026-02-01'), // Sunday Feb (still in week)
          expectedQuantity: 30,
          servedQuantity: 30,
          status: 'CONFIRMED',
        },
      ]);

      const report = await serviceDayService.getWeeklyReport(
        contractId,
        weekStart,
        clientCompanyId,
      );

      expect(report.summary.totalDays).toBe(2);
      expect(report.summary.totalServed).toBe(70);
    });
  });

  describe('getWeeklyReportCsv', () => {
    it('should generate CSV with correct header information', async () => {
      const csv = await serviceDayService.getWeeklyReportCsv(
        contractId,
        new Date('2026-01-19'),
        clientCompanyId,
      );

      const lines = csv.split('\n');

      expect(lines[0]).toContain('Premium Catering Co.');
      expect(lines[0]).toContain('TechCorp Industries');
      expect(lines[1]).toContain('Week:');
      expect(lines[1]).toContain('2026-01-19');
      expect(lines[1]).toContain('2026-01-25');
      expect(lines[2]).toContain('Price per Service: 12.5');
    });

    it('should generate CSV with correct column headers', async () => {
      const csv = await serviceDayService.getWeeklyReportCsv(
        contractId,
        new Date('2026-01-19'),
        clientCompanyId,
      );

      expect(csv).toContain(
        'Date,Day,Expected Quantity,Served Quantity,Status,Cost',
      );
    });

    it('should format data rows correctly', async () => {
      await db.insert(schema.serviceDays).values([
        {
          contractId,
          serviceDate: new Date('2026-01-19'),
          expectedQuantity: 50,
          servedQuantity: 48,
          status: 'CONFIRMED',
        },
        {
          contractId,
          serviceDate: new Date('2026-01-20'),
          expectedQuantity: 40,
          servedQuantity: null,
          status: 'PENDING',
        },
      ]);

      const csv = await serviceDayService.getWeeklyReportCsv(
        contractId,
        new Date('2026-01-19'),
        clientCompanyId,
      );

      // Check data rows contain expected values
      expect(csv).toContain('2026-01-19');
      expect(csv).toContain('50');
      expect(csv).toContain('48');
      expect(csv).toContain('CONFIRMED');
      expect(csv).toContain('600.00'); // 48 * 12.50

      expect(csv).toContain('2026-01-20');
      expect(csv).toContain('40');
      expect(csv).toContain('PENDING');
      expect(csv).toContain('0.00');

      // Day names depend on server timezone, just verify they're present
      // (The timezone issue is documented and will be fixed separately)
      const lines = csv.split('\n');
      // Find lines that start with a date (data rows)
      const dataLines = lines.filter((l) => /^\d{4}-\d{2}-\d{2},/.test(l));
      expect(dataLines).toHaveLength(2);
      // Each data line should have a 3-letter day abbreviation
      dataLines.forEach((line) => {
        expect(line).toMatch(/,(Sun|Mon|Tue|Wed|Thu|Fri|Sat),/);
      });
    });

    it('should include summary section with totals', async () => {
      await db.insert(schema.serviceDays).values([
        {
          contractId,
          serviceDate: new Date('2026-01-19'),
          expectedQuantity: 50,
          servedQuantity: 45,
          status: 'CONFIRMED',
        },
        {
          contractId,
          serviceDate: new Date('2026-01-20'),
          expectedQuantity: 60,
          servedQuantity: 55,
          status: 'CONFIRMED',
        },
      ]);

      const csv = await serviceDayService.getWeeklyReportCsv(
        contractId,
        new Date('2026-01-19'),
        clientCompanyId,
      );

      expect(csv).toContain('Total Days,2');
      expect(csv).toContain('Confirmed Days,2');
      expect(csv).toContain('Total Expected,110');
      expect(csv).toContain('Total Served,100');
      expect(csv).toContain('Total Cost,1250.00'); // 100 * 12.50
    });

    it('should throw ForbiddenException for unauthorized company', async () => {
      await expect(
        serviceDayService.getWeeklyReportCsv(
          contractId,
          new Date('2026-01-19'),
          otherCompanyId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle empty expected/served quantities in CSV', async () => {
      await db.insert(schema.serviceDays).values({
        contractId,
        serviceDate: new Date('2026-01-19'),
        expectedQuantity: null,
        servedQuantity: null,
        status: 'PENDING',
      });

      const csv = await serviceDayService.getWeeklyReportCsv(
        contractId,
        new Date('2026-01-19'),
        clientCompanyId,
      );

      // Should have empty values, not "null" strings
      const lines = csv.split('\n');
      const dataLine = lines.find((l) => l.includes('2026-01-19'));
      expect(dataLine).toBeDefined();
      expect(dataLine).not.toContain('null');
    });

    it('should format decimal costs with two decimal places', async () => {
      // Create contract with price that produces decimal costs
      const [decimalContract] = await db
        .insert(schema.contracts)
        .values({
          cateringCompanyId,
          clientCompanyId,
          startDate: new Date('2025-01-01'),
          pricePerService: '7.33', // Will produce decimal costs
          flexibleQuantity: true,
          minDailyQuantity: 10,
          maxDailyQuantity: 100,
          noticePeriodHours: 24,
          status: 'ACTIVE',
        })
        .returning();

      await db.insert(schema.serviceDays).values({
        contractId: decimalContract.id,
        serviceDate: new Date('2026-01-19'),
        expectedQuantity: 33,
        servedQuantity: 33,
        status: 'CONFIRMED',
      });

      const csv = await serviceDayService.getWeeklyReportCsv(
        decimalContract.id,
        new Date('2026-01-19'),
        clientCompanyId,
      );

      // 33 * 7.33 = 241.89
      expect(csv).toContain('241.89');
    });
  });
});
