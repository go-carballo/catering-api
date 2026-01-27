import { Injectable, Inject } from '@nestjs/common';
import type { ServiceDayRepository } from '../../domain/service-day.repository';
import { SERVICE_DAY_REPOSITORY } from '../../domain/service-day.repository';
import type { ServiceDay } from '../../domain/service-day.entity';
import type { Clock } from '../../../../shared/domain/clock.port';
import { CLOCK } from '../../../../shared/domain/clock.port';
import {
  DomainError,
  ContractNotActiveError,
  NotAuthorizedError,
  ServiceDayAlreadyConfirmedError,
  ExpectedQuantityAlreadyConfirmedError,
  NoticePeriodExceededError,
  QuantityOutOfRangeError,
} from '../../../../shared/domain/errors';

/**
 * Input DTO for the use case
 */
export interface ConfirmExpectedQuantityInput {
  serviceDayId: string;
  expectedQuantity: number;
  companyId: string;
}

/**
 * Result type using discriminated union for explicit error handling
 */
export type ConfirmExpectedQuantityResult =
  | { success: true; serviceDay: ServiceDay }
  | { success: false; error: ConfirmExpectedQuantityError };

export type ConfirmExpectedQuantityError =
  | { code: 'SERVICE_DAY_NOT_FOUND'; message: string }
  | { code: 'CONTRACT_NOT_ACTIVE'; message: string }
  | { code: 'NOT_AUTHORIZED'; message: string }
  | { code: 'ALREADY_CONFIRMED'; message: string }
  | { code: 'NOTICE_PERIOD_EXCEEDED'; message: string; deadline: Date }
  | {
      code: 'QUANTITY_OUT_OF_RANGE';
      message: string;
      min: number;
      max: number;
    };

/**
 * ConfirmExpectedQuantity Use Case
 *
 * Allows a CLIENT company to confirm the expected quantity for a service day.
 *
 * This use case ORCHESTRATES the operation:
 * 1. Load aggregates
 * 2. Execute domain rules (on entities)
 * 3. Persist changes
 *
 * Business Rules (enforced by domain entities):
 * - Contract must be ACTIVE (ContractEntity.ensureActive)
 * - Only the client company can confirm (ContractEntity.ensureClientAuthorized)
 * - Cannot confirm if already confirmed (ServiceDayEntity.ensureExpectedNotConfirmed)
 * - Must be within notice period (ServiceDayEntity.ensureWithinNoticePeriod)
 * - Quantity must be within range (ServiceDayEntity.ensureQuantityInRange)
 */
@Injectable()
export class ConfirmExpectedQuantityUseCase {
  constructor(
    @Inject(SERVICE_DAY_REPOSITORY)
    private readonly repository: ServiceDayRepository,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  async execute(
    input: ConfirmExpectedQuantityInput,
  ): Promise<ConfirmExpectedQuantityResult> {
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
      contract.ensureClientAuthorized(input.companyId);
      serviceDay.confirmExpected(
        input.expectedQuantity,
        {
          cateringCompanyId: contract.cateringCompanyId,
          clientCompanyId: contract.clientCompanyId,
          minDailyQuantity: contract.minDailyQuantity,
          maxDailyQuantity: contract.maxDailyQuantity,
          noticePeriodHours: contract.noticePeriodHours,
        },
        now,
      );
    } catch (error) {
      return this.mapDomainError(error, contract);
    }

    // 3. Persist changes
    const updatedServiceDay = await this.repository.save(serviceDay);

    return {
      success: true,
      serviceDay: updatedServiceDay,
    };
  }

  private mapDomainError(
    error: unknown,
    contract: { minDailyQuantity: number; maxDailyQuantity: number },
  ): { success: false; error: ConfirmExpectedQuantityError } {
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
          message: 'Only the client company can confirm expected quantity',
        },
      };
    }

    if (
      error instanceof ServiceDayAlreadyConfirmedError ||
      error instanceof ExpectedQuantityAlreadyConfirmedError
    ) {
      return {
        success: false,
        error: {
          code: 'ALREADY_CONFIRMED',
          message: error.message,
        },
      };
    }

    if (error instanceof NoticePeriodExceededError) {
      return {
        success: false,
        error: {
          code: 'NOTICE_PERIOD_EXCEEDED',
          message: error.message,
          deadline: error.deadline,
        },
      };
    }

    if (error instanceof QuantityOutOfRangeError) {
      return {
        success: false,
        error: {
          code: 'QUANTITY_OUT_OF_RANGE',
          message: `Expected quantity must be between ${contract.minDailyQuantity} and ${contract.maxDailyQuantity}`,
          min: contract.minDailyQuantity,
          max: contract.maxDailyQuantity,
        },
      };
    }

    // Unknown error - rethrow
    throw error;
  }
}
