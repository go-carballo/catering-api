import { describe, it, expect } from 'vitest';
import {
  todayUTC,
  toUTCMidnight,
  addDays,
  getUTCDayOfWeek,
  getUTCDayName,
  formatISODate,
  parseISODate,
  isSameDay,
  isBefore,
  isAfter,
  isWithinRange,
} from './date.utils';

describe('Date Utils', () => {
  describe('todayUTC', () => {
    it('should return a date at UTC midnight', () => {
      const today = todayUTC();
      expect(today.getUTCHours()).toBe(0);
      expect(today.getUTCMinutes()).toBe(0);
      expect(today.getUTCSeconds()).toBe(0);
      expect(today.getUTCMilliseconds()).toBe(0);
    });
  });

  describe('toUTCMidnight', () => {
    it('should normalize a date to UTC midnight', () => {
      const date = new Date('2026-01-20T15:30:45.123Z');
      const midnight = toUTCMidnight(date);

      expect(midnight.getUTCFullYear()).toBe(2026);
      expect(midnight.getUTCMonth()).toBe(0); // January
      expect(midnight.getUTCDate()).toBe(20);
      expect(midnight.getUTCHours()).toBe(0);
      expect(midnight.getUTCMinutes()).toBe(0);
      expect(midnight.getUTCSeconds()).toBe(0);
    });

    it('should handle dates with different times', () => {
      const earlyMorning = new Date('2026-01-20T01:00:00Z');
      const lateNight = new Date('2026-01-20T23:59:59Z');

      expect(toUTCMidnight(earlyMorning).getTime()).toBe(
        toUTCMidnight(lateNight).getTime(),
      );
    });
  });

  describe('addDays', () => {
    it('should add positive days', () => {
      const date = new Date('2026-01-20T00:00:00Z');
      const result = addDays(date, 5);

      expect(result.getUTCDate()).toBe(25);
      expect(result.getUTCMonth()).toBe(0); // January
    });

    it('should handle month boundary', () => {
      const date = new Date('2026-01-30T00:00:00Z');
      const result = addDays(date, 3);

      expect(result.getUTCDate()).toBe(2);
      expect(result.getUTCMonth()).toBe(1); // February
    });

    it('should handle negative days', () => {
      const date = new Date('2026-01-20T00:00:00Z');
      const result = addDays(date, -5);

      expect(result.getUTCDate()).toBe(15);
    });

    it('should not modify the original date', () => {
      const date = new Date('2026-01-20T00:00:00Z');
      const originalTime = date.getTime();
      addDays(date, 5);

      expect(date.getTime()).toBe(originalTime);
    });
  });

  describe('getUTCDayOfWeek', () => {
    it('should return correct day of week', () => {
      // 2026-01-19 is a Monday (should return 1)
      const monday = new Date('2026-01-19T12:00:00Z');
      expect(getUTCDayOfWeek(monday)).toBe(1);

      // 2026-01-25 is a Sunday (should return 0)
      const sunday = new Date('2026-01-25T12:00:00Z');
      expect(getUTCDayOfWeek(sunday)).toBe(0);

      // 2026-01-24 is a Saturday (should return 6)
      const saturday = new Date('2026-01-24T12:00:00Z');
      expect(getUTCDayOfWeek(saturday)).toBe(6);
    });
  });

  describe('getUTCDayName', () => {
    it('should return correct day name', () => {
      expect(getUTCDayName(new Date('2026-01-18T12:00:00Z'))).toBe('Sun');
      expect(getUTCDayName(new Date('2026-01-19T12:00:00Z'))).toBe('Mon');
      expect(getUTCDayName(new Date('2026-01-20T12:00:00Z'))).toBe('Tue');
      expect(getUTCDayName(new Date('2026-01-21T12:00:00Z'))).toBe('Wed');
      expect(getUTCDayName(new Date('2026-01-22T12:00:00Z'))).toBe('Thu');
      expect(getUTCDayName(new Date('2026-01-23T12:00:00Z'))).toBe('Fri');
      expect(getUTCDayName(new Date('2026-01-24T12:00:00Z'))).toBe('Sat');
    });

    it('should be consistent regardless of time', () => {
      const midnight = new Date('2026-01-19T00:00:00Z');
      const noon = new Date('2026-01-19T12:00:00Z');
      const lateNight = new Date('2026-01-19T23:59:59Z');

      expect(getUTCDayName(midnight)).toBe('Mon');
      expect(getUTCDayName(noon)).toBe('Mon');
      expect(getUTCDayName(lateNight)).toBe('Mon');
    });
  });

  describe('formatISODate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date('2026-01-20T15:30:00Z');
      expect(formatISODate(date)).toBe('2026-01-20');
    });

    it('should pad single digit months and days', () => {
      const date = new Date('2026-03-05T00:00:00Z');
      expect(formatISODate(date)).toBe('2026-03-05');
    });
  });

  describe('parseISODate', () => {
    it('should parse YYYY-MM-DD string to UTC midnight', () => {
      const date = parseISODate('2026-01-20');

      expect(date.getUTCFullYear()).toBe(2026);
      expect(date.getUTCMonth()).toBe(0); // January
      expect(date.getUTCDate()).toBe(20);
      expect(date.getUTCHours()).toBe(0);
      expect(date.getUTCMinutes()).toBe(0);
    });

    it('should roundtrip with formatISODate', () => {
      const original = '2026-07-15';
      const date = parseISODate(original);
      const formatted = formatISODate(date);

      expect(formatted).toBe(original);
    });
  });

  describe('isSameDay', () => {
    it('should return true for same calendar day', () => {
      const a = new Date('2026-01-20T01:00:00Z');
      const b = new Date('2026-01-20T23:59:59Z');

      expect(isSameDay(a, b)).toBe(true);
    });

    it('should return false for different calendar days', () => {
      const a = new Date('2026-01-20T23:59:59Z');
      const b = new Date('2026-01-21T00:00:00Z');

      expect(isSameDay(a, b)).toBe(false);
    });
  });

  describe('isBefore', () => {
    it('should compare calendar days correctly', () => {
      const earlier = new Date('2026-01-19T23:00:00Z');
      const later = new Date('2026-01-20T01:00:00Z');

      expect(isBefore(earlier, later)).toBe(true);
      expect(isBefore(later, earlier)).toBe(false);
    });

    it('should return false for same day', () => {
      const a = new Date('2026-01-20T01:00:00Z');
      const b = new Date('2026-01-20T23:00:00Z');

      expect(isBefore(a, b)).toBe(false);
    });
  });

  describe('isAfter', () => {
    it('should compare calendar days correctly', () => {
      const earlier = new Date('2026-01-19T23:00:00Z');
      const later = new Date('2026-01-20T01:00:00Z');

      expect(isAfter(later, earlier)).toBe(true);
      expect(isAfter(earlier, later)).toBe(false);
    });

    it('should return false for same day', () => {
      const a = new Date('2026-01-20T01:00:00Z');
      const b = new Date('2026-01-20T23:00:00Z');

      expect(isAfter(a, b)).toBe(false);
    });
  });

  describe('isWithinRange', () => {
    it('should return true for date within range', () => {
      const date = new Date('2026-01-22T12:00:00Z');
      const from = new Date('2026-01-20T00:00:00Z');
      const to = new Date('2026-01-25T00:00:00Z');

      expect(isWithinRange(date, from, to)).toBe(true);
    });

    it('should return true for date at range boundaries', () => {
      const from = new Date('2026-01-20T00:00:00Z');
      const to = new Date('2026-01-25T00:00:00Z');

      // Date at start of range
      expect(isWithinRange(new Date('2026-01-20T15:00:00Z'), from, to)).toBe(
        true,
      );

      // Date at end of range
      expect(isWithinRange(new Date('2026-01-25T05:00:00Z'), from, to)).toBe(
        true,
      );
    });

    it('should return false for date outside range', () => {
      const from = new Date('2026-01-20T00:00:00Z');
      const to = new Date('2026-01-25T00:00:00Z');

      // Before range
      expect(isWithinRange(new Date('2026-01-19T23:59:59Z'), from, to)).toBe(
        false,
      );

      // After range
      expect(isWithinRange(new Date('2026-01-26T00:00:00Z'), from, to)).toBe(
        false,
      );
    });
  });
});
