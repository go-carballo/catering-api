import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ContractService } from '../../contract/application/contract.service';
import { ServiceDayService } from './service-day.service';
import { ApplyExpectedFallbackUseCase } from './use-cases';
import {
  todayUTC,
  addDays,
  formatISODate,
} from '../../../shared/domain/date.utils';
import {
  withAdvisoryLock,
  LOCK_IDS,
} from '../../../shared/domain/advisory-lock';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';
import type { DrizzleClient } from '../../../shared/infrastructure/database/drizzle.client';

/**
 * Metrics emitted by the scheduler jobs.
 * These can be picked up by log aggregators (Datadog, CloudWatch, etc.)
 * or exported to Prometheus/StatsD.
 */
interface GenerationMetrics {
  job: 'generate_service_days';
  activeContracts: number;
  serviceDaysInserted: number;
  contractsWithErrors: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  durationMs: number;
  lockAcquired: boolean;
}

interface FallbackMetrics {
  job: 'apply_fallback';
  processedCount: number;
  appliedCount: number;
  skippedCount: number;
  errorCount: number;
  durationMs: number;
  lockAcquired: boolean;
}

@Injectable()
export class ServiceDayScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ServiceDayScheduler.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
    private readonly contractService: ContractService,
    private readonly serviceDayService: ServiceDayService,
    private readonly applyExpectedFallbackUseCase: ApplyExpectedFallbackUseCase,
  ) {}

  /**
   * Runs every day at midnight.
   * Generates ServiceDays for the next 7 days for all ACTIVE contracts.
   *
   * Why 7 days? Provides a rolling week of service days:
   * - Sufficient for weekly planning
   * - Notice period validation (usually 24-48h)
   * - Client to confirm quantities in advance
   *
   * Uses advisory lock to prevent duplicate work across multiple instances.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateUpcomingServiceDays() {
    const startTime = Date.now();
    this.logger.log('Starting scheduled ServiceDay generation...');

    // Use UTC dates to avoid timezone issues
    const today = todayUTC();
    const oneWeekFromNow = addDays(today, 7);

    const lockResult = await withAdvisoryLock(
      this.db,
      LOCK_IDS.GENERATE_SERVICE_DAYS,
      async () => {
        const activeContracts =
          await this.contractService.findActiveContracts();
        this.logger.log(`Found ${activeContracts.length} active contracts`);

        let totalGenerated = 0;
        let contractsWithErrors = 0;

        for (const contract of activeContracts) {
          try {
            const generated = await this.serviceDayService.generateForContract(
              contract.id,
              today,
              oneWeekFromNow,
            );

            if (generated.length > 0) {
              this.logger.log(
                `Generated ${generated.length} service days for contract ${contract.id}`,
              );
              totalGenerated += generated.length;
            }
          } catch (error) {
            contractsWithErrors++;
            this.logger.error(
              `Failed to generate service days for contract ${contract.id}`,
              error instanceof Error ? error.stack : error,
            );
          }
        }

        return {
          activeContracts: activeContracts.length,
          totalGenerated,
          contractsWithErrors,
        };
      },
    );

    const durationMs = Date.now() - startTime;

    // Emit structured metrics for observability
    const metrics: GenerationMetrics = {
      job: 'generate_service_days',
      activeContracts: lockResult.acquired
        ? lockResult.result.activeContracts
        : 0,
      serviceDaysInserted: lockResult.acquired
        ? lockResult.result.totalGenerated
        : 0,
      contractsWithErrors: lockResult.acquired
        ? lockResult.result.contractsWithErrors
        : 0,
      dateRangeStart: formatISODate(today),
      dateRangeEnd: formatISODate(oneWeekFromNow),
      durationMs,
      lockAcquired: lockResult.acquired,
    };

    if (!lockResult.acquired) {
      this.logger.log({
        message: 'ServiceDay generation skipped - another instance is running',
        ...metrics,
      });
      return;
    }

    this.logger.log({
      message: `ServiceDay generation complete`,
      ...metrics,
    });
  }

  /**
   * Optional: Run on startup to ensure we have service days generated.
   * Useful when the server was down during midnight.
   */
  async onApplicationBootstrap() {
    this.logger.log('Running initial ServiceDay generation on startup...');
    await this.generateUpcomingServiceDays();
  }

  /**
   * Runs every hour to apply fallback quantity to unconfirmed service days.
   *
   * Why hourly?
   * - Notice periods are typically 24-48 hours
   * - Running hourly ensures fallback is applied promptly after deadline
   * - Not too aggressive (every minute) but not too slow (daily)
   *
   * Business Rule:
   * When a ServiceDay's notice period deadline passes without the client
   * confirming expectedQuantity, automatically set it to minDailyQuantity.
   *
   * Uses advisory lock to prevent duplicate work across multiple instances.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async applyFallbackForUnconfirmed() {
    const startTime = Date.now();
    this.logger.log('Starting fallback job for unconfirmed service days...');

    const lockResult = await withAdvisoryLock(
      this.db,
      LOCK_IDS.APPLY_FALLBACK,
      async () => {
        return await this.applyExpectedFallbackUseCase.execute();
      },
    );

    const durationMs = Date.now() - startTime;

    // Emit structured metrics for observability
    const metrics: FallbackMetrics = {
      job: 'apply_fallback',
      processedCount: lockResult.acquired
        ? lockResult.result.processedCount
        : 0,
      appliedCount: lockResult.acquired ? lockResult.result.appliedCount : 0,
      skippedCount: lockResult.acquired ? lockResult.result.skippedCount : 0,
      errorCount: lockResult.acquired ? lockResult.result.errors.length : 0,
      durationMs,
      lockAcquired: lockResult.acquired,
    };

    if (!lockResult.acquired) {
      this.logger.log({
        message: 'Fallback job skipped - another instance is running',
        ...metrics,
      });
      return;
    }

    const result = lockResult.result;
    if (result.appliedCount > 0) {
      this.logger.log({
        message: `Fallback job complete: Applied fallback to ${result.appliedCount} service days`,
        ...metrics,
      });
    } else {
      this.logger.debug({
        message: 'Fallback job complete: No service days needed fallback',
        ...metrics,
      });
    }

    if (result.errors.length > 0) {
      this.logger.warn({
        message: `Fallback job had ${result.errors.length} errors`,
        ...metrics,
        errors: result.errors,
      });
    }
  }
}
