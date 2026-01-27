import { Injectable, Inject } from '@nestjs/common';
import type { ServiceDayRepository } from '../../domain/service-day.repository';
import { SERVICE_DAY_REPOSITORY } from '../../domain/service-day.repository';
import type { ServiceDay } from '../../domain/service-day.entity';
import type { Clock } from '../../../../shared/domain/clock.port';
import { CLOCK } from '../../../../shared/domain/clock.port';
import {
  ContractNotActiveError,
  NotAuthorizedError,
  ServiceDayAlreadyConfirmedError,
  InvalidServedQuantityError,
} from '../../../../shared/domain/errors';

/**
 * Input DTO for the use case
 */
export interface ConfirmServedQuantityInput {
  serviceDayId: string;
  servedQuantity: number;
  companyId: string;
}

/**
 * Result type using discriminated union for explicit error handling
 */
export type ConfirmServedQuantityResult =
  | { success: true; serviceDay: ServiceDay }
  | { success: false; error: ConfirmServedQuantityError };

export type ConfirmServedQuantityError =
  | { code: 'SERVICE_DAY_NOT_FOUND'; message: string }
  | { code: 'CONTRACT_NOT_ACTIVE'; message: string }
  | { code: 'NOT_AUTHORIZED'; message: string }
  | { code: 'ALREADY_CONFIRMED'; message: string }
  | { code: 'INVALID_QUANTITY'; message: string };

/**
 * ConfirmServedQuantity Use Case
 *
 * Allows a CATERING company to confirm the served quantity for a service day.
 *
 * This use case ORCHESTRATES the operation:
 * 1. Load aggregates
 * 2. Execute domain rules (on entities)
 * 3. Persist changes
 *
 * Business Rules (enforced by domain entities):
 * - Contract must be ACTIVE (ContractEntity.ensureActive)
 * - Only the catering company can confirm (ContractEntity.ensureCateringAuthorized)
 * - Cannot confirm if status is CONFIRMED (ServiceDayEntity.ensureNotConfirmed)
 * - Served quantity must be >= 0
 */
@Injectable()
export class ConfirmServedQuantityUseCase {
  constructor(
    @Inject(SERVICE_DAY_REPOSITORY)
    private readonly repository: ServiceDayRepository,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async execute(
    input: ConfirmServedQuantityInput,
  ): Promise<ConfirmServedQuantityResult> {
    const now = this.clock.now();

    // 1. Load aggregates
    const data = await this.repository.findByIdWithContract(input.serviceDayId);

    if (!data) {
      return {
        success: false,
        error: {
          code: 'SERVICE_DAY_NOT_FOUND',
          message: `Service day with id ${input.serviceDayId} not found`,
        },
      };
    }

    const { serviceDay, contract } = data;

    // 2. Execute domain rules (entities throw on violation)
    try {
      contract.ensureActive();
      contract.ensureCateringAuthorized(input.companyId);
      serviceDay.confirmServed(input.servedQuantity, now);
    } catch (error) {
      return this.mapDomainError(error);
    }

    // 3. Persist changes
    const updatedServiceDay = await this.repository.save(serviceDay);

    return {
      success: true,
      serviceDay: updatedServiceDay,
    };
  }

  private mapDomainError(error: unknown): {
    success: false;
    error: ConfirmServedQuantityError;
  } {
    if (error instanceof ContractNotActiveError) {
      return {
        success: false,
        error: {
          code: 'CONTRACT_NOT_ACTIVE',
          message: error.message,
        },
      };
    }

    if (error instanceof NotAuthorizedError) {
      return {
        success: false,
        error: {
          code: 'NOT_AUTHORIZED',
          message: 'Only the catering company can confirm served quantity',
        },
      };
    }

    if (error instanceof ServiceDayAlreadyConfirmedError) {
      return {
        success: false,
        error: {
          code: 'ALREADY_CONFIRMED',
          message: error.message,
        },
      };
    }

    if (error instanceof InvalidServedQuantityError) {
      return {
        success: false,
        error: {
          code: 'INVALID_QUANTITY',
          message: error.message,
        },
      };
    }

    // Unknown error - rethrow
    throw error;
  }
}
