import { ContractStatus } from './contract.entity';

/**
 * Domain rules for Contract entity.
 * Pure functions that encapsulate business logic without infrastructure dependencies.
 */

// ============ QUANTITY RULES ============

export interface QuantityRange {
  minDailyQuantity: number;
  maxDailyQuantity: number;
}

export function isValidQuantityRange(range: QuantityRange): boolean {
  return range.minDailyQuantity <= range.maxDailyQuantity;
}

export function isQuantityWithinRange(
  quantity: number,
  range: QuantityRange,
): boolean {
  return (
    quantity >= range.minDailyQuantity && quantity <= range.maxDailyQuantity
  );
}

// ============ STATUS STATE MACHINE ============

/**
 * Contract status transitions:
 * - ACTIVE -> PAUSED (pause)
 * - ACTIVE -> TERMINATED (terminate)
 * - PAUSED -> ACTIVE (resume)
 * - PAUSED -> TERMINATED (terminate)
 * - TERMINATED -> (no transitions allowed)
 */

export type ContractAction = 'pause' | 'resume' | 'terminate';

const VALID_TRANSITIONS: Record<ContractStatus, ContractAction[]> = {
  ACTIVE: ['pause', 'terminate'],
  PAUSED: ['resume', 'terminate'],
  TERMINATED: [],
};

export function canTransition(
  currentStatus: ContractStatus,
  action: ContractAction,
): boolean {
  return VALID_TRANSITIONS[currentStatus].includes(action);
}

export function getNextStatus(
  currentStatus: ContractStatus,
  action: ContractAction,
): ContractStatus | null {
  if (!canTransition(currentStatus, action)) {
    return null;
  }

  switch (action) {
    case 'pause':
      return 'PAUSED';
    case 'resume':
      return 'ACTIVE';
    case 'terminate':
      return 'TERMINATED';
  }
}

export function getInvalidTransitionReason(
  currentStatus: ContractStatus,
  action: ContractAction,
): string | null {
  if (canTransition(currentStatus, action)) {
    return null;
  }

  if (currentStatus === 'TERMINATED') {
    return `Cannot ${action} a terminated contract`;
  }

  if (currentStatus === 'PAUSED' && action === 'pause') {
    return 'Contract is already paused';
  }

  if (currentStatus === 'ACTIVE' && action === 'resume') {
    return 'Contract is already active';
  }

  return `Cannot ${action} contract with status ${currentStatus}`;
}

// ============ COMPANY VALIDATION ============

export type CompanyType = 'CATERING' | 'CLIENT';
export type CompanyStatus = 'ACTIVE' | 'INACTIVE';

export interface CompanyInfo {
  id: string;
  name: string;
  companyType: CompanyType;
  status: CompanyStatus;
}

export interface CompanyValidationResult {
  valid: boolean;
  error?: string;
}

export function validateCateringCompany(
  company: CompanyInfo | null,
  companyId: string,
): CompanyValidationResult {
  if (!company) {
    return { valid: false, error: `Catering company #${companyId} not found` };
  }

  if (company.companyType !== 'CATERING') {
    return {
      valid: false,
      error: `Company "${company.name}" is not a catering company`,
    };
  }

  if (company.status !== 'ACTIVE') {
    return {
      valid: false,
      error: `Catering company "${company.name}" is not active`,
    };
  }

  return { valid: true };
}

export function validateClientCompany(
  company: CompanyInfo | null,
  companyId: string,
): CompanyValidationResult {
  if (!company) {
    return { valid: false, error: `Client company #${companyId} not found` };
  }

  if (company.companyType !== 'CLIENT') {
    return {
      valid: false,
      error: `Company "${company.name}" is not a client company`,
    };
  }

  if (company.status !== 'ACTIVE') {
    return {
      valid: false,
      error: `Client company "${company.name}" is not active`,
    };
  }

  return { valid: true };
}
