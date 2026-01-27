import { Module, forwardRef } from '@nestjs/common';
import { ServiceDayController } from './infrastructure/service-day.controller';
import { ServiceDayService } from './application/service-day.service';
import { ServiceDayScheduler } from './application/service-day.scheduler';
import { ContractModule } from '../contract/contract.module';

// Use Cases
import {
  ConfirmExpectedQuantityUseCase,
  ConfirmServedQuantityUseCase,
  ApplyExpectedFallbackUseCase,
} from './application/use-cases';

// Repository
import { SERVICE_DAY_REPOSITORY } from './domain/service-day.repository';
import { DrizzleServiceDayRepository } from './infrastructure/drizzle-service-day.repository';

// Clock
import { CLOCK } from '../../shared/domain/clock.port';
import { SystemClock } from '../../shared/infrastructure/system-clock';

@Module({
  imports: [forwardRef(() => ContractModule)],
  controllers: [ServiceDayController],
  providers: [
    // Legacy service (to be migrated incrementally)
    ServiceDayService,
    ServiceDayScheduler,

    // Clock (infrastructure adapter)
    {
      provide: CLOCK,
      useClass: SystemClock,
    },

    // Repository (infrastructure adapter)
    {
      provide: SERVICE_DAY_REPOSITORY,
      useClass: DrizzleServiceDayRepository,
    },

    // Use Cases
    ConfirmExpectedQuantityUseCase,
    ConfirmServedQuantityUseCase,
    ApplyExpectedFallbackUseCase,
  ],
  exports: [ServiceDayService],
})
export class ServiceDayModule {}
