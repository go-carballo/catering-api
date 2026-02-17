import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';
import type { DrizzleClient } from '../../../shared/infrastructure/database/drizzle.client';
import { users } from '../../../shared/infrastructure/database/schema';
import {
  UserEntity,
  type User,
  type CreateUserInput,
  type UpdateUserInput,
} from '../domain/user.entity';
import { NotAuthorizedError } from '../../../shared/domain/errors';

@Injectable()
export class UserService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleClient) {}

  async findAllByCompany(companyId: string): Promise<User[]> {
    return this.db.select().from(users).where(eq(users.companyId, companyId));
  }

  async findOne(id: string, companyId: string): Promise<User> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException(`User #${id} not found`);
    }

    const entity = UserEntity.fromData(result[0]);

    try {
      entity.ensureBelongsTo(companyId);
    } catch (error) {
      if (error instanceof NotAuthorizedError) {
        throw new ForbiddenException(error.message);
      }
      throw error;
    }

    return entity.toData();
  }

  async create(companyId: string, input: CreateUserInput): Promise<User> {
    const [result] = await this.db
      .insert(users)
      .values({
        companyId,
        email: input.email,
        name: input.name,
        role: input.role,
      })
      .returning();

    return result;
  }

  async update(
    id: string,
    companyId: string,
    input: UpdateUserInput,
  ): Promise<User> {
    // Verify user exists and belongs to the company
    await this.findOne(id, companyId);

    const [result] = await this.db
      .update(users)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return result;
  }

  async delete(id: string, companyId: string): Promise<void> {
    // Verify user exists and belongs to the company
    await this.findOne(id, companyId);

    await this.db.delete(users).where(eq(users.id, id));
  }
}
