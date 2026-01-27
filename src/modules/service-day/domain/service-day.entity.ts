import {
  ServiceDayAlreadyConfirmedError,
  ExpectedQuantityAlreadyConfirmedError,
  NoticePeriodExceededError,
  QuantityOutOfRangeError,
  InvalidServedQuantityError,
} from '../../../shared/domain/errors';

export type ServiceDayStatus = 'PENDING' | 'CONFIRMED';

/**
 * ServiceDay data interface (for persistence/transfer)
 * This is the "anemic" representation used by repositories
 */
export interface ServiceDayData {
  id: string;
  contractId: string;
  serviceDate: Date;
  expectedQuantity: number | null;
  servedQuantity: number | null;
  expectedConfirmedAt: Date | null;
  servedConfirmedAt: Date | null;
  status: ServiceDayStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Contract data needed for ServiceDay operations
 */
export interface ContractContext {
  cateringCompanyId: string;
  clientCompanyId: string;
  minDailyQuantity: number;
  maxDailyQuantity: number;
  noticePeriodHours: number;
}

/**
 * ServiceDay Entity - Rich domain model with behavior
 */
export class ServiceDayEntity {
  readonly id: string;
  readonly contractId: string;
  readonly serviceDate: Date;
  readonly createdAt: Date;

  private _expectedQuantity: number | null;
  private _servedQuantity: number | null;
  private _expectedConfirmedAt: Date | null;
  private _servedConfirmedAt: Date | null;
  private _status: ServiceDayStatus;
  private _updatedAt: Date;

  constructor(data: ServiceDayData) {
    this.id = data.id;
    this.contractId = data.contractId;
    this.serviceDate = data.serviceDate;
    this.createdAt = data.createdAt;
    this._expectedQuantity = data.expectedQuantity;
    this._servedQuantity = data.servedQuantity;
    this._expectedConfirmedAt = data.expectedConfirmedAt;
    this._servedConfirmedAt = data.servedConfirmedAt;
    this._status = data.status;
    this._updatedAt = data.updatedAt;
  }

  // ============ GETTERS ============

  get expectedQuantity(): number | null {
    return this._expectedQuantity;
  }

  get servedQuantity(): number | null {
    return this._servedQuantity;
  }

  get expectedConfirmedAt(): Date | null {
    return this._expectedConfirmedAt;
  }

  get servedConfirmedAt(): Date | null {
    return this._servedConfirmedAt;
  }

  get status(): ServiceDayStatus {
    return this._status;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // ============ DOMAIN METHODS ============

  /**
   * Confirm expected quantity (client operation)
   * @throws ExpectedQuantityAlreadyConfirmedError if already confirmed
   * @throws ServiceDayAlreadyConfirmedError if status is CONFIRMED
   * @throws NoticePeriodExceededError if past notice deadline
   * @throws QuantityOutOfRangeError if quantity outside min/max
   */
  confirmExpected(
    quantity: number,
    contract: ContractContext,
    now: Date,
  ): void {
    // Check immutability
    this.ensureExpectedNotConfirmed();

    // Check notice period
    this.ensureWithinNoticePeriod(contract.noticePeriodHours, now);

    // Check quantity range
    this.ensureQuantityInRange(
      quantity,
      contract.minDailyQuantity,
      contract.maxDailyQuantity,
    );

    // Apply changes
    this._expectedQuantity = quantity;
    this._expectedConfirmedAt = now;
    this._updatedAt = now;
  }

  /**
   * Confirm served quantity (catering operation)
   * @throws ServiceDayAlreadyConfirmedError if status is CONFIRMED
   * @throws InvalidServedQuantityError if quantity is negative
   */
  confirmServed(quantity: number, now: Date): void {
    // Check not already confirmed
    this.ensureNotConfirmed();

    // Check quantity is valid
    if (quantity < 0) {
      throw new InvalidServedQuantityError();
    }

    // Apply changes
    this._servedQuantity = quantity;
    this._servedConfirmedAt = now;
    this._status = 'CONFIRMED';
    this._updatedAt = now;
  }

  /**
   * Apply fallback quantity when client didn't confirm in time.
   * This is a system operation, not a user operation.
   *
   * @param minDailyQuantity The contract's minimum daily quantity
   * @param now Current timestamp
   * @returns true if fallback was applied, false if not eligible
   */
  applyFallback(minDailyQuantity: number, now: Date): boolean {
    // Cannot apply fallback if already confirmed
    if (this._status === 'CONFIRMED') {
      return false;
    }

    // Cannot apply fallback if expected quantity already set
    if (this._expectedQuantity !== null) {
      return false;
    }

    // Apply the minimum quantity as fallback
    this._expectedQuantity = minDailyQuantity;
    this._expectedConfirmedAt = now;
    this._updatedAt = now;

    return true;
  }

  /**
   * Check if this service day needs fallback applied.
   * Returns true if:
   * - expectedQuantity is null
   * - status is PENDING
   */
  needsFallback(): boolean {
    return this._expectedQuantity === null && this._status === 'PENDING';
  }

  // ============ GUARD METHODS ============

  /**
   * @throws ServiceDayAlreadyConfirmedError if status is CONFIRMED
   */
  ensureNotConfirmed(): void {
    if (this._status === 'CONFIRMED') {
      throw new ServiceDayAlreadyConfirmedError();
    }
  }

  /**
   * @throws ExpectedQuantityAlreadyConfirmedError if expectedConfirmedAt is set
   * @throws ServiceDayAlreadyConfirmedError if status is CONFIRMED
   */
  ensureExpectedNotConfirmed(): void {
    if (this._status === 'CONFIRMED') {
      throw new ServiceDayAlreadyConfirmedError();
    }
    if (this._expectedConfirmedAt !== null) {
      throw new ExpectedQuantityAlreadyConfirmedError();
    }
  }

  /**
   * @throws NoticePeriodExceededError if past deadline
   */
  ensureWithinNoticePeriod(noticePeriodHours: number, now: Date): void {
    const deadline = new Date(this.serviceDate);
    deadline.setHours(deadline.getHours() - noticePeriodHours);

    if (now > deadline) {
      throw new NoticePeriodExceededError(deadline, noticePeriodHours);
    }
  }

  /**
   * @throws QuantityOutOfRangeError if quantity outside range
   */
  ensureQuantityInRange(quantity: number, min: number, max: number): void {
    if (quantity < min || quantity > max) {
      throw new QuantityOutOfRangeError(min, max);
    }
  }

  // ============ SERIALIZATION ============

  toData(): ServiceDayData {
    return {
      id: this.id,
      contractId: this.contractId,
      serviceDate: this.serviceDate,
      expectedQuantity: this._expectedQuantity,
      servedQuantity: this._servedQuantity,
      expectedConfirmedAt: this._expectedConfirmedAt,
      servedConfirmedAt: this._servedConfirmedAt,
      status: this._status,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }

  /**
   * Create from persistence data
   */
  static fromData(data: ServiceDayData): ServiceDayEntity {
    return new ServiceDayEntity(data);
  }
}

// Backwards compatibility alias
export type ServiceDay = ServiceDayData;
