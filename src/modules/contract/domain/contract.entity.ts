import {
  ContractNotActiveError,
  NotAuthorizedError,
} from '../../../shared/domain/errors';

export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ContractStatus = 'ACTIVE' | 'PAUSED' | 'TERMINATED';

/**
 * Contract data interface (for persistence/transfer)
 */
export interface ContractData {
  id: string;
  cateringCompanyId: string;
  clientCompanyId: string;
  startDate: Date;
  endDate: Date | null;
  pricePerService: number;
  flexibleQuantity: boolean;
  minDailyQuantity: number;
  maxDailyQuantity: number;
  noticePeriodHours: number;
  serviceDays: DayOfWeek[];
  status: ContractStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Contract Entity - Rich domain model with behavior
 */
export class ContractEntity {
  readonly id: string;
  readonly cateringCompanyId: string;
  readonly clientCompanyId: string;
  readonly startDate: Date;
  readonly endDate: Date | null;
  readonly pricePerService: number;
  readonly flexibleQuantity: boolean;
  readonly minDailyQuantity: number;
  readonly maxDailyQuantity: number;
  readonly noticePeriodHours: number;
  readonly serviceDays: DayOfWeek[];
  readonly status: ContractStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(data: ContractData) {
    this.id = data.id;
    this.cateringCompanyId = data.cateringCompanyId;
    this.clientCompanyId = data.clientCompanyId;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.pricePerService = data.pricePerService;
    this.flexibleQuantity = data.flexibleQuantity;
    this.minDailyQuantity = data.minDailyQuantity;
    this.maxDailyQuantity = data.maxDailyQuantity;
    this.noticePeriodHours = data.noticePeriodHours;
    this.serviceDays = data.serviceDays;
    this.status = data.status;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  // ============ GUARD METHODS ============

  /**
   * @throws ContractNotActiveError if status is not ACTIVE
   */
  ensureActive(): void {
    if (this.status !== 'ACTIVE') {
      throw new ContractNotActiveError(this.status);
    }
  }

  /**
   * @throws NotAuthorizedError if companyId is not the client
   */
  ensureClientAuthorized(companyId: string): void {
    if (this.clientCompanyId !== companyId) {
      throw new NotAuthorizedError(
        'Only the client company can perform this operation',
      );
    }
  }

  /**
   * @throws NotAuthorizedError if companyId is not the catering
   */
  ensureCateringAuthorized(companyId: string): void {
    if (this.cateringCompanyId !== companyId) {
      throw new NotAuthorizedError(
        'Only the catering company can perform this operation',
      );
    }
  }

  /**
   * Check if company is party to this contract
   */
  isParty(companyId: string): boolean {
    return (
      this.cateringCompanyId === companyId || this.clientCompanyId === companyId
    );
  }

  // ============ SERIALIZATION ============

  toData(): ContractData {
    return {
      id: this.id,
      cateringCompanyId: this.cateringCompanyId,
      clientCompanyId: this.clientCompanyId,
      startDate: this.startDate,
      endDate: this.endDate,
      pricePerService: this.pricePerService,
      flexibleQuantity: this.flexibleQuantity,
      minDailyQuantity: this.minDailyQuantity,
      maxDailyQuantity: this.maxDailyQuantity,
      noticePeriodHours: this.noticePeriodHours,
      serviceDays: this.serviceDays,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  static fromData(data: ContractData): ContractEntity {
    return new ContractEntity(data);
  }
}

// Backwards compatibility alias
export type Contract = ContractData;
