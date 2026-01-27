/**
 * Clock port for time-dependent operations.
 * Allows easy mocking in tests without Date hacks.
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');
