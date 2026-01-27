import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';
import type { DrizzleClient } from '../../../shared/infrastructure/database/drizzle.client';
import {
  companies,
  clientProfiles,
  clientOfficeDays,
} from '../../../shared/infrastructure/database/schema';
import { CreateClientDto, DayOfWeek, WorkMode } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

// Response type without sensitive fields
export interface ClientWithProfile {
  id: string;
  companyType: 'CATERING' | 'CLIENT';
  name: string;
  email: string;
  taxId: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
  workMode: WorkMode;
  officeDays: DayOfWeek[];
}

@Injectable()
export class ClientService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleClient) {}

  async findAll(): Promise<ClientWithProfile[]> {
    const results = await this.db
      .select({
        id: companies.id,
        companyType: companies.companyType,
        name: companies.name,
        email: companies.email,
        taxId: companies.taxId,
        status: companies.status,
        createdAt: companies.createdAt,
        updatedAt: companies.updatedAt,
        workMode: clientProfiles.workMode,
      })
      .from(companies)
      .innerJoin(clientProfiles, eq(companies.id, clientProfiles.companyId))
      .where(eq(companies.companyType, 'CLIENT'));

    // Get office days for each client
    const clientsWithDays = await Promise.all(
      results.map(async (client) => {
        const days = await this.db
          .select({ dow: clientOfficeDays.dow })
          .from(clientOfficeDays)
          .where(eq(clientOfficeDays.clientCompanyId, client.id));

        return {
          ...client,
          workMode: client.workMode as WorkMode,
          officeDays: days.map((d) => d.dow as DayOfWeek),
        };
      }),
    );

    return clientsWithDays;
  }

  async findOne(id: string): Promise<ClientWithProfile> {
    const results = await this.db
      .select({
        id: companies.id,
        companyType: companies.companyType,
        name: companies.name,
        email: companies.email,
        taxId: companies.taxId,
        status: companies.status,
        createdAt: companies.createdAt,
        updatedAt: companies.updatedAt,
        workMode: clientProfiles.workMode,
      })
      .from(companies)
      .innerJoin(clientProfiles, eq(companies.id, clientProfiles.companyId))
      .where(eq(companies.id, id))
      .limit(1);

    if (results.length === 0) {
      throw new NotFoundException(`Client company #${id} not found`);
    }

    const client = results[0];

    const days = await this.db
      .select({ dow: clientOfficeDays.dow })
      .from(clientOfficeDays)
      .where(eq(clientOfficeDays.clientCompanyId, id));

    return {
      ...client,
      workMode: client.workMode as WorkMode,
      officeDays: days.map((d) => d.dow as DayOfWeek),
    };
  }

  async create(dto: CreateClientDto): Promise<ClientWithProfile> {
    // Hash the password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const result = await this.db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companies)
        .values({
          companyType: 'CLIENT',
          name: dto.name,
          email: dto.email,
          passwordHash,
          taxId: dto.taxId ?? null,
          status: 'ACTIVE',
        })
        .returning();

      await tx.insert(clientProfiles).values({
        companyId: company.id,
        workMode: dto.workMode,
      });

      // Insert office days
      if (dto.officeDays.length > 0) {
        await tx.insert(clientOfficeDays).values(
          dto.officeDays.map((dow) => ({
            clientCompanyId: company.id,
            dow,
          })),
        );
      }

      // Return without passwordHash
      return {
        id: company.id,
        companyType: company.companyType,
        name: company.name,
        email: company.email,
        taxId: company.taxId,
        status: company.status,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
        workMode: dto.workMode,
        officeDays: dto.officeDays,
      };
    });

    return result;
  }

  async update(id: string, dto: UpdateClientDto): Promise<ClientWithProfile> {
    // First verify it exists
    await this.findOne(id);

    const now = new Date();

    await this.db.transaction(async (tx) => {
      // Update company fields if provided
      const companyUpdates: Record<string, unknown> = { updatedAt: now };
      if (dto.name !== undefined) companyUpdates.name = dto.name;
      if (dto.taxId !== undefined) companyUpdates.taxId = dto.taxId;
      if (dto.status !== undefined) companyUpdates.status = dto.status;

      if (Object.keys(companyUpdates).length > 1) {
        await tx
          .update(companies)
          .set(companyUpdates)
          .where(eq(companies.id, id));
      }

      // Update profile fields if provided
      if (dto.workMode !== undefined) {
        await tx
          .update(clientProfiles)
          .set({ workMode: dto.workMode })
          .where(eq(clientProfiles.companyId, id));
      }

      // Update office days if provided
      if (dto.officeDays !== undefined) {
        // Delete existing and insert new
        await tx
          .delete(clientOfficeDays)
          .where(eq(clientOfficeDays.clientCompanyId, id));

        if (dto.officeDays.length > 0) {
          await tx.insert(clientOfficeDays).values(
            dto.officeDays.map((dow) => ({
              clientCompanyId: id,
              dow,
            })),
          );
        }
      }
    });

    return this.findOne(id);
  }

  async softDelete(id: string): Promise<ClientWithProfile> {
    // First verify it exists
    await this.findOne(id);

    const now = new Date();

    await this.db
      .update(companies)
      .set({ status: 'INACTIVE', updatedAt: now })
      .where(eq(companies.id, id));

    return this.findOne(id);
  }
}
