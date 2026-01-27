import { ServiceDayStatus } from './service-day.entity';

/**
 * Domain rules for ServiceDay entity.
 * Pure functions that encapsulate business logic without infrastructure dependencies.
 */

// ============ NOTICE PERIOD RULES ============

export interface NoticePeriodParams {
  serviceDate: Date;
  noticePeriodHours: number;
  currentTime?: Date; // defaults to now
}

export function getHoursUntilService(params: NoticePeriodParams): number {
  const now = params.currentTime ?? new Date();
  const serviceDateTime = new Date(params.serviceDate);
  return (serviceDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
}

export function isWithinNoticePeriod(params: NoticePeriodParams): boolean {
  const hoursUntil = getHoursUntilService(params);
  return hoursUntil >= params.noticePeriodHours;
}

export function getNoticePeriodDeadline(
  serviceDate: Date,
  noticePeriodHours: number,
): Date {
  const deadline = new Date(serviceDate);
  deadline.setHours(deadline.getHours() - noticePeriodHours);
  return deadline;
}

// ============ IMMUTABILITY RULES ============

export interface ServiceDayState {
  status: ServiceDayStatus;
  expectedConfirmedAt: Date | null;
}

export function canConfirmExpected(state: ServiceDayState): boolean {
  // Cannot confirm if already CONFIRMED
  if (state.status === 'CONFIRMED') {
    return false;
  }
  // Cannot change once expectedConfirmedAt is set (immutability)
  if (state.expectedConfirmedAt !== null) {
    return false;
  }
  return true;
}

export function canConfirmServed(state: ServiceDayState): boolean {
  return state.status !== 'CONFIRMED';
}

export function getConfirmExpectedError(state: ServiceDayState): string | null {
  if (state.status === 'CONFIRMED') {
    return 'ServiceDay is already confirmed';
  }
  if (state.expectedConfirmedAt !== null) {
    return 'Expected quantity has already been confirmed and cannot be changed';
  }
  return null;
}

export function getConfirmServedError(state: ServiceDayState): string | null {
  if (state.status === 'CONFIRMED') {
    return 'ServiceDay is already confirmed';
  }
  return null;
}

// ============ AUTHORIZATION RULES ============

export interface ContractParties {
  cateringCompanyId: string;
  clientCompanyId: string;
}

export function canClientConfirmExpected(
  parties: ContractParties,
  companyId: string,
): boolean {
  return parties.clientCompanyId === companyId;
}

export function canCateringConfirmServed(
  parties: ContractParties,
  companyId: string,
): boolean {
  return parties.cateringCompanyId === companyId;
}

export function canViewReport(
  parties: ContractParties,
  companyId: string,
): boolean {
  return (
    parties.cateringCompanyId === companyId ||
    parties.clientCompanyId === companyId
  );
}

// ============ DAY OF WEEK RULES ============

export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Convert JS Date.getDay() (0=Sun, 6=Sat) to ISO 8601 (1=Mon, 7=Sun)
 */
export function toIsoDayOfWeek(date: Date): DayOfWeek {
  const jsDay = date.getDay();
  return (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
}

export function isServiceDay(date: Date, serviceDays: DayOfWeek[]): boolean {
  const dow = toIsoDayOfWeek(date);
  return serviceDays.includes(dow);
}

/**
 * Get all dates in a range that match the given service days
 */
export function getServiceDatesInRange(
  from: Date,
  to: Date,
  serviceDays: DayOfWeek[],
): Date[] {
  const dates: Date[] = [];
  const current = new Date(from);

  while (current <= to) {
    if (isServiceDay(current, serviceDays)) {
      dates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

// ============ FALLBACK RULES ============

export interface FallbackEligibilityParams {
  expectedQuantity: number | null;
  expectedConfirmedAt: Date | null;
  status: ServiceDayStatus;
  serviceDate: Date;
  noticePeriodHours: number;
  currentTime?: Date;
}

/**
 * Determines if a ServiceDay is eligible for fallback (auto-set to min quantity).
 * A ServiceDay is eligible when:
 * 1. expectedQuantity is not yet set
 * 2. The notice period deadline has passed
 * 3. The status is still PENDING
 */
export function isEligibleForFallback(
  params: FallbackEligibilityParams,
): boolean {
  // Already has expected quantity - not eligible
  if (params.expectedQuantity !== null) {
    return false;
  }

  // Already confirmed - not eligible
  if (params.status === 'CONFIRMED') {
    return false;
  }

  // Check if deadline has passed
  const deadline = getNoticePeriodDeadline(
    params.serviceDate,
    params.noticePeriodHours,
  );
  const now = params.currentTime ?? new Date();

  // Eligible only if we're past the deadline
  return now > deadline;
}

/**
 * Get the deadline by which expected quantity must be confirmed.
 * After this deadline, fallback to min_daily_quantity applies.
 */
export function getExpectedConfirmationDeadline(
  serviceDate: Date,
  noticePeriodHours: number,
): Date {
  return getNoticePeriodDeadline(serviceDate, noticePeriodHours);
}

// ============ COST CALCULATION ============

export function calculateServiceDayCost(
  servedQuantity: number | null,
  pricePerService: number,
): number {
  return (servedQuantity ?? 0) * pricePerService;
}

export function calculateWeeklyCost(
  serviceDays: Array<{ servedQuantity: number | null }>,
  pricePerService: number,
): number {
  return serviceDays.reduce(
    (total, day) =>
      total + calculateServiceDayCost(day.servedQuantity, pricePerService),
    0,
  );
}
