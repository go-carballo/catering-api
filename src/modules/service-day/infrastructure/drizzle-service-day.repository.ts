import { Injectable, Inject } from '@nestjs/common';
import { eq, and, isNull, sql } from 'drizzle-orm';
import type {
  ServiceDayRepository,
  ServiceDayWithContract,
} from '../domain/service-day.repository';
import {
  ServiceDay,
  ServiceDayData,
  ServiceDayEntity,
} from '../domain/service-day.entity';
import {
  ContractEntity,
  DayOfWeek,
} from '../../contract/domain/contract.entity';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';
import type { DrizzleClient } from '../../../shared/infrastructure/database/drizzle.client';
import {
  serviceDays,
  contracts,
  contractServiceDays,
} from '../../../shared/infrastructure/database/schema';

@Injectable()
export class DrizzleServiceDayRepository implements ServiceDayRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleClient) {}

  async findByIdWithContract(
    id: string,
  ): Promise<ServiceDayWithContract | null> {
    const result = await this.db
      .select({
        serviceDay: serviceDays,
        contract: contracts,
      })
      .from(serviceDays)
      .innerJoin(contracts, eq(serviceDays.contractId, contracts.id))
      .where(eq(serviceDays.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];

    // Fetch contract service days
    const serviceDaysRows = await this.db
      .select({ dow: contractServiceDays.dow })
      .from(contractServiceDays)
      .where(eq(contractServiceDays.contractId, row.contract.id));

    const contractServiceDaysList = serviceDaysRows.map(
      (r) => r.dow as DayOfWeek,
    );

    // Return rich domain entities
    return {
      serviceDay: ServiceDayEntity.fromData(
        this.mapServiceDayData(row.serviceDay),
      ),
      contract: ContractEntity.fromData({
        id: row.contract.id,
        cateringCompanyId: row.contract.cateringCompanyId,
        clientCompanyId: row.contract.clientCompanyId,
        startDate: row.contract.startDate,
        endDate: row.contract.endDate,
        pricePerService: parseFloat(row.contract.pricePerService),
        flexibleQuantity: row.contract.flexibleQuantity,
        minDailyQuantity: row.contract.minDailyQuantity,
        maxDailyQuantity: row.contract.maxDailyQuantity,
        noticePeriodHours: row.contract.noticePeriodHours,
        serviceDays: contractServiceDaysList,
        status: row.contract.status,
        createdAt: row.contract.createdAt,
        updatedAt: row.contract.updatedAt,
      }),
    };
  }

  async save(entity: ServiceDayEntity): Promise<ServiceDay> {
    const data = entity.toData();

    const [updated] = await this.db
      .update(serviceDays)
      .set({
        expectedQuantity: data.expectedQuantity,
        servedQuantity: data.servedQuantity,
        expectedConfirmedAt: data.expectedConfirmedAt,
        servedConfirmedAt: data.servedConfirmedAt,
        status: data.status,
        updatedAt: data.updatedAt,
      })
      .where(eq(serviceDays.id, data.id))
      .returning();

    return this.mapServiceDayData(updated);
  }

  /**
   * Find all service days eligible for fallback application.
   *
   * Criteria:
   * - expectedQuantity IS NULL (client hasn't confirmed)
   * - status = 'PENDING'
   * - contract.status = 'ACTIVE'
   * - service_date - notice_period_hours <= currentTime (deadline passed)
   *
   * The deadline calculation: serviceDate - noticePeriodHours
   * We use PostgreSQL interval arithmetic for this.
   */
  async findEligibleForFallback(
    currentTime: Date,
  ): Promise<ServiceDayWithContract[]> {
    // Convert to ISO string for postgres driver compatibility
    const currentTimeIso = currentTime.toISOString();

    // Query service days where:
    // - expected_quantity IS NULL
    // - status = 'PENDING'
    // - contract is ACTIVE
    // - (service_date - notice_period_hours * interval '1 hour') <= currentTime
    const results = await this.db
      .select({
        serviceDay: serviceDays,
        contract: contracts,
      })
      .from(serviceDays)
      .innerJoin(contracts, eq(serviceDays.contractId, contracts.id))
      .where(
        and(
          isNull(serviceDays.expectedQuantity),
          eq(serviceDays.status, 'PENDING'),
          eq(contracts.status, 'ACTIVE'),
          // Deadline check: serviceDate - noticePeriodHours <= now
          sql`(${serviceDays.serviceDate}::timestamp - (${contracts.noticePeriodHours} * interval '1 hour')) <= ${currentTimeIso}::timestamp`,
        ),
      );

    if (results.length === 0) {
      return [];
    }

    // Fetch all contract service days in one query
    const contractIds = [...new Set(results.map((r) => r.contract.id))];
    const allServiceDaysRows = await this.db
      .select({
        contractId: contractServiceDays.contractId,
        dow: contractServiceDays.dow,
      })
      .from(contractServiceDays)
      .where(sql`${contractServiceDays.contractId} IN ${contractIds}`);

    // Group by contract
    const serviceDaysByContract = new Map<string, DayOfWeek[]>();
    for (const row of allServiceDaysRows) {
      const existing = serviceDaysByContract.get(row.contractId) ?? [];
      existing.push(row.dow as DayOfWeek);
      serviceDaysByContract.set(row.contractId, existing);
    }

    // Map to domain entities
    return results.map((row) => ({
      serviceDay: ServiceDayEntity.fromData(
        this.mapServiceDayData(row.serviceDay),
      ),
      contract: ContractEntity.fromData({
        id: row.contract.id,
        cateringCompanyId: row.contract.cateringCompanyId,
        clientCompanyId: row.contract.clientCompanyId,
        startDate: row.contract.startDate,
        endDate: row.contract.endDate,
        pricePerService: parseFloat(row.contract.pricePerService),
        flexibleQuantity: row.contract.flexibleQuantity,
        minDailyQuantity: row.contract.minDailyQuantity,
        maxDailyQuantity: row.contract.maxDailyQuantity,
        noticePeriodHours: row.contract.noticePeriodHours,
        serviceDays: serviceDaysByContract.get(row.contract.id) ?? [],
        status: row.contract.status,
        createdAt: row.contract.createdAt,
        updatedAt: row.contract.updatedAt,
      }),
    }));
  }

  private mapServiceDayData(
    row: typeof serviceDays.$inferSelect,
  ): ServiceDayData {
    return {
      id: row.id,
      contractId: row.contractId,
      serviceDate: row.serviceDate,
      expectedQuantity: row.expectedQuantity,
      servedQuantity: row.servedQuantity,
      expectedConfirmedAt: row.expectedConfirmedAt,
      servedConfirmedAt: row.servedConfirmedAt,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
