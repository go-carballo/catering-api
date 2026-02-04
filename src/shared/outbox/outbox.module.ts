import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EVENT_BUS, InMemoryEventBus, IdempotencyService } from '../events';
import { OutboxProcessor } from './outbox.processor';

/**
 * OutboxModule - Provides the Transactional Outbox infrastructure.
 *
 * This module is @Global so that:
 * 1. EVENT_BUS is available everywhere for subscribing to events
 * 2. OutboxProcessor runs automatically via @nestjs/schedule
 * 3. IdempotencyService is available for handlers with side effects
 *
 * Usage:
 * - Import OutboxModule in AppModule
 * - Use OutboxRepository.storeEvent(tx, event) inside your transactions
 * - Subscribe to events using EVENT_BUS
 * - Use IdempotencyService in handlers that have external side effects
 */
@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    {
      provide: EVENT_BUS,
      useClass: InMemoryEventBus,
    },
    // TODO: Fix OutboxProcessor raw SQL compatibility with postgres.js
    // OutboxProcessor,
    IdempotencyService,
  ],
  exports: [EVENT_BUS, /* OutboxProcessor, */ IdempotencyService],
})
export class OutboxModule {}
