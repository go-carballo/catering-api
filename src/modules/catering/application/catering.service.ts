import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';
import type { DrizzleClient } from '../../../shared/infrastructure/database/drizzle.client';
import {
  companies,
  cateringProfiles,
} from '../../../shared/infrastructure/database/schema';
import { CreateCateringDto } from './dto/create-catering.dto';
import { UpdateCateringDto } from './dto/update-catering.dto';

// Response type without sensitive fields
export interface CateringWithProfile {
  id: string;
  companyType: 'CATERING' | 'CLIENT';
  name: string;
  email: string;
  taxId: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
  dailyCapacity: number;
}

@Injectable()
export class CateringService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleClient) {}

  async findAll(): Promise<CateringWithProfile[]> {
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
        dailyCapacity: cateringProfiles.dailyCapacity,
      })
      .from(companies)
      .innerJoin(cateringProfiles, eq(companies.id, cateringProfiles.companyId))
      .where(eq(companies.companyType, 'CATERING'));

    return results;
  }

  async findOne(id: string): Promise<CateringWithProfile> {
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
        dailyCapacity: cateringProfiles.dailyCapacity,
      })
      .from(companies)
      .innerJoin(cateringProfiles, eq(companies.id, cateringProfiles.companyId))
      .where(eq(companies.id, id))
      .limit(1);

    if (results.length === 0) {
      throw new NotFoundException(`Catering company #${id} not found`);
    }

    return results[0];
  }

  async create(dto: CreateCateringDto): Promise<CateringWithProfile> {
    // Hash the password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Use transaction to insert both company and profile
    const result = await this.db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companies)
        .values({
          companyType: 'CATERING',
          name: dto.name,
          email: dto.email,
          passwordHash,
          taxId: dto.taxId ?? null,
          status: 'ACTIVE',
        })
        .returning();

      await tx.insert(cateringProfiles).values({
        companyId: company.id,
        dailyCapacity: dto.dailyCapacity,
      });

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
        dailyCapacity: dto.dailyCapacity,
      };
    });

    return result;
  }

  async update(
    id: string,
    dto: UpdateCateringDto,
  ): Promise<CateringWithProfile> {
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
      if (dto.dailyCapacity !== undefined) {
        await tx
          .update(cateringProfiles)
          .set({ dailyCapacity: dto.dailyCapacity })
          .where(eq(cateringProfiles.companyId, id));
      }
    });

    return this.findOne(id);
  }

  async softDelete(id: string): Promise<CateringWithProfile> {
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
