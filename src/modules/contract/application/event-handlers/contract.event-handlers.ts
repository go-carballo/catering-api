import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { EVENT_BUS, IdempotencyService } from '../../../../shared/events';
import type { IEventBus, DomainEvent } from '../../../../shared/events';
import type {
  ContractCreatedPayload,
  ContractStatusChangedPayload,
  ContractTerminatedPayload,
} from '../../domain/events';
import { NOTIFICATION_PORT, ANALYTICS_PORT } from '../../../../shared/ports';
import type { NotificationPort, AnalyticsPort } from '../../../../shared/ports';

/**
 * Handles contract-related domain events.
 *
 * Key design decisions:
 * 1. Depends on PORTS (NotificationPort, AnalyticsPort), not concrete implementations
 * 2. Uses IdempotencyService for handlers with external side effects
 * 3. Gracefully handles missing dependencies (ports are optional)
 *
 * The idempotency pattern ensures that even if an event is delivered multiple times
 * (at-least-once delivery), side effects like emails are only executed once.
 */
@Injectable()
export class ContractEventHandlers implements OnModuleInit {
  private readonly logger = new Logger(ContractEventHandlers.name);

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly idempotency: IdempotencyService,
    @Optional()
    @Inject(NOTIFICATION_PORT)
    private readonly notifications?: NotificationPort,
    @Optional()
    @Inject(ANALYTICS_PORT)
    private readonly analytics?: AnalyticsPort,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe<ContractCreatedPayload>(
      'contract.created',
      this.onContractCreated.bind(this),
    );

    this.eventBus.subscribe<ContractStatusChangedPayload>(
      'contract.paused',
      this.onContractPaused.bind(this),
    );

    this.eventBus.subscribe<ContractStatusChangedPayload>(
      'contract.resumed',
      this.onContractResumed.bind(this),
    );

    this.eventBus.subscribe<ContractTerminatedPayload>(
      'contract.terminated',
      this.onContractTerminated.bind(this),
    );

    this.logger.log('Contract event handlers registered');
  }

  /**
   * Handle contract.created event
   *
   * Uses idempotency to ensure notifications are sent exactly once,
   * even if the event is processed multiple times.
   */
  private async onContractCreated(
    event: DomainEvent<ContractCreatedPayload>,
  ): Promise<void> {
    const { payload } = event;
    const eventId = (event as any).id ?? event.aggregateId; // outbox event ID

    this.logger.log(`📝 New contract created: ${payload.contractId}`);
    this.logger.log(
      `   Catering: ${payload.cateringCompanyId} -> Client: ${payload.clientCompanyId}`,
    );
    this.logger.log(
      `   Price: $${payload.pricePerService}/service | Qty: ${payload.minDailyQuantity}-${payload.maxDailyQuantity}`,
    );

    // Send notifications (idempotent)
    if (this.notifications) {
      await this.idempotency.processOnce(
        eventId,
        'ContractCreated:Notifications',
        async () => {
          // In real implementation, you'd fetch emails from the companies
          await this.notifications!.send({
            channel: 'email',
            to: 'client@example.com', // Would be payload.clientEmail
            template: 'contract-created-client',
            data: { ...payload },
            idempotencyKey: `contract-created-client-${payload.contractId}`,
          });

          await this.notifications!.send({
            channel: 'email',
            to: 'catering@example.com', // Would be payload.cateringEmail
            template: 'contract-created-catering',
            data: { ...payload },
            idempotencyKey: `contract-created-catering-${payload.contractId}`,
          });
        },
      );
    }

    // Track analytics (idempotent)
    if (this.analytics) {
      await this.idempotency.processOnce(
        eventId,
        'ContractCreated:Analytics',
        async () => {
          await this.analytics!.track({
            event: 'contract_created',
            properties: {
              contractId: payload.contractId,
              cateringCompanyId: payload.cateringCompanyId,
              clientCompanyId: payload.clientCompanyId,
              pricePerService: payload.pricePerService,
              serviceDaysCount: payload.serviceDays.length,
            },
          });
        },
      );
    }
  }

  private async onContractPaused(
    event: DomainEvent<ContractStatusChangedPayload>,
  ): Promise<void> {
    const { payload } = event;
    this.logger.warn(
      `⏸️  Contract paused: ${event.aggregateId} (${payload.previousStatus} -> PAUSED)`,
    );

    // Track analytics (no notification needed for pause)
    if (this.analytics) {
      const eventId = (event as any).id ?? event.aggregateId;
      await this.idempotency.processOnce(
        eventId,
        'ContractPaused:Analytics',
        async () => {
          await this.analytics!.track({
            event: 'contract_paused',
            properties: {
              contractId: payload.contractId,
              previousStatus: payload.previousStatus,
            },
          });
        },
      );
    }
  }

  private async onContractResumed(
    event: DomainEvent<ContractStatusChangedPayload>,
  ): Promise<void> {
    this.logger.log(
      `▶️  Contract resumed: ${event.aggregateId} (PAUSED -> ACTIVE)`,
    );

    if (this.analytics) {
      const eventId = (event as any).id ?? event.aggregateId;
      await this.idempotency.processOnce(
        eventId,
        'ContractResumed:Analytics',
        async () => {
          await this.analytics!.track({
            event: 'contract_resumed',
            properties: {
              contractId: event.payload.contractId,
            },
          });
        },
      );
    }
  }

  private async onContractTerminated(
    event: DomainEvent<ContractTerminatedPayload>,
  ): Promise<void> {
    const { payload } = event;
    const eventId = (event as any).id ?? event.aggregateId;

    this.logger.warn(`🛑 Contract terminated: ${payload.contractId}`);

    // Send termination notifications (idempotent)
    if (this.notifications) {
      await this.idempotency.processOnce(
        eventId,
        'ContractTerminated:Notifications',
        async () => {
          await this.notifications!.send({
            channel: 'email',
            to: 'client@example.com',
            template: 'contract-terminated',
            data: { ...payload },
          });

          await this.notifications!.send({
            channel: 'email',
            to: 'catering@example.com',
            template: 'contract-terminated',
            data: { ...payload },
          });
        },
      );
    }

    // Track analytics (idempotent)
    if (this.analytics) {
      await this.idempotency.processOnce(
        eventId,
        'ContractTerminated:Analytics',
        async () => {
          await this.analytics!.track({
            event: 'contract_terminated',
            properties: {
              contractId: payload.contractId,
              cateringCompanyId: payload.cateringCompanyId,
              clientCompanyId: payload.clientCompanyId,
            },
          });
        },
      );
    }
  }
}
