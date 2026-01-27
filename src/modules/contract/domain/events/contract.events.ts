import { BaseDomainEvent } from '../../../../shared/events';

// ============ Event Payload Types ============

export interface ContractCreatedPayload {
  contractId: string;
  cateringCompanyId: string;
  clientCompanyId: string;
  startDate: string;
  endDate: string | null;
  pricePerService: number;
  minDailyQuantity: number;
  maxDailyQuantity: number;
  serviceDays: number[];
}

export interface ContractStatusChangedPayload {
  contractId: string;
  previousStatus: string;
  newStatus: string;
  changedAt: string;
}

export interface ContractTerminatedPayload {
  contractId: string;
  cateringCompanyId: string;
  clientCompanyId: string;
  terminatedAt: string;
}

// ============ Event Classes ============

export class ContractCreatedEvent extends BaseDomainEvent<ContractCreatedPayload> {
  readonly eventType = 'contract.created';
  readonly aggregateType = 'Contract';

  constructor(
    contractId: string,
    payload: ContractCreatedPayload,
    correlationId?: string,
  ) {
    super(contractId, payload, correlationId);
  }
}

export class ContractPausedEvent extends BaseDomainEvent<ContractStatusChangedPayload> {
  readonly eventType = 'contract.paused';
  readonly aggregateType = 'Contract';

  constructor(
    contractId: string,
    payload: ContractStatusChangedPayload,
    correlationId?: string,
  ) {
    super(contractId, payload, correlationId);
  }
}

export class ContractResumedEvent extends BaseDomainEvent<ContractStatusChangedPayload> {
  readonly eventType = 'contract.resumed';
  readonly aggregateType = 'Contract';

  constructor(
    contractId: string,
    payload: ContractStatusChangedPayload,
    correlationId?: string,
  ) {
    super(contractId, payload, correlationId);
  }
}

export class ContractTerminatedEvent extends BaseDomainEvent<ContractTerminatedPayload> {
  readonly eventType = 'contract.terminated';
  readonly aggregateType = 'Contract';

  constructor(
    contractId: string,
    payload: ContractTerminatedPayload,
    correlationId?: string,
  ) {
    super(contractId, payload, correlationId);
  }
}
