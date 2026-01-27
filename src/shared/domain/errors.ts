/**
 * Base class for domain errors.
 * Domain errors represent business rule violations.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// ============ CONTRACT ERRORS ============

export class ContractNotActiveError extends DomainError {
  readonly code = 'CONTRACT_NOT_ACTIVE';

  constructor(public readonly status: string) {
    super(`Contract is ${status}, only ACTIVE contracts allow this operation`);
  }
}

// ============ SERVICE DAY ERRORS ============

export class ServiceDayAlreadyConfirmedError extends DomainError {
  readonly code = 'ALREADY_CONFIRMED';

  constructor(message: string = 'ServiceDay is already confirmed') {
    super(message);
  }
}

export class ExpectedQuantityAlreadyConfirmedError extends DomainError {
  readonly code = 'ALREADY_CONFIRMED';

  constructor() {
    super('Expected quantity has already been confirmed and cannot be changed');
  }
}

export class NoticePeriodExceededError extends DomainError {
  readonly code = 'NOTICE_PERIOD_EXCEEDED';

  constructor(
    public readonly deadline: Date,
    public readonly noticePeriodHours: number,
  ) {
    super(
      `Notice period of ${noticePeriodHours} hours has passed. Deadline was ${deadline.toISOString()}`,
    );
  }
}

export class QuantityOutOfRangeError extends DomainError {
  readonly code = 'QUANTITY_OUT_OF_RANGE';

  constructor(
    public readonly min: number,
    public readonly max: number,
  ) {
    super(`Quantity must be between ${min} and ${max}`);
  }
}

export class InvalidServedQuantityError extends DomainError {
  readonly code = 'INVALID_QUANTITY';

  constructor() {
    super('Served quantity cannot be negative');
  }
}

// ============ AUTHORIZATION ERRORS ============

export class NotAuthorizedError extends DomainError {
  readonly code = 'NOT_AUTHORIZED';

  constructor(message: string) {
    super(message);
  }
}
