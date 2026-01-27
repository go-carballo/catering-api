import { Injectable, Inject, Logger } from '@nestjs/common';
import type { ServiceDayRepository } from '../../domain/service-day.repository';
import { SERVICE_DAY_REPOSITORY } from '../../domain/service-day.repository';
import type { Clock } from '../../../../shared/domain/clock.port';
import { CLOCK } from '../../../../shared/domain/clock.port';

/**
 * Result of applying fallback to a single service day
 */
export interface FallbackAppliedResult {
  serviceDayId: string;
  contractId: string;
  serviceDate: Date;
  appliedQuantity: number;
}

/**
 * Result of the batch fallback operation
 */
export interface ApplyExpectedFallbackResult {
  processedCount: number;
  appliedCount: number;
  skippedCount: number;
  applied: FallbackAppliedResult[];
  errors: Array<{ serviceDayId: string; error: string }>;
}

/**
 * ApplyExpectedFallback Use Case
 *
 * System operation that runs periodically to apply fallback quantity
 * to service days where the client didn't confirm in time.
 *
 * Business Rule:
 * - If a ServiceDay reaches its notice period deadline without
 *   an expectedQuantity, automatically set it to the contract's
 *   minDailyQuantity.
 *
 * Why this matters:
 * - Ensures the catering company always knows how much to prepare
 * - Client pays at least the minimum if they don't confirm
 * - Prevents operational chaos from unconfirmed orders
 */
@Injectable()
export class ApplyExpectedFallbackUseCase {
  private readonly logger = new Logger(ApplyExpectedFallbackUseCase.name);

  constructor(
    @Inject(SERVICE_DAY_REPOSITORY)
    private readonly repository: ServiceDayRepository,
    @Inject(CLOCK)
    private readonly clock: Clock,
  ) {}

  /**
   * Find all service days past their deadline without expected quantity
   * and apply the fallback (min_daily_quantity).
   */
  async execute(): Promise<ApplyExpectedFallbackResult> {
    const now = this.clock.now();

    const result: ApplyExpectedFallbackResult = {
      processedCount: 0,
      appliedCount: 0,
      skippedCount: 0,
      applied: [],
      errors: [],
    };

    // Find all eligible service days (past deadline, no expected quantity, PENDING status)
    const eligibleServiceDays =
      await this.repository.findEligibleForFallback(now);

    result.processedCount = eligibleServiceDays.length;

    if (eligibleServiceDays.length === 0) {
      this.logger.debug('No service days eligible for fallback');
      return result;
    }

    this.logger.log(
      `Found ${eligibleServiceDays.length} service days eligible for fallback`,
    );

    // Process each eligible service day
    for (const { serviceDay, contract } of eligibleServiceDays) {
      try {
        // Apply fallback using domain method
        const applied = serviceDay.applyFallback(
          contract.minDailyQuantity,
          now,
        );

        if (applied) {
          // Persist the change
          await this.repository.save(serviceDay);

          result.appliedCount++;
          result.applied.push({
            serviceDayId: serviceDay.id,
            contractId: serviceDay.contractId,
            serviceDate: serviceDay.serviceDate,
            appliedQuantity: contract.minDailyQuantity,
          });

          this.logger.debug(
            `Applied fallback to service day ${serviceDay.id}: ` +
              `quantity=${contract.minDailyQuantity}`,
          );
        } else {
          // Entity decided not to apply (shouldn't happen if query is correct)
          result.skippedCount++;
          this.logger.warn(
            `Service day ${serviceDay.id} was not eligible for fallback ` +
              `(entity rejected)`,
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result.errors.push({
          serviceDayId: serviceDay.id,
          error: errorMessage,
        });
        this.logger.error(
          `Failed to apply fallback to service day ${serviceDay.id}: ${errorMessage}`,
        );
      }
    }

    this.logger.log(
      `Fallback complete: ${result.appliedCount} applied, ` +
        `${result.skippedCount} skipped, ${result.errors.length} errors`,
    );

    return result;
  }
}
