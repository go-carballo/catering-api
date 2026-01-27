import { describe, it, expect } from 'vitest';
import {
  getHoursUntilService,
  isWithinNoticePeriod,
  getNoticePeriodDeadline,
  canConfirmExpected,
  canConfirmServed,
  getConfirmExpectedError,
  getConfirmServedError,
  canClientConfirmExpected,
  canCateringConfirmServed,
  canViewReport,
  toIsoDayOfWeek,
  isServiceDay,
  getServiceDatesInRange,
  calculateServiceDayCost,
  calculateWeeklyCost,
  isEligibleForFallback,
  getExpectedConfirmationDeadline,
  type DayOfWeek,
} from './service-day.rules';

describe('ServiceDay Domain Rules', () => {
  // ============ NOTICE PERIOD RULES ============

  describe('getHoursUntilService', () => {
    it('should calculate hours correctly', () => {
      const serviceDate = new Date('2026-01-25T12:00:00Z');
      const currentTime = new Date('2026-01-24T12:00:00Z');

      const hours = getHoursUntilService({
        serviceDate,
        noticePeriodHours: 24,
        currentTime,
      });

      expect(hours).toBe(24);
    });

    it('should handle negative hours (past service date)', () => {
      const serviceDate = new Date('2026-01-23T12:00:00Z');
      const currentTime = new Date('2026-01-24T12:00:00Z');

      const hours = getHoursUntilService({
        serviceDate,
        noticePeriodHours: 24,
        currentTime,
      });

      expect(hours).toBe(-24);
    });

    it('should handle fractional hours', () => {
      const serviceDate = new Date('2026-01-24T14:30:00Z');
      const currentTime = new Date('2026-01-24T12:00:00Z');

      const hours = getHoursUntilService({
        serviceDate,
        noticePeriodHours: 2,
        currentTime,
      });

      expect(hours).toBe(2.5);
    });
  });

  describe('isWithinNoticePeriod', () => {
    it('should return true when enough time before service', () => {
      const result = isWithinNoticePeriod({
        serviceDate: new Date('2026-01-26T12:00:00Z'),
        noticePeriodHours: 24,
        currentTime: new Date('2026-01-24T12:00:00Z'),
      });

      expect(result).toBe(true);
    });

    it('should return true when exactly at notice period', () => {
      const result = isWithinNoticePeriod({
        serviceDate: new Date('2026-01-25T12:00:00Z'),
        noticePeriodHours: 24,
        currentTime: new Date('2026-01-24T12:00:00Z'),
      });

      expect(result).toBe(true);
    });

    it('should return false when past notice period', () => {
      const result = isWithinNoticePeriod({
        serviceDate: new Date('2026-01-25T12:00:00Z'),
        noticePeriodHours: 24,
        currentTime: new Date('2026-01-24T13:00:00Z'),
      });

      expect(result).toBe(false);
    });
  });

  describe('getNoticePeriodDeadline', () => {
    it('should calculate deadline correctly', () => {
      const serviceDate = new Date('2026-01-25T12:00:00Z');
      const deadline = getNoticePeriodDeadline(serviceDate, 24);

      expect(deadline.toISOString()).toBe('2026-01-24T12:00:00.000Z');
    });

    it('should handle 48 hour notice period', () => {
      const serviceDate = new Date('2026-01-25T10:00:00Z');
      const deadline = getNoticePeriodDeadline(serviceDate, 48);

      expect(deadline.toISOString()).toBe('2026-01-23T10:00:00.000Z');
    });
  });

  // ============ IMMUTABILITY RULES ============

  describe('canConfirmExpected', () => {
    it('should return true for PENDING status with no prior confirmation', () => {
      expect(
        canConfirmExpected({ status: 'PENDING', expectedConfirmedAt: null }),
      ).toBe(true);
    });

    it('should return false for CONFIRMED status', () => {
      expect(
        canConfirmExpected({ status: 'CONFIRMED', expectedConfirmedAt: null }),
      ).toBe(false);
    });

    it('should return false when already confirmed (immutability)', () => {
      expect(
        canConfirmExpected({
          status: 'PENDING',
          expectedConfirmedAt: new Date(),
        }),
      ).toBe(false);
    });
  });

  describe('canConfirmServed', () => {
    it('should return true for PENDING status', () => {
      expect(
        canConfirmServed({ status: 'PENDING', expectedConfirmedAt: null }),
      ).toBe(true);
    });

    it('should return false for CONFIRMED status', () => {
      expect(
        canConfirmServed({ status: 'CONFIRMED', expectedConfirmedAt: null }),
      ).toBe(false);
    });
  });

  describe('getConfirmExpectedError', () => {
    it('should return null when confirmation is allowed', () => {
      expect(
        getConfirmExpectedError({
          status: 'PENDING',
          expectedConfirmedAt: null,
        }),
      ).toBeNull();
    });

    it('should return error for already confirmed status', () => {
      expect(
        getConfirmExpectedError({
          status: 'CONFIRMED',
          expectedConfirmedAt: null,
        }),
      ).toBe('ServiceDay is already confirmed');
    });

    it('should return error for immutability violation', () => {
      expect(
        getConfirmExpectedError({
          status: 'PENDING',
          expectedConfirmedAt: new Date(),
        }),
      ).toBe(
        'Expected quantity has already been confirmed and cannot be changed',
      );
    });
  });

  describe('getConfirmServedError', () => {
    it('should return null when confirmation is allowed', () => {
      expect(
        getConfirmServedError({ status: 'PENDING', expectedConfirmedAt: null }),
      ).toBeNull();
    });

    it('should return error for already confirmed status', () => {
      expect(
        getConfirmServedError({
          status: 'CONFIRMED',
          expectedConfirmedAt: null,
        }),
      ).toBe('ServiceDay is already confirmed');
    });
  });

  // ============ AUTHORIZATION RULES ============

  describe('canClientConfirmExpected', () => {
    const parties = {
      cateringCompanyId: 'catering-1',
      clientCompanyId: 'client-1',
    };

    it('should return true for client company', () => {
      expect(canClientConfirmExpected(parties, 'client-1')).toBe(true);
    });

    it('should return false for catering company', () => {
      expect(canClientConfirmExpected(parties, 'catering-1')).toBe(false);
    });

    it('should return false for unrelated company', () => {
      expect(canClientConfirmExpected(parties, 'other-company')).toBe(false);
    });
  });

  describe('canCateringConfirmServed', () => {
    const parties = {
      cateringCompanyId: 'catering-1',
      clientCompanyId: 'client-1',
    };

    it('should return true for catering company', () => {
      expect(canCateringConfirmServed(parties, 'catering-1')).toBe(true);
    });

    it('should return false for client company', () => {
      expect(canCateringConfirmServed(parties, 'client-1')).toBe(false);
    });

    it('should return false for unrelated company', () => {
      expect(canCateringConfirmServed(parties, 'other-company')).toBe(false);
    });
  });

  describe('canViewReport', () => {
    const parties = {
      cateringCompanyId: 'catering-1',
      clientCompanyId: 'client-1',
    };

    it('should return true for catering company', () => {
      expect(canViewReport(parties, 'catering-1')).toBe(true);
    });

    it('should return true for client company', () => {
      expect(canViewReport(parties, 'client-1')).toBe(true);
    });

    it('should return false for unrelated company', () => {
      expect(canViewReport(parties, 'other-company')).toBe(false);
    });
  });

  // ============ DAY OF WEEK RULES ============

  describe('toIsoDayOfWeek', () => {
    it('should convert Monday (JS day 1) to ISO 1', () => {
      const monday = new Date('2026-01-19T12:00:00Z'); // Monday
      expect(toIsoDayOfWeek(monday)).toBe(1);
    });

    it('should convert Sunday (JS day 0) to ISO 7', () => {
      const sunday = new Date('2026-01-25T12:00:00Z'); // Sunday
      expect(toIsoDayOfWeek(sunday)).toBe(7);
    });

    it('should convert Saturday (JS day 6) to ISO 6', () => {
      const saturday = new Date('2026-01-24T12:00:00Z'); // Saturday
      expect(toIsoDayOfWeek(saturday)).toBe(6);
    });

    it('should convert Wednesday (JS day 3) to ISO 3', () => {
      const wednesday = new Date('2026-01-21T12:00:00Z'); // Wednesday
      expect(toIsoDayOfWeek(wednesday)).toBe(3);
    });
  });

  describe('isServiceDay', () => {
    const weekdayServiceDays: DayOfWeek[] = [1, 2, 3, 4, 5]; // Mon-Fri

    it('should return true for Monday when Mon-Fri are service days', () => {
      const monday = new Date('2026-01-19T12:00:00Z');
      expect(isServiceDay(monday, weekdayServiceDays)).toBe(true);
    });

    it('should return false for Saturday when Mon-Fri are service days', () => {
      const saturday = new Date('2026-01-24T12:00:00Z');
      expect(isServiceDay(saturday, weekdayServiceDays)).toBe(false);
    });

    it('should return false for Sunday when Mon-Fri are service days', () => {
      const sunday = new Date('2026-01-25T12:00:00Z');
      expect(isServiceDay(sunday, weekdayServiceDays)).toBe(false);
    });
  });

  describe('getServiceDatesInRange', () => {
    it('should return all weekdays in a week', () => {
      const from = new Date('2026-01-19T12:00:00Z'); // Monday
      const to = new Date('2026-01-25T12:00:00Z'); // Sunday
      const serviceDays: DayOfWeek[] = [1, 2, 3, 4, 5];

      const dates = getServiceDatesInRange(from, to, serviceDays);

      expect(dates).toHaveLength(5);
    });

    it('should return only MWF when specified', () => {
      const from = new Date('2026-01-19T12:00:00Z'); // Monday
      const to = new Date('2026-01-25T12:00:00Z'); // Sunday
      const serviceDays: DayOfWeek[] = [1, 3, 5]; // Mon, Wed, Fri

      const dates = getServiceDatesInRange(from, to, serviceDays);

      expect(dates).toHaveLength(3);
    });

    it('should return empty array when no service days match', () => {
      const from = new Date('2026-01-24T12:00:00Z'); // Saturday
      const to = new Date('2026-01-24T23:59:59Z'); // Saturday (same day)
      const serviceDays: DayOfWeek[] = [1, 2, 3, 4, 5]; // Weekdays only

      const dates = getServiceDatesInRange(from, to, serviceDays);

      expect(dates).toHaveLength(0);
    });
  });

  // ============ COST CALCULATION ============

  describe('calculateServiceDayCost', () => {
    it('should calculate cost correctly', () => {
      expect(calculateServiceDayCost(10, 15.5)).toBe(155);
    });

    it('should return 0 for null servedQuantity', () => {
      expect(calculateServiceDayCost(null, 15.5)).toBe(0);
    });

    it('should return 0 for zero quantity', () => {
      expect(calculateServiceDayCost(0, 15.5)).toBe(0);
    });
  });

  describe('calculateWeeklyCost', () => {
    it('should sum costs for all service days', () => {
      const days = [
        { servedQuantity: 10 },
        { servedQuantity: 15 },
        { servedQuantity: 12 },
      ];
      const pricePerService = 10;

      expect(calculateWeeklyCost(days, pricePerService)).toBe(370);
    });

    it('should handle null served quantities', () => {
      const days = [
        { servedQuantity: 10 },
        { servedQuantity: null },
        { servedQuantity: 12 },
      ];
      const pricePerService = 10;

      expect(calculateWeeklyCost(days, pricePerService)).toBe(220);
    });

    it('should return 0 for empty array', () => {
      expect(calculateWeeklyCost([], 10)).toBe(0);
    });
  });

  // ============ FALLBACK RULES ============

  describe('isEligibleForFallback', () => {
    it('should return true when deadline passed and no expected quantity', () => {
      const serviceDate = new Date('2026-01-20T10:00:00Z');
      const currentTime = new Date('2026-01-20T12:00:00Z'); // After service time

      const result = isEligibleForFallback({
        expectedQuantity: null,
        expectedConfirmedAt: null,
        status: 'PENDING',
        serviceDate,
        noticePeriodHours: 24,
        currentTime,
      });

      expect(result).toBe(true);
    });

    it('should return false when expected quantity already set', () => {
      const serviceDate = new Date('2026-01-20T10:00:00Z');
      const currentTime = new Date('2026-01-20T12:00:00Z');

      const result = isEligibleForFallback({
        expectedQuantity: 50,
        expectedConfirmedAt: null,
        status: 'PENDING',
        serviceDate,
        noticePeriodHours: 24,
        currentTime,
      });

      expect(result).toBe(false);
    });

    it('should return false when status is CONFIRMED', () => {
      const serviceDate = new Date('2026-01-20T10:00:00Z');
      const currentTime = new Date('2026-01-20T12:00:00Z');

      const result = isEligibleForFallback({
        expectedQuantity: null,
        expectedConfirmedAt: null,
        status: 'CONFIRMED',
        serviceDate,
        noticePeriodHours: 24,
        currentTime,
      });

      expect(result).toBe(false);
    });

    it('should return false when deadline has not passed yet', () => {
      const serviceDate = new Date('2026-01-25T10:00:00Z'); // 5 days in future
      const currentTime = new Date('2026-01-20T10:00:00Z');

      const result = isEligibleForFallback({
        expectedQuantity: null,
        expectedConfirmedAt: null,
        status: 'PENDING',
        serviceDate,
        noticePeriodHours: 24, // deadline is 2026-01-24T10:00:00Z
        currentTime,
      });

      expect(result).toBe(false);
    });

    it('should return true exactly at deadline', () => {
      const serviceDate = new Date('2026-01-20T10:00:00Z');
      // Deadline is serviceDate - 24h = 2026-01-19T10:00:00Z
      const currentTime = new Date('2026-01-19T10:00:01Z'); // 1 second after deadline

      const result = isEligibleForFallback({
        expectedQuantity: null,
        expectedConfirmedAt: null,
        status: 'PENDING',
        serviceDate,
        noticePeriodHours: 24,
        currentTime,
      });

      expect(result).toBe(true);
    });

    it('should handle different notice periods (48h)', () => {
      const serviceDate = new Date('2026-01-22T10:00:00Z');
      // Deadline is serviceDate - 48h = 2026-01-20T10:00:00Z
      const currentTime = new Date('2026-01-20T12:00:00Z'); // 2h after deadline

      const result = isEligibleForFallback({
        expectedQuantity: null,
        expectedConfirmedAt: null,
        status: 'PENDING',
        serviceDate,
        noticePeriodHours: 48,
        currentTime,
      });

      expect(result).toBe(true);
    });
  });

  describe('getExpectedConfirmationDeadline', () => {
    it('should return deadline 24h before service date', () => {
      const serviceDate = new Date('2026-01-25T10:00:00Z');
      const deadline = getExpectedConfirmationDeadline(serviceDate, 24);

      expect(deadline).toEqual(new Date('2026-01-24T10:00:00Z'));
    });

    it('should return deadline 48h before service date', () => {
      const serviceDate = new Date('2026-01-25T10:00:00Z');
      const deadline = getExpectedConfirmationDeadline(serviceDate, 48);

      expect(deadline).toEqual(new Date('2026-01-23T10:00:00Z'));
    });
  });
});
