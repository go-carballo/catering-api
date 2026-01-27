import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { and, eq, gte, lte } from 'drizzle-orm';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';
import type { DrizzleClient } from '../../../shared/infrastructure/database/drizzle.client';
import {
  companies,
  serviceDays,
  ServiceDay as DbServiceDay,
} from '../../../shared/infrastructure/database/schema';
import { ConfirmExpectedDto, ConfirmServedDto } from './dto/service-day.dto';
import { ContractService } from '../../contract/application/contract.service';
import {
  getUTCDayName,
  formatISODate,
} from '../../../shared/domain/date.utils';

export type ServiceDay = DbServiceDay;

@Injectable()
export class ServiceDayService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
    @Inject(forwardRef(() => ContractService))
    private readonly contractService: ContractService,
  ) {}

  async findByContractAndDateRange(
    contractId: string,
    from: Date,
    to: Date,
  ): Promise<ServiceDay[]> {
    return this.db
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
  }

  async findOne(id: string): Promise<ServiceDay> {
    const results = await this.db
      .select()
      .from(serviceDays)
      .where(eq(serviceDays.id, id))
      .limit(1);

    if (results.length === 0) {
      throw new NotFoundException(`ServiceDay #${id} not found`);
    }

    return results[0];
  }

  /**
   * Generate service days for a contract within a date range.
   * Only generates for days that match the contract's serviceDays (dow).
   *
   * IDEMPOTENT: Uses ON CONFLICT DO NOTHING to safely handle re-runs.
   * The unique constraint (contract_id, service_date) prevents duplicates at DB level.
   */
  async generateForContract(
    contractId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<ServiceDay[]> {
    const contract = await this.contractService.findOne(contractId);

    if (contract.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Can only generate service days for ACTIVE contracts',
      );
    }

    const toInsert: { contractId: string; serviceDate: Date }[] = [];
    const currentDate = new Date(fromDate);

    while (currentDate <= toDate) {
      // getDay() returns 0-6 (Sun-Sat), we need 1-7 (Mon-Sun)
      const dow = currentDate.getDay() === 0 ? 7 : currentDate.getDay();

      if (contract.serviceDays.includes(dow as 1 | 2 | 3 | 4 | 5 | 6 | 7)) {
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
    // This safely handles re-runs without duplicating data
    const inserted = await this.db
      .insert(serviceDays)
      .values(toInsert)
      .onConflictDoNothing({
        target: [serviceDays.contractId, serviceDays.serviceDate],
      })
      .returning();

    return inserted;
  }

  /**
   * Client confirms expected quantity for a service day.
   * Must respect notice period and quantity limits.
   * Once confirmed, expectedQuantity cannot be changed (immutability).
   * Only the client company associated with the contract can confirm.
   */
  async confirmExpected(
    id: string,
    dto: ConfirmExpectedDto,
    companyId: string,
  ): Promise<ServiceDay> {
    const serviceDay = await this.findOne(id);
    const contract = await this.contractService.findOne(serviceDay.contractId);

    // Authorization: only client company can confirm expected
    if (contract.clientCompanyId !== companyId) {
      throw new ForbiddenException(
        'Only the client company can confirm expected quantity',
      );
    }

    if (serviceDay.status === 'CONFIRMED') {
      throw new BadRequestException('ServiceDay is already confirmed');
    }

    // Immutability: once expectedQuantity is set, it cannot be changed
    if (serviceDay.expectedConfirmedAt !== null) {
      throw new BadRequestException(
        'Expected quantity has already been confirmed and cannot be changed',
      );
    }

    // Validate notice period
    const now = new Date();
    const serviceDateTime = new Date(serviceDay.serviceDate);
    const hoursUntilService =
      (serviceDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilService < contract.noticePeriodHours) {
      throw new BadRequestException(
        `Must confirm at least ${contract.noticePeriodHours} hours before service`,
      );
    }

    // Validate quantity limits
    if (
      dto.expectedQuantity < contract.minDailyQuantity ||
      dto.expectedQuantity > contract.maxDailyQuantity
    ) {
      throw new BadRequestException(
        `Expected quantity must be between ${contract.minDailyQuantity} and ${contract.maxDailyQuantity}`,
      );
    }

    const [updated] = await this.db
      .update(serviceDays)
      .set({
        expectedQuantity: dto.expectedQuantity,
        expectedConfirmedAt: now,
        updatedAt: now,
      })
      .where(eq(serviceDays.id, id))
      .returning();

    return updated;
  }

  /**
   * Catering confirms served quantity after service.
   * This marks the ServiceDay as CONFIRMED (immutable).
   * Only the catering company associated with the contract can confirm.
   */
  async confirmServed(
    id: string,
    dto: ConfirmServedDto,
    companyId: string,
  ): Promise<ServiceDay> {
    const serviceDay = await this.findOne(id);
    const contract = await this.contractService.findOne(serviceDay.contractId);

    // Authorization: only catering company can confirm served
    if (contract.cateringCompanyId !== companyId) {
      throw new ForbiddenException(
        'Only the catering company can confirm served quantity',
      );
    }

    if (serviceDay.status === 'CONFIRMED') {
      throw new BadRequestException('ServiceDay is already confirmed');
    }

    const now = new Date();
    const [updated] = await this.db
      .update(serviceDays)
      .set({
        servedQuantity: dto.servedQuantity,
        servedConfirmedAt: now,
        status: 'CONFIRMED',
        updatedAt: now,
      })
      .where(eq(serviceDays.id, id))
      .returning();

    return updated;
  }

  /**
   * Get weekly report for a contract.
   * Only accessible by catering or client company of the contract.
   */
  async getWeeklyReport(
    contractId: string,
    weekStartDate: Date,
    companyId: string,
  ) {
    const contract = await this.contractService.findOne(contractId);

    // Authorization: only parties to the contract can view report
    if (
      contract.cateringCompanyId !== companyId &&
      contract.clientCompanyId !== companyId
    ) {
      throw new ForbiddenException(
        'Only the catering or client company can view this report',
      );
    }

    const weekEnd = new Date(weekStartDate);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const days = await this.findByContractAndDateRange(
      contractId,
      weekStartDate,
      weekEnd,
    );

    // Fetch company names for the report
    const [cateringCompany] = await this.db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, contract.cateringCompanyId))
      .limit(1);

    const [clientCompany] = await this.db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, contract.clientCompanyId))
      .limit(1);

    const totalExpected = days.reduce(
      (sum, sd) => sum + (sd.expectedQuantity ?? 0),
      0,
    );
    const totalServed = days.reduce(
      (sum, sd) => sum + (sd.servedQuantity ?? 0),
      0,
    );
    const totalCost = totalServed * contract.pricePerService;

    return {
      contractId,
      cateringCompany: {
        id: contract.cateringCompanyId,
        name: cateringCompany?.name ?? 'Unknown',
      },
      clientCompany: {
        id: contract.clientCompanyId,
        name: clientCompany?.name ?? 'Unknown',
      },
      pricePerService: contract.pricePerService,
      weekStartDate,
      weekEndDate: weekEnd,
      summary: {
        totalDays: days.length,
        confirmedDays: days.filter((sd) => sd.status === 'CONFIRMED').length,
        pendingDays: days.filter((sd) => sd.status === 'PENDING').length,
        totalExpected,
        totalServed,
        totalCost,
      },
      serviceDays: days.map((sd) => ({
        id: sd.id,
        serviceDate: sd.serviceDate,
        expectedQuantity: sd.expectedQuantity,
        servedQuantity: sd.servedQuantity,
        status: sd.status,
        cost: (sd.servedQuantity ?? 0) * contract.pricePerService,
      })),
    };
  }

  /**
   * Export weekly report as CSV.
   * Only accessible by catering or client company of the contract.
   */
  async getWeeklyReportCsv(
    contractId: string,
    weekStartDate: Date,
    companyId: string,
  ): Promise<string> {
    const report = await this.getWeeklyReport(
      contractId,
      weekStartDate,
      companyId,
    );

    const lines: string[] = [];

    // Header info
    lines.push(
      `Weekly Report - ${report.cateringCompany.name} / ${report.clientCompany.name}`,
    );
    lines.push(
      `Week: ${formatISODate(report.weekStartDate)} to ${formatISODate(report.weekEndDate)}`,
    );
    lines.push(`Price per Service: ${report.pricePerService}`);
    lines.push('');

    // CSV header
    lines.push('Date,Day,Expected Quantity,Served Quantity,Status,Cost');

    // Data rows
    for (const day of report.serviceDays) {
      const date = new Date(day.serviceDate);
      // Use UTC day name to avoid timezone inconsistencies
      const dayName = getUTCDayName(date);
      lines.push(
        [
          formatISODate(date),
          dayName,
          day.expectedQuantity ?? '',
          day.servedQuantity ?? '',
          day.status,
          day.cost.toFixed(2),
        ].join(','),
      );
    }

    // Summary
    lines.push('');
    lines.push(`Total Days,${report.summary.totalDays}`);
    lines.push(`Confirmed Days,${report.summary.confirmedDays}`);
    lines.push(`Total Expected,${report.summary.totalExpected}`);
    lines.push(`Total Served,${report.summary.totalServed}`);
    lines.push(`Total Cost,${report.summary.totalCost.toFixed(2)}`);

    return lines.join('\n');
  }
}
