/**
 * Date utilities for consistent UTC date handling.
 *
 * IMPORTANT: All date operations in this application should use UTC
 * to avoid timezone-related bugs. Service days are date-based (no time),
 * so we normalize everything to UTC midnight.
 *
 * Why UTC?
 * - Server may run in any timezone (cloud deployments)
 * - Business operates in a specific timezone (e.g., Argentina UTC-3)
 * - Using UTC everywhere + converting at the edges avoids date drift
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Get today's date at UTC midnight (00:00:00.000Z)
 */
export function todayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Get a date at UTC midnight
 */
export function toUTCMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * Add days to a date (preserves UTC midnight)
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Get the day of week (0 = Sunday, 6 = Saturday) in UTC
 */
export function getUTCDayOfWeek(date: Date): number {
  return date.getUTCDay();
}

/**
 * Get short day name (Sun, Mon, Tue, etc.) in UTC
 */
export function getUTCDayName(date: Date): string {
  return DAY_NAMES[date.getUTCDay()];
}

/**
 * Format date as ISO date string (YYYY-MM-DD)
 */
export function formatISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse an ISO date string to a Date at UTC midnight
 */
export function parseISODate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Check if two dates represent the same calendar day (UTC)
 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Check if date a is before date b (comparing calendar days in UTC)
 */
export function isBefore(a: Date, b: Date): boolean {
  const aMidnight = toUTCMidnight(a);
  const bMidnight = toUTCMidnight(b);
  return aMidnight.getTime() < bMidnight.getTime();
}

/**
 * Check if date a is after date b (comparing calendar days in UTC)
 */
export function isAfter(a: Date, b: Date): boolean {
  const aMidnight = toUTCMidnight(a);
  const bMidnight = toUTCMidnight(b);
  return aMidnight.getTime() > bMidnight.getTime();
}

/**
 * Check if a date falls within a range (inclusive, comparing calendar days in UTC)
 */
export function isWithinRange(date: Date, from: Date, to: Date): boolean {
  const dateMidnight = toUTCMidnight(date);
  const fromMidnight = toUTCMidnight(from);
  const toMidnight = toUTCMidnight(to);
  return (
    dateMidnight.getTime() >= fromMidnight.getTime() &&
    dateMidnight.getTime() <= toMidnight.getTime()
  );
}
