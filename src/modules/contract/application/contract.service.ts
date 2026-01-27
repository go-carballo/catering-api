import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';
import type { DrizzleClient } from '../../../shared/infrastructure/database/drizzle.client';
import {
  contracts,
  contractServiceDays,
  companies,
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
}
