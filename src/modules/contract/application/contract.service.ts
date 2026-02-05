import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';
import type { DrizzleClient } from '../../../shared/infrastructure/database/drizzle.client';
import {
  contracts,
  contractServiceDays,
  companies,
  serviceDays,
  Contract as DbContract,
} from '../../../shared/infrastructure/database/schema';
import { CreateContractDto, DayOfWeek } from './dto/create-contract.dto';
import { OutboxRepository } from '../../../shared/outbox';
import {
  ContractCreatedEvent,
  ContractPausedEvent,
  ContractResumedEvent,
  ContractTerminatedEvent,
} from '../domain/events';
import { FinanceMetricsResponseDto } from './dto/finance-metrics.dto';

export interface ContractWithServiceDays extends Omit<
  DbContract,
  'pricePerService'
> {
  pricePerService: number;
  serviceDays: DayOfWeek[];
}

@Injectable()
export class ContractService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleClient) {}

  private async attachServiceDays(
    contract: DbContract,
  ): Promise<ContractWithServiceDays> {
    const days = await this.db
      .select({ dow: contractServiceDays.dow })
      .from(contractServiceDays)
      .where(eq(contractServiceDays.contractId, contract.id));

    return {
      ...contract,
      pricePerService: Number(contract.pricePerService),
      serviceDays: days.map((d) => d.dow as DayOfWeek),
    };
  }

  async findAll(): Promise<ContractWithServiceDays[]> {
    const results = await this.db.select().from(contracts);
    return Promise.all(results.map((c) => this.attachServiceDays(c)));
  }

  async findOne(id: string): Promise<ContractWithServiceDays> {
    const results = await this.db
      .select()
      .from(contracts)
      .where(eq(contracts.id, id))
      .limit(1);

    if (results.length === 0) {
      throw new NotFoundException(`Contract #${id} not found`);
    }

    return this.attachServiceDays(results[0]);
  }

  async findActiveContracts(): Promise<ContractWithServiceDays[]> {
    const results = await this.db
      .select()
      .from(contracts)
      .where(eq(contracts.status, 'ACTIVE'));

    return Promise.all(results.map((c) => this.attachServiceDays(c)));
  }

  async findByClientId(clientId: string): Promise<ContractWithServiceDays[]> {
    const results = await this.db
      .select()
      .from(contracts)
      .where(eq(contracts.clientCompanyId, clientId));

    return Promise.all(results.map((c) => this.attachServiceDays(c)));
  }

  async findByCateringId(
    cateringId: string,
  ): Promise<ContractWithServiceDays[]> {
    const results = await this.db
      .select()
      .from(contracts)
      .where(eq(contracts.cateringCompanyId, cateringId));

    return Promise.all(results.map((c) => this.attachServiceDays(c)));
  }

  async create(dto: CreateContractDto): Promise<ContractWithServiceDays> {
    // Validate min <= max
    if (dto.minDailyQuantity > dto.maxDailyQuantity) {
      throw new BadRequestException(
        'minDailyQuantity cannot be greater than maxDailyQuantity',
      );
    }

    // Validate catering company exists and is correct type
    const [catering] = await this.db
      .select({
        id: companies.id,
        companyType: companies.companyType,
        status: companies.status,
        name: companies.name,
      })
      .from(companies)
      .where(eq(companies.id, dto.cateringCompanyId))
      .limit(1);

    if (!catering) {
      throw new NotFoundException(
        `Catering company #${dto.cateringCompanyId} not found`,
      );
    }

    if (catering.companyType !== 'CATERING') {
      throw new BadRequestException(
        `Company "${catering.name}" is not a catering company`,
      );
    }

    if (catering.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Catering company "${catering.name}" is not active`,
      );
    }

    // Validate client company exists and is correct type
    const [client] = await this.db
      .select({
        id: companies.id,
        companyType: companies.companyType,
        status: companies.status,
        name: companies.name,
      })
      .from(companies)
      .where(eq(companies.id, dto.clientCompanyId))
      .limit(1);

    if (!client) {
      throw new NotFoundException(
        `Client company #${dto.clientCompanyId} not found`,
      );
    }

    if (client.companyType !== 'CLIENT') {
      throw new BadRequestException(
        `Company "${client.name}" is not a client company`,
      );
    }

    if (client.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Client company "${client.name}" is not active`,
      );
    }

    // Check for existing active contract between these companies
    const [existingContract] = await this.db
      .select({ id: contracts.id })
      .from(contracts)
      .where(
        and(
          eq(contracts.cateringCompanyId, dto.cateringCompanyId),
          eq(contracts.clientCompanyId, dto.clientCompanyId),
          eq(contracts.status, 'ACTIVE'),
        ),
      )
      .limit(1);

    if (existingContract) {
      throw new ConflictException(
        `An active contract already exists between "${catering.name}" and "${client.name}"`,
      );
    }

    const result = await this.db.transaction(async (tx) => {
      const [contract] = await tx
        .insert(contracts)
        .values({
          cateringCompanyId: dto.cateringCompanyId,
          clientCompanyId: dto.clientCompanyId,
          startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          pricePerService: dto.pricePerService.toString(),
          flexibleQuantity: dto.flexibleQuantity ?? true,
          minDailyQuantity: dto.minDailyQuantity,
          maxDailyQuantity: dto.maxDailyQuantity,
          noticePeriodHours: dto.noticePeriodHours,
          status: 'ACTIVE',
        })
        .returning();

      // Insert service days
      if (dto.serviceDays.length > 0) {
        await tx.insert(contractServiceDays).values(
          dto.serviceDays.map((dow) => ({
            contractId: contract.id,
            dow,
          })),
        );
      }

      // Store event in outbox (same transaction = guaranteed delivery)
      const event = new ContractCreatedEvent(contract.id, {
        contractId: contract.id,
        cateringCompanyId: contract.cateringCompanyId,
        clientCompanyId: contract.clientCompanyId,
        startDate: contract.startDate.toISOString(),
        endDate: contract.endDate?.toISOString() ?? null,
        pricePerService: Number(contract.pricePerService),
        minDailyQuantity: contract.minDailyQuantity,
        maxDailyQuantity: contract.maxDailyQuantity,
        serviceDays: dto.serviceDays,
      });
      await OutboxRepository.storeEvent(tx, event);

      return {
        ...contract,
        pricePerService: Number(contract.pricePerService),
        serviceDays: dto.serviceDays,
      };
    });

    return result;
  }

  async pause(id: string): Promise<ContractWithServiceDays> {
    const contract = await this.findOne(id);

    if (contract.status === 'TERMINATED') {
      throw new BadRequestException('Cannot pause a terminated contract');
    }

    if (contract.status === 'PAUSED') {
      throw new BadRequestException('Contract is already paused');
    }

    const result = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(contracts)
        .set({ status: 'PAUSED', updatedAt: new Date() })
        .where(eq(contracts.id, id))
        .returning();

      // Store event in outbox
      const event = new ContractPausedEvent(id, {
        contractId: id,
        previousStatus: contract.status,
        newStatus: 'PAUSED',
        changedAt: new Date().toISOString(),
      });
      await OutboxRepository.storeEvent(tx, event);

      return updated;
    });

    return this.attachServiceDays(result);
  }

  async resume(id: string): Promise<ContractWithServiceDays> {
    const contract = await this.findOne(id);

    if (contract.status === 'TERMINATED') {
      throw new BadRequestException('Cannot resume a terminated contract');
    }

    if (contract.status === 'ACTIVE') {
      throw new BadRequestException('Contract is already active');
    }

    const result = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(contracts)
        .set({ status: 'ACTIVE', updatedAt: new Date() })
        .where(eq(contracts.id, id))
        .returning();

      // Store event in outbox
      const event = new ContractResumedEvent(id, {
        contractId: id,
        previousStatus: contract.status,
        newStatus: 'ACTIVE',
        changedAt: new Date().toISOString(),
      });
      await OutboxRepository.storeEvent(tx, event);

      return updated;
    });

    return this.attachServiceDays(result);
  }

  async terminate(id: string): Promise<ContractWithServiceDays> {
    const contract = await this.findOne(id);

    const result = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(contracts)
        .set({ status: 'TERMINATED', updatedAt: new Date() })
        .where(eq(contracts.id, id))
        .returning();

      // Store event in outbox
      const event = new ContractTerminatedEvent(id, {
        contractId: id,
        cateringCompanyId: contract.cateringCompanyId,
        clientCompanyId: contract.clientCompanyId,
        terminatedAt: new Date().toISOString(),
      });
      await OutboxRepository.storeEvent(tx, event);

      return updated;
    });

    return this.attachServiceDays(result);
  }

  async getFinanceMetrics(
    clientCompanyId: string,
  ): Promise<FinanceMetricsResponseDto> {
    // Get all contracts for this client
    const clientContracts = await this.db
      .select()
      .from(contracts)
      .where(eq(contracts.clientCompanyId, clientCompanyId));

    if (clientContracts.length === 0) {
      // Return empty metrics if no contracts
      return {
        budget: {
          consumed: 0,
          estimated: 0,
          projectedEndOfMonth: 0,
          previousMonth: 0,
        },
        kpis: {
          costPerPerson: { current: 0, previousMonth: 0, change: 0 },
          utilizationRate: { current: 0, previousMonth: 0, change: 0 },
          contractsWithDeviation: 0,
          upcomingServicesWeek: { count: 0, estimatedCost: 0 },
        },
        recentServices: [],
      };
    }

    const contractIds = clientContracts.map((c) => c.id);

    // Date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startOfPreviousMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Query service days for current month (consumed + estimated)
    const currentMonthServices = await this.db
      .select({
        id: serviceDays.id,
        contractId: serviceDays.contractId,
        serviceDate: serviceDays.serviceDate,
        expectedQuantity: serviceDays.expectedQuantity,
        servedQuantity: serviceDays.servedQuantity,
        status: serviceDays.status,
        pricePerService: contracts.pricePerService,
        cateringName: companies.name,
        clientName: sql<string>`(SELECT name FROM ${companies} WHERE id = ${contracts.clientCompanyId})`,
      })
      .from(serviceDays)
      .innerJoin(contracts, eq(serviceDays.contractId, contracts.id))
      .innerJoin(companies, eq(contracts.cateringCompanyId, companies.id))
      .where(
        and(
          inArray(serviceDays.contractId, contractIds),
          gte(serviceDays.serviceDate, startOfMonth),
          lte(serviceDays.serviceDate, endOfMonth),
        ),
      );

    // Query service days for previous month
    const previousMonthServices = await this.db
      .select({
        expectedQuantity: serviceDays.expectedQuantity,
        servedQuantity: serviceDays.servedQuantity,
        status: serviceDays.status,
        pricePerService: contracts.pricePerService,
      })
      .from(serviceDays)
      .innerJoin(contracts, eq(serviceDays.contractId, contracts.id))
      .where(
        and(
          inArray(serviceDays.contractId, contractIds),
          gte(serviceDays.serviceDate, startOfPreviousMonth),
          lte(serviceDays.serviceDate, endOfPreviousMonth),
        ),
      );

    // Query upcoming services (next 7 days)
    const upcomingServices = await this.db
      .select({
        expectedQuantity: serviceDays.expectedQuantity,
        pricePerService: contracts.pricePerService,
      })
      .from(serviceDays)
      .innerJoin(contracts, eq(serviceDays.contractId, contracts.id))
      .where(
        and(
          inArray(serviceDays.contractId, contractIds),
          gte(serviceDays.serviceDate, now),
          lte(serviceDays.serviceDate, sevenDaysFromNow),
        ),
      );

    // Calculate budget metrics
    let consumed = 0;
    let estimated = 0;
    let previousMonth = 0;
    let totalServedCurrent = 0;
    let totalExpectedCurrent = 0;
    let totalServedPrevious = 0;
    let totalExpectedPrevious = 0;
    let costSumCurrent = 0;
    let personCountCurrent = 0;
    let costSumPrevious = 0;
    let personCountPrevious = 0;

    // Current month calculations
    for (const service of currentMonthServices) {
      const price = Number(service.pricePerService);

      // Consumed: CONFIRMED with servedQuantity
      if (service.status === 'CONFIRMED' && service.servedQuantity !== null) {
        const cost = service.servedQuantity * price;
        consumed += cost;
        totalServedCurrent += service.servedQuantity;
        costSumCurrent += cost;
        personCountCurrent += service.servedQuantity;
      }

      // Estimated: All services with expectedQuantity
      if (service.expectedQuantity !== null) {
        estimated += service.expectedQuantity * price;
        totalExpectedCurrent += service.expectedQuantity;
      }
    }

    // Previous month calculations
    for (const service of previousMonthServices) {
      const price = Number(service.pricePerService);

      if (service.status === 'CONFIRMED' && service.servedQuantity !== null) {
        const cost = service.servedQuantity * price;
        previousMonth += cost;
        costSumPrevious += cost;
        personCountPrevious += service.servedQuantity;
        totalServedPrevious += service.servedQuantity;
      }

      if (service.expectedQuantity !== null) {
        totalExpectedPrevious += service.expectedQuantity;
      }
    }

    // Projected end of month (linear projection)
    const daysInMonth = endOfMonth.getDate();
    const daysPassed = now.getDate();
    const projectedEndOfMonth =
      daysPassed > 0 ? (consumed / daysPassed) * daysInMonth : consumed;

    // KPIs
    const costPerPersonCurrent =
      personCountCurrent > 0 ? costSumCurrent / personCountCurrent : 0;
    const costPerPersonPrevious =
      personCountPrevious > 0 ? costSumPrevious / personCountPrevious : 0;
    const costPerPersonChange =
      costPerPersonPrevious > 0
        ? ((costPerPersonCurrent - costPerPersonPrevious) /
            costPerPersonPrevious) *
          100
        : 0;

    const utilizationRateCurrent =
      totalExpectedCurrent > 0
        ? (totalServedCurrent / totalExpectedCurrent) * 100
        : 0;
    const utilizationRatePrevious =
      totalExpectedPrevious > 0
        ? (totalServedPrevious / totalExpectedPrevious) * 100
        : 0;
    const utilizationRateChange =
      utilizationRatePrevious > 0
        ? utilizationRateCurrent - utilizationRatePrevious
        : 0;

    // Contracts with deviation (>10%)
    const contractDeviations = new Map<
      string,
      { expected: number; served: number }
    >();
    for (const service of currentMonthServices) {
      if (service.expectedQuantity && service.servedQuantity) {
        const existing = contractDeviations.get(service.contractId) || {
          expected: 0,
          served: 0,
        };
        existing.expected += service.expectedQuantity;
        existing.served += service.servedQuantity;
        contractDeviations.set(service.contractId, existing);
      }
    }

    let contractsWithDeviation = 0;
    for (const [, deviation] of contractDeviations) {
      const deviationPercent =
        Math.abs(deviation.served - deviation.expected) / deviation.expected;
      if (deviationPercent > 0.1) {
        contractsWithDeviation++;
      }
    }

    // Upcoming services (next 7 days)
    let upcomingCount = 0;
    let upcomingCost = 0;
    for (const service of upcomingServices) {
      if (service.expectedQuantity !== null) {
        upcomingCount++;
        upcomingCost +=
          service.expectedQuantity * Number(service.pricePerService);
      }
    }

    // Recent services (last 10)
    const recentServices = currentMonthServices
      .filter((s) => s.serviceDate <= now)
      .sort((a, b) => b.serviceDate.getTime() - a.serviceDate.getTime())
      .slice(0, 10)
      .map((service) => {
        const price = Number(service.pricePerService);
        const expected = service.expectedQuantity;
        const actual = service.servedQuantity;
        const deviation =
          expected !== null && actual !== null ? actual - expected : null;
        const cost = actual !== null ? actual * price : null;

        return {
          id: service.id,
          date: service.serviceDate.toISOString().split('T')[0],
          contractId: service.contractId,
          cateringCompanyName: service.cateringName,
          clientCompanyName: service.clientName,
          expected,
          actual,
          deviation,
          cost,
          status: service.status,
        };
      });

    return {
      budget: {
        consumed: Math.round(consumed),
        estimated: Math.round(estimated),
        projectedEndOfMonth: Math.round(projectedEndOfMonth),
        previousMonth: Math.round(previousMonth),
      },
      kpis: {
        costPerPerson: {
          current: Math.round(costPerPersonCurrent),
          previousMonth: Math.round(costPerPersonPrevious),
          change: Math.round(costPerPersonChange * 10) / 10,
        },
        utilizationRate: {
          current: Math.round(utilizationRateCurrent),
          previousMonth: Math.round(utilizationRatePrevious),
          change: Math.round(utilizationRateChange * 10) / 10,
        },
        contractsWithDeviation,
        upcomingServicesWeek: {
          count: upcomingCount,
          estimatedCost: Math.round(upcomingCost),
        },
      },
      recentServices,
    };
  }
}
